import "server-only";
import { db } from "../db";
import { HttpError } from "../auth";
import { projectAccess, toArtifact } from "../artifacts";
import { projectPermissionAccess } from "../project-permissions";
import { readRfp } from "../rfp-server";
import type { User } from "../types";
import type { ArtifactKind } from "../artifact-types";
export async function readProjectAnalysis(user: User, projectId: string) {
  const project = await projectAccess(db(), user, projectId),
    access = await projectPermissionAccess(db(), user, projectId);
  const rows = (
    await db().execute({
      sql: "SELECT * FROM project_artifacts WHERE project_id=? AND workspace_id=? AND deleted_at IS NULL ORDER BY kind,code,id",
      args: [projectId, user.workspaceId],
    })
  ).rows.filter((r) => access.permissionsByTab[r.kind as ArtifactKind]?.READ);
  const edges = (
    await db().execute({
      sql: "SELECT source_id,target_id,relation FROM artifact_links WHERE project_id=? AND workspace_id=? ORDER BY source_id,target_id",
      args: [projectId, user.workspaceId],
    })
  ).rows;
  const ids = new Set(rows.map((r) => String(r.id)));
  const allLinks = edges.filter(
    (e) => ids.has(String(e.source_id)) && ids.has(String(e.target_id)),
  );
  const doc = access.permissionsByTab.rfp.READ
    ? (await readRfp(db(), user, projectId)).document
    : null;
  const rfpText = doc
    ? JSON.stringify({ ...doc.draft, id: doc.id, version: doc.version })
    : "";
  const rfp =
    rfpText.length <= 20000
      ? doc
        ? { ...doc.draft, id: doc.id, version: doc.version }
        : null
      : {
          id: doc!.id,
          version: doc!.version,
          title: doc!.draft.title,
          truncated: true,
        };
  let budget = 50000 - JSON.stringify(rfp).length;
  const artifacts = [];
  const catalog = [];
  for (const row of rows) {
    const value = toArtifact(
      row,
      allLinks
        .filter((e) => e.source_id === row.id && e.relation === "reference")
        .map((e) => String(e.target_id)),
    );
    const size = JSON.stringify(value).length;
    if (size <= budget) {
      artifacts.push(value);
      budget -= size;
    }
    if (catalog.length < 300)
      catalog.push({
        id: value.id,
        code: value.code,
        title: value.title,
        kind: value.kind,
        version: value.version,
      });
  }
  const counts: Record<string, number> = {};
  for (const r of rows)
    counts[String(r.kind)] = (counts[String(r.kind)] ?? 0) + 1;
  const result = {
    project: {
      id: project.id,
      name: project.name,
      description: project.description,
      status: project.status,
    },
    rfp,
    rfpAvailable: doc !== null,
    artifacts,
    catalog,
    counts,
    links: allLinks.slice(0, 200),
    total: rows.length,
    returned: artifacts.length,
    truncated:
      artifacts.length < rows.length ||
      allLinks.length > 200 ||
      rfpText.length > 20000,
    restrictedKinds: Object.entries(access.permissionsByTab)
      .filter(([, v]) => !v.READ)
      .map(([k]) => k),
    scope:
      "현재 선택 프로젝트의 조회 가능한 RFP·산출물과 연결. 문서함 원문·보드·이력 제외. 잘린 자료는 상세 조회 필요",
    queriedAt: new Date().toISOString(),
  };
  while (JSON.stringify(result).length > 60000) {
    if (result.artifacts.length) result.artifacts.pop();
    else if (result.links.length) result.links.pop();
    else if (result.catalog.length) result.catalog.pop();
    else break;
    result.truncated = true;
  }
  result.returned = result.artifacts.length;
  return result;
}
export async function readProjectDetail(
  user: User,
  projectId: string,
  name: string,
  input: Record<string, unknown>,
) {
  await projectAccess(db(), user, projectId);
  const access = await projectPermissionAccess(db(), user, projectId);
  if (Object.keys(input).some((k) => !["id", "offset", "section"].includes(k)))
    throw new HttpError(400, "조회 구간을 확인해 주세요.");
  if (name === "read_project_rfp") {
    if (!access.permissionsByTab.rfp.READ)
      throw new HttpError(403, "제안요청서 조회 권한이 없습니다.");
    const document = (await readRfp(db(), user, projectId)).document;
    if (!document) return { document: null };
    const section = typeof input.section === "string" ? input.section : "";
    if (
      ![
        "title",
        "basic",
        "scope",
        "requirements",
        "delivery",
        "proposalGuide",
        "evaluation",
        "appendix",
      ].includes(section)
    )
      throw new HttpError(400, "제안요청서 장을 선택해 주세요.");
    const text = JSON.stringify(
      document.draft[section as keyof typeof document.draft],
    );
    return slice(
      text,
      { id: document.id, version: document.version, section },
      input.offset,
    );
  }
  if (typeof input.id !== "string" || input.id.length > 100)
    throw new HttpError(400, "산출물을 선택해 주세요.");
  const row = (
    await db().execute({
      sql: "SELECT * FROM project_artifacts WHERE id=? AND project_id=? AND workspace_id=? AND deleted_at IS NULL",
      args: [input.id, projectId, user.workspaceId],
    })
  ).rows[0];
  if (!row || !access.permissionsByTab[row.kind as ArtifactKind]?.READ)
    throw new HttpError(404, "산출물을 찾을 수 없습니다.");
  return slice(
    JSON.stringify(toArtifact(row, [])),
    { id: String(row.id), version: Number(row.version) },
    input.offset,
  );
}
function slice(
  text: string,
  metadata: Record<string, unknown>,
  offset: unknown,
) {
  const start = offset === undefined ? 0 : Number(offset);
  if (!Number.isSafeInteger(start) || start < 0 || start > text.length)
    throw new HttpError(400, "조회 구간을 확인해 주세요.");
  return {
    ...metadata,
    text: text.slice(start, start + 12000),
    nextOffset: start + 12000 < text.length ? start + 12000 : null,
  };
}
