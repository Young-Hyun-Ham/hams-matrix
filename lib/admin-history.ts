import type { InValue } from "@libsql/client";
import { HttpError } from "./auth";
import { paging, searchValue } from "./admin-query";
import { db } from "./db";
const union = `SELECT 'audit' AS source,id,occurred_at AS occurredAt,actor_id AS actorId,actor_name AS actorName,workspace_id AS workspaceId,action,resource_type AS resource,resource_id AS resourceId,outcome,request_id AS requestId,route,before_json AS beforeJson,after_json AS afterJson,changed_fields_json AS changedFields FROM audit_logs
UNION ALL SELECT 'plan',p.id,p.created_at,p.actor_id,COALESCE(p.actor_name,u.name,p.actor_id),NULL,'UPDATE',p.resource,p.resource_id,'success',NULL,NULL,p.before_json,p.after_json,'[]' FROM plan_change_logs p LEFT JOIN users u ON u.id=p.actor_id
UNION ALL SELECT 'logging',id,created_at,actor_id,actor_name,NULL,'UPDATE',setting_key,setting_key,'success',request_id,'/api/admin/settings/logging',json_object('value',json(CASE WHEN before_value=1 THEN 'true' ELSE 'false' END)),json_object('value',json(CASE WHEN after_value=1 THEN 'true' ELSE 'false' END)),'["value"]' FROM admin_setting_changes`;
export async function historyList(url: URL) {
  const { page: requested, pageSize } = paging(url);
  const clauses: string[] = [],
    args: InValue[] = [];
  for (const key of [
    "source",
    "action",
    "outcome",
    "actorId",
    "workspaceId",
    "resource",
  ]) {
    const value = url.searchParams.get(key);
    if (value) {
      if (value.length > 100) throw new HttpError(400, "필터가 너무 깁니다.");
      clauses.push(`${key}=?`);
      args.push(value);
    }
  }
  const q = searchValue(url);
  clauses.push(
    "(COALESCE(actorName,'') LIKE ? ESCAPE '\\' OR COALESCE(actorId,'') LIKE ? ESCAPE '\\' OR resource LIKE ? ESCAPE '\\' OR COALESCE(resourceId,'') LIKE ? ESCAPE '\\' OR COALESCE(requestId,'') LIKE ? ESCAPE '\\' OR COALESCE(route,'') LIKE ? ESCAPE '\\')",
  );
  args.push(q, q, q, q, q, q);
  for (const key of ["from", "to"]) {
    const value = url.searchParams.get(key);
    if (value) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
        throw new HttpError(400, "날짜를 확인해 주세요.");
      const date = new Date(`${value}T00:00:00+09:00`);
      if (
        !Number.isFinite(date.getTime()) ||
        new Date(date.getTime() + 9 * 3600000).toISOString().slice(0, 10) !==
          value
      )
        throw new HttpError(400, "날짜를 확인해 주세요.");
      if (key === "to") date.setUTCDate(date.getUTCDate() + 1);
      clauses.push(`occurredAt ${key === "from" ? ">=" : "<"} ?`);
      args.push(date.toISOString());
    }
  }
  if (
    url.searchParams.get("from") &&
    url.searchParams.get("to") &&
    url.searchParams.get("from")! > url.searchParams.get("to")!
  )
    throw new HttpError(400, "시작일과 종료일을 확인해 주세요.");
  const where = " WHERE " + clauses.join(" AND "),
    tx = await db().transaction("read");
  try {
    const total = Number(
        (
          await tx.execute({
            sql: `SELECT COUNT(*) AS n FROM (${union})${where}`,
            args,
          })
        ).rows[0].n,
      ),
      page = Math.min(requested, Math.max(1, Math.ceil(total / pageSize)));
    const entries = (
      await tx.execute({
        sql: `SELECT source,id,occurredAt,actorId,actorName,workspaceId,action,resource,resourceId,outcome,requestId,route FROM (${union})${where} ORDER BY occurredAt DESC,source DESC,id DESC LIMIT ? OFFSET ?`,
        args: [...args, pageSize, (page - 1) * pageSize],
      })
    ).rows;
    await tx.commit();
    return { entries, total, page, pageSize };
  } finally {
    tx.close();
  }
}
const allowed = new Set([
  "name",
  "workspaceName",
  "role",
  "account_role",
  "accountRole",
  "plan",
  "plan_code",
  "status",
  "version",
  "value",
  "code",
  "priceMode",
  "monthlyPrice",
  "yearlyPrice",
  "projectLimit",
  "tokenLimit",
  "dailyImageLimit",
  "attachmentLimit",
  "historyEnabled",
  "recommended",
]);
function safeJson(value: unknown) {
  if (!value) return null;
  const parsed = JSON.parse(String(value));
  return Object.fromEntries(
    Object.entries(parsed).filter(
      ([key, value]) =>
        allowed.has(key) &&
        ["string", "number", "boolean"].includes(typeof value),
    ),
  );
}
export async function historyDetail(source: string, id: string) {
  if (!["audit", "plan", "logging"].includes(source))
    throw new HttpError(404, "출처를 찾을 수 없습니다.");
  const row = (
    await db().execute({
      sql: `SELECT * FROM (${union}) WHERE source=? AND id=?`,
      args: [source, id],
    })
  ).rows[0];
  if (!row) throw new HttpError(404, "이력이 없습니다.");
  return {
    ...row,
    beforeJson: safeJson(row.beforeJson),
    afterJson: safeJson(row.afterJson),
  };
}
