import { randomUUID } from "node:crypto";
import type { Client, InStatement } from "@libsql/client";
import type { User } from "./types";
import { db } from "./db";
import { getBooleanSetting } from "./settings";
type AuditInput = {
  user?: User | null;
  action:
    | "CREATE"
    | "READ"
    | "UPDATE"
    | "DELETE"
    | "LOGIN"
    | "LOGOUT"
    | "LOGIN_FAILED"
    | "OAUTH_START"
    | "OAUTH_FAILED";
  resource: string;
  resourceId?: string;
  outcome?: "success" | "failure";
  source?: "web" | "oauth" | "system";
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  errorCode?: string;
};
const snapshotFields = new Set([
  "code",
  "fields",
  "links",
  "structure",
  "name",
  "workspaceName",
  "role",
  "plan",
  "status",
  "title",
  "description",
  "version",
  "provider",
  "memberIds",
  "accountRole",
  "onboardingComplete",
]);
const requestIds = new WeakMap<Request, string>();
function snapshot(value?: Record<string, unknown>) {
  return value
    ? Object.fromEntries(
        Object.entries(value).filter(([key]) => snapshotFields.has(key)),
      )
    : null;
}
export async function isDbLoggingEnabled() {
  return getBooleanSetting("DB_LOGGING_ENABLED");
}

// The SQL checks the DB setting inside the same transaction as the actual mutation.
// This avoids stale cached flags, extra round trips and recursive logging of setting reads.
export function auditStatements(
  request: Request,
  input: AuditInput,
): InStatement[] {
  return [auditStatement(request, input)];
}

function auditStatement(request: Request, input: AuditInput): InStatement {
  let requestId = requestIds.get(request);
  if (!requestId) {
    requestId = randomUUID();
    requestIds.set(request, requestId);
  }
  const before = snapshot(input.before),
    after = snapshot(input.after);
  const changed = [
    ...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]),
  ].filter(
    (key) => JSON.stringify(before?.[key]) !== JSON.stringify(after?.[key]),
  );
  return {
    sql: `INSERT INTO audit_logs (id,occurred_at,request_id,workspace_id,actor_id,actor_name,actor_type,action,resource_type,resource_id,outcome,source,http_method,route,changed_fields_json,before_json,after_json,metadata_json,error_code) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM admin_setting WHERE setting_key='DB_LOGGING_ENABLED' AND value_type='boolean' AND json_type(value_json)='true')`,
    args: [
      randomUUID(),
      new Date().toISOString(),
      requestId,
      input.user?.workspaceId ?? null,
      input.user?.id ?? null,
      input.user?.name ?? "방문자",
      input.user ? "user" : "anonymous",
      input.action,
      input.resource,
      input.resourceId ?? null,
      input.outcome ?? "success",
      input.source ?? "web",
      request.method,
      new URL(request.url).pathname,
      JSON.stringify(changed),
      before ? JSON.stringify(before) : null,
      after ? JSON.stringify(after) : null,
      JSON.stringify(input.metadata ?? {}),
      input.errorCode ?? null,
    ],
  };
}
export async function audit(
  request: Request,
  input: AuditInput,
  executor?: Pick<Client, "execute">,
) {
  await (executor ?? db()).execute(auditStatement(request, input));
}
