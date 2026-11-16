import "server-only";
import type { Client, Row } from "@libsql/client";
import type { User } from "../types";
import type { ProjectTab } from "../project-tabs";
import { db } from "../db";
import { HttpError } from "../auth";
import { ragAccess } from "./project-rag-permissions";
import { ragHash } from "./rag-chunks";
import { getDocument } from "../r2";
import { extractDocumentText } from "../document-text";

type Executor = Pick<Client, "execute">;
export type RagSource = {
  type: string;
  id: string;
  version: string;
  hash: string;
  tab: ProjectTab;
  title: string;
  href: string;
  text: string;
  file?: { key: string; name: string; size: number };
};
function boardText(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  if (Array.isArray(value))
    return value.map(boardText).filter(Boolean).join("\n");
  return Object.entries(value)
    .map(([key, item]) =>
      /^(text|title|label|name|description|content|placeholder|value)$/.test(
        key,
      ) && typeof item === "string"
        ? item
        : typeof item === "object"
          ? boardText(item)
          : "",
    )
    .filter(Boolean)
    .join("\n");
}
export async function collectRagSources(
  user: User,
  projectId: string,
  executor?: Executor,
): Promise<RagSource[]> {
  if (!executor) {
    const tx = await db().transaction("read");
    try {
      const result = await collectRagSources(user, projectId, tx);
      await tx.commit();
      return result;
    } finally {
      tx.close();
    }
  }
  const access = await ragAccess(user, projectId, false, executor);
  const sources: RagSource[] = [];
  const href = (tab: ProjectTab) =>
    `/projects/${encodeURIComponent(projectId)}?tab=${tab}`;
  const add = (
    type: string,
    row: Row,
    tab: ProjectTab,
    title: string,
    text: string,
    version: unknown = row.version ?? row.updated_at ?? "1",
    file?: RagSource["file"],
  ) => {
    if (!access.permissionsByTab[tab]?.READ) return;
    sources.push({
      type,
      id: String(row.id),
      version: String(version),
      hash: ragHash([type, row.id, version, title, text, file ?? null]),
      tab,
      title,
      text,
      href: href(tab),
      ...(file ? { file } : {}),
    });
  };
  const scan = async (sql: string, consume: (row: Row) => void) => {
    let cursor = "";
    for (;;) {
      const rows = (
        await executor.execute({
          sql: `SELECT * FROM (${sql}) WHERE id>? ORDER BY id LIMIT 200`,
          args: [projectId, user.workspaceId, cursor],
        })
      ).rows;
      for (const row of rows) consume(row);
      if (rows.length < 200) break;
      cursor = String(rows.at(-1)!.id);
    }
  };
  await scan(
    "SELECT id,name,description,status,updated_at FROM projects WHERE id=? AND workspace_id=?",
    (r) => add("project", r, "overview", String(r.name), JSON.stringify(r)),
  );
  await scan(
    "SELECT id,version,document_json FROM project_rfp_documents WHERE project_id=? AND workspace_id=? AND deleted_at IS NULL",
    (r) => add("rfp", r, "rfp", "제안요청서", String(r.document_json)),
  );
  await scan(
    "SELECT id,kind,code,title,status,fields_json,structure_json,detail_level,version FROM project_artifacts WHERE project_id=? AND workspace_id=? AND deleted_at IS NULL",
    (r) =>
      add(
        "artifact",
        r,
        String(r.kind) as ProjectTab,
        `${r.code} ${r.title}`,
        JSON.stringify(r),
      ),
  );
  await scan(
    "SELECT l.source_id||':'||l.target_id||':'||l.relation AS id,l.source_id,l.target_id,l.relation,a.kind,a.code,a.title,b.kind AS target_kind,b.code AS target_code,b.title AS target_title FROM artifact_links l JOIN project_artifacts a ON a.id=l.source_id AND a.project_id=l.project_id AND a.workspace_id=l.workspace_id JOIN project_artifacts b ON b.id=l.target_id AND b.project_id=l.project_id AND b.workspace_id=l.workspace_id WHERE l.project_id=? AND l.workspace_id=? AND a.deleted_at IS NULL AND b.deleted_at IS NULL",
    (r) => {
      if (access.permissionsByTab[String(r.target_kind) as ProjectTab]?.READ)
        add(
          "link",
          r,
          String(r.kind) as ProjectTab,
          `${r.code} → ${r.target_code}`,
          JSON.stringify(r),
          ragHash(r),
        );
    },
  );
  await scan(
    "SELECT id,parent_id,name FROM project_folders WHERE project_id=? AND workspace_id=?",
    (r) =>
      add(
        "folder",
        r,
        "documents",
        String(r.name),
        JSON.stringify(r),
        ragHash(r),
      ),
  );
  await scan(
    "SELECT f.id,f.name,f.folder_id,f.object_key,f.byte_length,f.mime_type,f.created_at,(SELECT version FROM project_rfp_sources rs WHERE rs.file_id=f.id AND rs.project_id=f.project_id AND rs.workspace_id=f.workspace_id) AS rfp_source_version FROM project_files f WHERE f.project_id=? AND f.workspace_id=?",
    (r) =>
      add(
        "file",
        r,
        "documents",
        String(r.name),
        JSON.stringify({
          name: r.name,
          folderId: r.folder_id,
          rfpSourceVersion: r.rfp_source_version,
        }),
        ragHash(r),
        {
          key: String(r.object_key),
          name: String(r.name),
          size: Number(r.byte_length),
        },
      ),
  );
  await scan(
    "SELECT b.id,b.screen_artifact_id,b.version,b.content_version,b.status,b.document_json,a.code,a.title FROM planning_boards b JOIN project_artifacts a ON a.id=b.screen_artifact_id AND a.project_id=b.project_id AND a.workspace_id=b.workspace_id WHERE b.project_id=? AND b.workspace_id=? AND a.deleted_at IS NULL",
    (r) =>
      add(
        "board",
        r,
        "screen",
        `${r.code} ${r.title} 화면설계`,
        JSON.stringify({
          screen: r.screen_artifact_id,
          status: r.status,
          contentVersion: r.content_version,
          text: boardText(JSON.parse(String(r.document_json))),
        }),
      ),
  );
  await scan(
    "SELECT d.*,c.revision AS catalog_revision FROM project_database_domains d JOIN project_database_domain_catalogs c ON c.project_id=d.project_id AND c.workspace_id=d.workspace_id WHERE d.project_id=? AND d.workspace_id=? AND d.deleted_at IS NULL",
    (r) =>
      add(
        "domain",
        r,
        "database",
        `${r.logical_name} ${r.physical_name}`,
        JSON.stringify({
          logicalName: r.logical_name,
          physicalName: r.physical_name,
          databaseType: r.database_type,
          dataType: r.data_type,
          length: r.length,
          description: r.description,
          catalogRevision: r.catalog_revision,
        }),
        `${r.version}:${r.catalog_revision}`,
      ),
  );
  await scan(
    "SELECT s.id,s.source_type,s.source_id,s.source_version,s.name,s.content_hash,s.content,(SELECT json_group_array(json_object('kind',a.kind,'id',a.id,'locator',ar.locator,'excerpt',ar.excerpt,'rationale',ar.rationale,'origin',ar.origin)) FROM artifact_source_references ar JOIN project_artifacts a ON a.id=ar.artifact_id AND a.project_id=ar.project_id AND a.workspace_id=ar.workspace_id WHERE ar.snapshot_id=s.id AND ar.project_id=s.project_id AND ar.workspace_id=s.workspace_id AND a.deleted_at IS NULL) AS refs FROM project_source_snapshots s WHERE s.project_id=? AND s.workspace_id=? AND EXISTS(SELECT 1 FROM artifact_source_references ar JOIN project_artifacts a ON a.id=ar.artifact_id AND a.project_id=ar.project_id AND a.workspace_id=ar.workspace_id WHERE ar.snapshot_id=s.id AND a.deleted_at IS NULL)",
    (r) => {
      const refs = (
        JSON.parse(String(r.refs)) as { kind: ProjectTab }[]
      ).filter((ref) => access.permissionsByTab[ref.kind]?.READ);
      if (refs.length)
        add(
          "snapshot",
          r,
          refs[0].kind,
          `${r.name} (연결된 과거 출처)`,
          JSON.stringify({
            content: r.content,
            refs,
            sourceType: r.source_type,
            sourceId: r.source_id,
          }),
          String(r.content_hash),
        );
    },
  );
  return sources.sort((a, b) =>
    `${a.type}:${a.id}`.localeCompare(`${b.type}:${b.id}`, "en"),
  );
}
export const manifestHash = (sources: RagSource[]) =>
  ragHash(sources.map((s) => [s.type, s.id, s.version, s.hash]));
export async function sourceText(source: RagSource, signal: AbortSignal) {
  if (!source.file)
    return {
      status: "ready" as const,
      text: `${source.title}\n${source.text}`,
    };
  const ext = source.file.name.split(".").at(-1)?.toLowerCase() ?? "";
  if (!["txt", "md", "pdf", "docx"].includes(ext))
    return {
      status: "unsupported" as const,
      text: "",
      code: "UNSUPPORTED_FORMAT",
    };
  if (source.file.size > 20 * 1024 * 1024)
    throw new HttpError(400, "문서 추출 크기 제한을 초과했습니다.");
  const bytes = Buffer.from(await getDocument(source.file.key));
  const text = await extractDocumentText(bytes, ext, signal);
  return {
    status: "ready" as const,
    text: `${source.title}\n${source.text}\n${text}`,
  };
}
