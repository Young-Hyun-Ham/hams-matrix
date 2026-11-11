import "server-only";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { masterWorkspaceScope } from "@/lib/master-workspace-admin";
import {
  productAdminScope,
  productWorkspace,
  type Executor,
} from "@/lib/product-access";
import type { User } from "@/lib/types";
import { defaultSettings, validateSettings } from "./defaults";
import type { SettingsInput, SystemSettings } from "./types";

export async function requireSystemSettingsAdmin(
  user: User,
  executor: Executor = db(),
) {
  if (user.accountRole === "master")
    return masterWorkspaceScope(user, user.workspaceId, executor);
  const product = await productAdminScope(user, undefined, executor);
  const workspace = await productWorkspace(
    product.id,
    user.workspaceId,
    executor,
  );
  const membership = await executor.execute({
    sql: "SELECT 1 FROM workspace_members WHERE workspace_id=? AND user_id=?",
    args: [user.workspaceId, user.id],
  });
  if (!membership.rows.length)
    throw new HttpError(403, "현재 공간 소속을 확인할 수 없습니다.");
  return workspace;
}
export async function getWorkspaceSystemSettings(
  user: Pick<User, "workspaceId">,
  executor?: Executor,
): Promise<SystemSettings> {
  const fallback = defaultSettings(user.workspaceId);
  try {
    const row = (
      await (executor ?? db()).execute({
        sql: "SELECT * FROM workspace_system_settings WHERE workspace_id=?",
        args: [user.workspaceId],
      })
    ).rows[0];
    if (!row) return fallback;
    try {
      const messages = JSON.parse(String(row.error_messages_json));
      if (!messages || typeof messages !== "object" || Array.isArray(messages))
        throw new Error("Invalid stored messages");
      const input = validateSettings({
        staleTimeMs: Number(row.stale_time_ms),
        retryCount: Number(row.retry_count),
        expectedVersion: Number(row.version),
        errorMessages: { ...fallback.errorMessages, ...messages },
      });
      return {
        ...fallback,
        staleTimeMs: input.staleTimeMs,
        retryCount: input.retryCount,
        errorMessages: input.errorMessages,
        version: input.expectedVersion,
        source: "stored",
      };
    } catch {
      console.error("Invalid workspace system settings", {
        workspaceId: user.workspaceId,
      });
      return { ...fallback, version: Number(row.version), source: "stored" };
    }
  } catch {
    console.error("Workspace system settings unavailable", {
      workspaceId: user.workspaceId,
    });
    return { ...fallback, version: null, source: "unavailable" };
  }
}
export async function saveWorkspaceSystemSettings(
  request: Request,
  user: User,
  input: SettingsInput,
) {
  const tx = await db().transaction("write");
  try {
    await requireSystemSettingsAdmin(user, tx);
    const before = await getWorkspaceSystemSettings(user, tx);
    if (before.version === null)
      throw new HttpError(503, "설정을 확인할 수 없습니다.");
    if (before.version !== input.expectedVersion)
      throw new HttpError(409, "최신 설정을 다시 불러온 뒤 비교해 주세요.", {
        code: "SETTINGS_VERSION_CONFLICT",
      });
    const now = new Date().toISOString();
    const result = await tx.execute({
      sql: `INSERT INTO workspace_system_settings(workspace_id,stale_time_ms,retry_count,error_messages_json,version,updated_by,created_at,updated_at) VALUES (?,?,?,?,1,?,?,?) ON CONFLICT(workspace_id) DO UPDATE SET stale_time_ms=excluded.stale_time_ms,retry_count=excluded.retry_count,error_messages_json=excluded.error_messages_json,version=workspace_system_settings.version+1,updated_by=excluded.updated_by,updated_at=excluded.updated_at WHERE workspace_system_settings.version=?`,
      args: [
        user.workspaceId,
        input.staleTimeMs,
        input.retryCount,
        JSON.stringify(input.errorMessages),
        user.id,
        now,
        now,
        input.expectedVersion,
      ],
    });
    if (result.rowsAffected !== 1)
      throw new HttpError(409, "설정이 변경되었습니다. 다시 불러와 주세요.");
    const after = await getWorkspaceSystemSettings(user, tx);
    if (
      after.source !== "stored" ||
      after.version !== input.expectedVersion + 1
    )
      throw new HttpError(503, "저장 결과를 확인할 수 없습니다.");
    await audit(
      request,
      {
        user,
        action: "UPDATE",
        resource: "workspace_system_settings",
        resourceId: user.workspaceId,
        before,
        after,
      },
      tx,
    );
    await tx.commit();
    return after;
  } catch (error) {
    await tx.rollback();
    throw error;
  } finally {
    tx.close();
  }
}
