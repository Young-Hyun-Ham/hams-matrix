import "server-only";
import type { Client } from "@libsql/client";
import { db } from "../db";
import { HttpError } from "../auth";
import type { User } from "../types";
export async function aiUserSettings(
  user: User,
  executor: Pick<Client, "execute"> = db(),
) {
  const row = (
    await executor.execute({
      sql: "SELECT hitl_enabled,token_limit,version FROM user_ai_settings WHERE user_id=? AND workspace_id=?",
      args: [user.id, user.workspaceId],
    })
  ).rows[0];
  return {
    hitlEnabled: row ? Number(row.hitl_enabled) === 1 : true,
    tokenLimit: Number(row?.token_limit ?? 1000000),
    version: Number(row?.version ?? 0),
  };
}
export async function saveAiUserSettings(
  user: User,
  input: Record<string, unknown>,
) {
  if (user.accountRole === "guest")
    throw new HttpError(403, "게스트는 AI 설정을 저장할 수 없습니다.");
  if (
    Object.keys(input).some(
      (k) => !["hitlEnabled", "tokenLimit", "expectedVersion"].includes(k),
    ) ||
    typeof input.hitlEnabled !== "boolean" ||
    !Number.isSafeInteger(input.tokenLimit) ||
    Number(input.tokenLimit) < 1 ||
    !Number.isSafeInteger(input.expectedVersion) ||
    Number(input.expectedVersion) < 0
  )
    throw new HttpError(400, "AI 설정 값과 버전을 확인해 주세요.");
  const tx = await db().transaction("write");
  try {
    const current = await aiUserSettings(user, tx);
    if (current.version !== input.expectedVersion)
      throw new HttpError(
        409,
        "AI 설정이 변경되었습니다. 다시 불러온 뒤 저장해 주세요.",
      );
    await tx.execute({
      sql: "INSERT INTO user_ai_settings(user_id,workspace_id,hitl_enabled,token_limit,version,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(user_id,workspace_id) DO UPDATE SET hitl_enabled=excluded.hitl_enabled,token_limit=excluded.token_limit,version=excluded.version,updated_at=excluded.updated_at",
      args: [
        user.id,
        user.workspaceId,
        input.hitlEnabled ? 1 : 0,
        Number(input.tokenLimit),
        current.version + 1,
        new Date().toISOString(),
      ],
    });
    if (current.tokenLimit !== Number(input.tokenLimit)) {
      await tx.execute({
        sql: "DELETE FROM notification_acknowledgements WHERE user_id=? AND workspace_id=? AND notification_key LIKE 'ai-token-limit:%'",
        args: [user.id, user.workspaceId],
      });
    }
    const settings = await aiUserSettings(user, tx);
    await tx.commit();
    return settings;
  } catch (e) {
    await tx.rollback();
    throw e;
  } finally {
    tx.close();
  }
}
