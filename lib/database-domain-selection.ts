import "server-only";
import type { Client } from "@libsql/client";
import type { User } from "./types";
import type { DomainReference, DomainSelection } from "./database-domain-types";
import { databaseDomain } from "./database-domains";
import { domainDataType } from "./database-domain-validation";
import { domainRuleVersion } from "./database-domain-types";
import { requireProjectPermission } from "./project-permissions";
import { HttpError } from "./auth";

// Only references returned by this server-side resolver reach prepareStructure.
export async function resolveDomainSelections(
  executor: Pick<Client, "execute">,
  user: User,
  projectId: string,
  input: Record<string, unknown>,
) {
  const raw = input.structure as { columns?: unknown } | undefined;
  const references = new Map<string, DomainReference | null>();
  if (!raw || !Array.isArray(raw.columns)) return { input, references };
  if (raw.columns.length > 100)
    throw new HttpError(400, "컬럼을 1~100개 등록해 주세요.");
  const selections = new Map<string, DomainSelection>();
  for (const value of raw.columns) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const column = value as Record<string, unknown>;
    if (column.domainSelection === undefined) continue;
    if (typeof column.id !== "string" || !column.id)
      throw new HttpError(400, "컬럼 ID가 필요합니다.");
    if (column.domainSelection === null) {
      references.set(column.id, null);
      continue;
    }
    const selection = column.domainSelection as DomainSelection;
    if (
      typeof selection !== "object" ||
      Array.isArray(selection) ||
      Object.keys(selection).some(
        (k) => !["domainId", "domainVersion"].includes(k),
      ) ||
      typeof selection.domainId !== "string" ||
      !selection.domainId ||
      selection.domainId.length > 100 ||
      !Number.isSafeInteger(selection.domainVersion) ||
      selection.domainVersion < 1
    )
      throw new HttpError(400, "도메인 선택 항목을 확인해 주세요.");
    selections.set(column.id, selection);
  }
  if (!selections.size) return { input, references };
  await requireProjectPermission(executor, user, projectId, "database", "READ");
  const ids = [...new Set([...selections.values()].map((s) => s.domainId))];
  const rows = await executor.execute({
    sql: `SELECT *,length AS domain_length FROM project_database_domains WHERE project_id=? AND workspace_id=? AND id IN (${ids.map(() => "?").join(",")})`,
    args: [projectId, user.workspaceId, ...ids],
  });
  const domains = new Map(rows.rows.map((row) => [String(row.id), row]));
  const revision = (
    await executor.execute({
      sql: "SELECT revision FROM project_database_domain_catalogs WHERE project_id=? AND workspace_id=?",
      args: [projectId, user.workspaceId],
    })
  ).rows[0];
  const columns = raw.columns.map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value))
      return value;
    const column = value as Record<string, unknown>;
    const selection = selections.get(String(column.id));
    if (!selection) return value;
    const row = domains.get(selection.domainId);
    if (!row)
      throw new HttpError(404, "현재 프로젝트의 도메인을 선택해 주세요.");
    const domain = databaseDomain(row);
    if (row.deleted_at || domain.version !== selection.domainVersion)
      throw new HttpError(
        409,
        "도메인이 변경되거나 삭제되었습니다. 다시 조회해 선택해 주세요.",
      );
    if (!domain.databaseType)
      throw new HttpError(400, "DB 종류가 지정된 도메인을 선택해 주세요.");
    domainDataType(domain.dataType, domain.length, domain.databaseType);
    references.set(String(column.id), {
      domainId: domain.id,
      domainVersion: domain.version,
      databaseType: domain.databaseType,
      catalogRevision: Number(revision?.revision ?? 1),
      ruleVersion: domainRuleVersion,
      logicalName: domain.logicalName,
      physicalName: domain.physicalName,
      dataType: domain.dataType,
      length: domain.length,
    });
    return {
      ...column,
      logicalName: domain.logicalName,
      name: domain.physicalName,
      dataType: domain.dataType,
      length: domain.length,
    };
  });
  return { input: { ...input, structure: { ...raw, columns } }, references };
}
