import "server-only";
import { randomUUID } from "node:crypto";
import type { Transaction, Client } from "@libsql/client";
import type { User } from "../types";
import { allowedLinks, type Artifact } from "../artifact-types";
import { HttpError } from "../auth";
import {
  projectAccess,
  validateArtifactInput,
  toArtifact,
  persistArtifactRow,
  syncArtifactLinks,
  recordArtifactChange,
} from "../artifacts";
import { prepareStructure, validateProjectGraph } from "../artifact-validation";
import { requireProjectPermission } from "../project-permissions";
import type { DatabaseBatchItem } from "./database-batch";
import {
  hasPreparedDatabaseInput,
  preparedDatabaseInput,
} from "../database-domain-generation";
import { domainCatalog } from "../database-domains";

// Validate the entire graph with the normal field/FK validators before writing.
// Aliases are resolved afresh on commit; only server IDs reach persistence/history.
export async function applyDatabaseBatch(
  request: Request,
  user: User,
  projectId: string,
  items: DatabaseBatchItem[],
  tx: Transaction,
  checkpoint?: (executor?: Pick<Client, "execute">) => Promise<void>,
) {
  await projectAccess(tx, user, projectId, true);
  await requireProjectPermission(tx, user, projectId, "database", "CREATE");
  const rows = await tx.execute({
    sql: "SELECT * FROM project_artifacts WHERE project_id=? AND workspace_id=? AND deleted_at IS NULL",
    args: [projectId, user.workspaceId],
  });
  const edges = await tx.execute({
    sql: "SELECT source_id,target_id FROM artifact_links WHERE project_id=? AND workspace_id=? AND relation='reference'",
    args: [projectId, user.workspaceId],
  });
  const existing = rows.rows.map((row) =>
    toArtifact(
      row,
      edges.rows
        .filter((edge) => edge.source_id === row.id)
        .map((edge) => String(edge.target_id)),
    ),
  );
  const aliases = new Map(items.map((item) => [item.clientRef, randomUUID()]));
  const now = new Date().toISOString(),
    planned: Artifact[] = [];
  const catalog = items.some(hasPreparedDatabaseInput)
    ? await domainCatalog(tx, user, projectId)
    : undefined;
  const domainResults = await Promise.all(
    items.map((item) =>
      preparedDatabaseInput(item, tx, user, projectId, catalog),
    ),
  );
  const inputs = items.map((item, index) => ({
    title: item.title,
    status: item.status ?? "초안",
    fields: item.fields,
    links: item.links ?? [],
    structure: {
      columns: (domainResults[index]?.columns ?? item.structure.columns).map(
        (column) => {
          const reference = column.reference as
            | { tableId: string; columnId: string }
            | undefined;
          if (
            !reference ||
            typeof reference.tableId !== "string" ||
            !reference.tableId.startsWith("@")
          )
            return column;
          const tableId = aliases.get(reference.tableId.slice(1));
          if (!tableId)
            throw new HttpError(
              400,
              "일괄 등록 내 FK 대상 clientRef가 없습니다.",
            );
          return { ...column, reference: { ...reference, tableId } };
        },
      ),
    },
  }));
  for (const [index, input] of inputs.entries()) {
    await checkpoint?.(tx);
    const values = validateArtifactInput(input, "database");
    for (const id of values.links) {
      const target = existing.find((artifact) => artifact.id === id);
      if (!target || !allowedLinks.database.includes(target.kind))
        throw new HttpError(
          400,
          "같은 프로젝트의 유효한 상위 항목만 연결할 수 있습니다.",
        );
    }
    const counter = await tx.execute({
      sql: "INSERT INTO project_sequences(project_id,prefix,value) VALUES (?,'DB',1) ON CONFLICT(project_id,prefix) DO UPDATE SET value=value+1 RETURNING value",
      args: [projectId],
    });
    planned.push({
      id: aliases.get(items[index].clientRef)!,
      projectId,
      kind: "database",
      code: `DB-${String(counter.rows[0].value).padStart(3, "0")}`,
      ...values,
      structure: {},
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
  }
  const graph = [...existing, ...planned];
  for (const [index, artifact] of planned.entries())
    artifact.structure = prepareStructure(
      artifact,
      inputs[index],
      graph,
      undefined,
      domainResults[index]?.bindings,
    );
  validateProjectGraph(graph);
  // Insert all tables before their FK link rows, including cyclic/self references.
  for (const artifact of planned) {
    await checkpoint?.(tx);
    await persistArtifactRow(tx, user, artifact, undefined, "CREATE");
  }
  for (const artifact of planned) {
    await checkpoint?.(tx);
    await syncArtifactLinks(tx, user, artifact);
    await recordArtifactChange(
      tx,
      request,
      user,
      artifact,
      undefined,
      "CREATE",
    );
  }
  return planned;
}
