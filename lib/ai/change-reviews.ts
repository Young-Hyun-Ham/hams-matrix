import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { Client, Transaction, Row } from "@libsql/client";
import { db } from "../db";
import { HttpError } from "../auth";
import type { User } from "../types";
import { requireConversation } from "./conversations";
import { projectAccess } from "../artifacts";
import { validateTarget, targetAiPage } from "./resolve-target";
import { activeGuardrailPolicy, assertAiEnabled } from "./guardrail-policy";
import { createPageAgent } from "./page-tools";
import type { AiAction } from "./page-tools";
import type { AiTargetPage } from "../ai-target-pages";
import type { AiChangeReview } from "../ai-review-types";
type Executor = Pick<Client, "execute">;
export async function projectVersions(
  user: User,
  projectId: string,
  executor: Executor = db(),
) {
  const args = [projectId, user.workspaceId];
  const artifacts = (
    await executor.execute({
      sql: "SELECT id,version,deleted_at FROM project_artifacts WHERE project_id=? AND workspace_id=? ORDER BY id",
      args,
    })
  ).rows;
  const rfp = (
    await executor.execute({
      sql: "SELECT id,version,deleted_at FROM project_rfp_documents WHERE project_id=? AND workspace_id=? ORDER BY id",
      args,
    })
  ).rows;
  const domains = (
    await executor.execute({
      sql: "SELECT revision FROM project_database_domain_catalogs WHERE project_id=? AND workspace_id=?",
      args,
    })
  ).rows;
  const links = (
    await executor.execute({
      sql: "SELECT source_id,target_id,relation FROM artifact_links WHERE project_id=? AND workspace_id=? ORDER BY source_id,target_id,relation",
      args,
    })
  ).rows;
  return JSON.stringify({ artifacts, rfp, domains, links });
}
export async function assertNoPendingReview(
  user: User,
  convId: string,
  executor: Executor = db(),
) {
  await executor.execute({
    sql: "UPDATE ai_change_reviews SET status='expired',version=version+1 WHERE user_id=? AND workspace_id=? AND conv_id=? AND status='pending' AND expires_at<=?",
    args: [user.id, user.workspaceId, convId, new Date().toISOString()],
  });
  const row = (
    await executor.execute({
      sql: "SELECT review_id FROM ai_change_reviews WHERE user_id=? AND workspace_id=? AND conv_id=? AND status='pending'",
      args: [user.id, user.workspaceId, convId],
    })
  ).rows[0];
  if (row)
    throw new HttpError(
      409,
      "검토 대기 변경안을 먼저 승인하거나 거절해 주세요.",
    );
}
export async function storeChangeReview(
  tx: Transaction,
  user: User,
  input: {
    requestId: string;
    chatId: string;
    convId: string;
    projectId: string;
    targetPage: AiTargetPage;
    targetVersion: number;
    guardrailVersion: number;
    settingsVersion: number;
    source: string;
    changes: unknown[];
  },
) {
  if ((await projectVersions(user, input.projectId, tx)) !== input.source)
    throw new HttpError(
      409,
      "프로젝트 자료가 변경되었습니다. 다시 요청해 주세요.",
    );
  await assertNoPendingReview(user, input.convId, tx);
  const before = [];
  for (const raw of input.changes) {
    const change = raw as { id?: string; input: Record<string, unknown> };
    const id = change.id ?? change.input.id;
    if (input.targetPage === "rfp") {
      const row = (
        await tx.execute({
          sql: "SELECT id,version,document_json FROM project_rfp_documents WHERE project_id=? AND workspace_id=? AND deleted_at IS NULL",
          args: [input.projectId, user.workspaceId],
        })
      ).rows[0];
      if (row)
        before.push({
          id: row.id,
          version: row.version,
          document: JSON.parse(String(row.document_json)),
        });
    } else if (typeof id === "string") {
      const row = (
        await tx.execute({
          sql: "SELECT id,code,title,version,fields_json,structure_json FROM project_artifacts WHERE id=? AND project_id=? AND workspace_id=?",
          args: [id, input.projectId, user.workspaceId],
        })
      ).rows[0];
      if (row)
        before.push({
          id: row.id,
          code: row.code,
          title: row.title,
          version: row.version,
          fields: JSON.parse(String(row.fields_json)),
          structure: JSON.parse(String(row.structure_json)),
        });
    }
  }
  const payload = JSON.stringify({ changes: input.changes, before });
  if (payload.length > 600000)
    throw new HttpError(
      400,
      "검토할 변경안이 너무 큽니다. 요청 범위를 줄여 주세요.",
    );
  const reviewId = randomUUID(),
    hash = createHash("sha256").update(payload).digest("hex"),
    now = new Date().toISOString(),
    expiresAt = new Date(Date.now() + 86400000).toISOString();
  await tx.execute({
    sql: "INSERT INTO ai_change_reviews(review_id,request_id,chat_id,user_id,workspace_id,project_id,conv_id,target_page,target_version,payload_json,payload_hash,source_versions_json,guardrail_version,settings_version,created_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    args: [
      reviewId,
      input.requestId,
      input.chatId,
      user.id,
      user.workspaceId,
      input.projectId,
      input.convId,
      input.targetPage,
      input.targetVersion,
      payload,
      hash,
      input.source,
      input.guardrailVersion,
      input.settingsVersion,
      now,
      expiresAt,
    ],
  });
  return reviewInfo({
    review_id: reviewId,
    chat_id: input.chatId,
    status: "pending",
    version: 1,
    payload_json: payload,
    payload_hash: hash,
    expires_at: expiresAt,
    applied_actions_json: "[]",
  } as unknown as Row);
}
export function reviewInfo(row: Row): AiChangeReview {
  const payload = JSON.parse(String(row.payload_json));
  return {
    reviewId: String(row.review_id),
    chatId: String(row.chat_id),
    status: String(row.status),
    version: Number(row.version),
    hash: String(row.payload_hash),
    expiresAt: String(row.expires_at),
    changes: payload.changes,
    before: payload.before,
    actions: JSON.parse(String(row.applied_actions_json)),
  };
}
export async function getReview(user: User, id: string) {
  if (!id || id.length > 100)
    throw new HttpError(400, "검토 항목을 확인해 주세요.");
  const row = (
    await db().execute({
      sql: "SELECT * FROM ai_change_reviews WHERE review_id=? AND user_id=? AND workspace_id=?",
      args: [id, user.id, user.workspaceId],
    })
  ).rows[0];
  if (!row) throw new HttpError(404, "검토 항목을 찾을 수 없습니다.");
  await requireConversation(user, String(row.project_id), String(row.conv_id));
  if (
    row.status === "pending" &&
    String(row.expires_at) <= new Date().toISOString()
  ) {
    await db().execute({
      sql: "UPDATE ai_change_reviews SET status='expired',version=version+1 WHERE review_id=? AND status='pending'",
      args: [id],
    });
    return getReview(user, id);
  }
  return row;
}
export async function decideReview(
  request: Request,
  user: User,
  id: string,
  input: Record<string, unknown>,
) {
  const row = await getReview(user, id);
  if (
    !["approve", "reject"].includes(String(input.decision)) ||
    !Number.isSafeInteger(input.expectedVersion) ||
    input.hash !== row.payload_hash
  )
    throw new HttpError(400, "검토 결정과 버전을 확인해 주세요.");
  if (row.status !== "pending") {
    if (
      (row.status === "applied" && input.decision === "approve") ||
      (row.status === "rejected" && input.decision === "reject")
    )
      return reviewInfo(row);
    throw new HttpError(409, "이미 종료되었거나 만료된 변경안입니다.");
  }
  if (Number(row.version) !== input.expectedVersion)
    throw new HttpError(409, "변경안이 갱신되었습니다. 다시 확인해 주세요.");
  const payload = String(row.payload_json);
  if (createHash("sha256").update(payload).digest("hex") !== row.payload_hash)
    throw new HttpError(409, "변경안 무결성을 확인할 수 없습니다.");
  const projectId = String(row.project_id),
    convId = String(row.conv_id),
    target = String(row.target_page) as AiTargetPage;
  const currentPolicy = await activeGuardrailPolicy(user.workspaceId);
  if (input.decision === "approve") await assertAiEnabled(user.workspaceId);
  const resolved = await validateTarget(user, projectId, target);
  const agent = createPageAgent(
    request,
    user,
    resolved.context,
    targetAiPage(target),
    resolved.canWrite,
    "",
    undefined,
    { policy: currentPolicy.policy, inspect: async () => undefined },
  );
  const data = JSON.parse(payload);
  agent.restoreChanges(data.changes);
  const tx = await db().transaction("write");
  try {
    const current = (
      await tx.execute({
        sql: "SELECT * FROM ai_change_reviews WHERE review_id=? AND user_id=? AND workspace_id=?",
        args: [id, user.id, user.workspaceId],
      })
    ).rows[0];
    if (
      !current ||
      current.status !== "pending" ||
      Number(current.version) !== input.expectedVersion
    )
      throw new HttpError(409, "이미 처리한 변경안입니다.");
    let status = input.decision === "reject" ? "rejected" : "applied";
    let actions: AiAction[] = [];
    if (String(current.expires_at) <= new Date().toISOString())
      status = "expired";
    if (status === "applied") {
      await projectAccess(tx, user, projectId);
      const conv = (
        await tx.execute({
          sql: "SELECT target_page,target_version,request_id,busy_until FROM ai_conversations WHERE conv_id=? AND workspace_id=? AND user_id=? AND project_id=?",
          args: [convId, user.workspaceId, user.id, projectId],
        })
      ).rows[0];
      if (
        !conv ||
        conv.target_page !== target ||
        Number(conv.target_version) !== Number(row.target_version) ||
        (conv.request_id && String(conv.busy_until) > new Date().toISOString())
      )
        throw new HttpError(409, "채팅 대상이 바뀌었거나 생성 중입니다.");
      const policy = await activeGuardrailPolicy(user.workspaceId, tx);
      if (
        policy.version !== Number(row.guardrail_version) ||
        policy.version !== currentPolicy.version ||
        !resolved.canWrite ||
        (await projectVersions(user, projectId, tx)) !==
          row.source_versions_json
      )
        status = "invalidated";
      else {
        await assertAiEnabled(user.workspaceId, tx);
        actions = await agent.commit(tx);
      }
    }
    await tx.execute({
      sql: "UPDATE ai_change_reviews SET status=?,version=version+1,decided_at=?,decided_by=?,applied_actions_json=? WHERE review_id=? AND status='pending' AND version=?",
      args: [
        status,
        new Date().toISOString(),
        user.id,
        JSON.stringify(actions),
        id,
        Number(row.version),
      ],
    });
    if (status === "applied")
      await tx.execute({
        sql: "UPDATE ai_generation_requests SET actions_json=? WHERE request_id=? AND user_id=? AND workspace_id=?",
        args: [
          JSON.stringify(actions),
          String(row.request_id),
          user.id,
          user.workspaceId,
        ],
      });
    const updated = (
      await tx.execute({
        sql: "SELECT * FROM ai_change_reviews WHERE review_id=?",
        args: [id],
      })
    ).rows[0];
    await tx.commit();
    if (status === "invalidated" || status === "expired")
      throw new HttpError(
        409,
        "원본·정책이 변경되었거나 만료되었습니다. 새 변경안을 요청해 주세요.",
      );
    return reviewInfo(updated);
  } catch (e) {
    try {
      await tx.rollback();
    } catch {}
    throw e;
  } finally {
    tx.close();
  }
}
