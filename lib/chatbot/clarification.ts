import "server-only";
import type { Row, Transaction } from "@libsql/client";
import type { User } from "@/lib/types";
import { db } from "@/lib/db";
import { activeGuardrailPolicy } from "@/lib/ai/guardrail-policy";
import { workspacePlan } from "@/lib/plans";
import {
  currentActor,
  fail,
  future,
  hash,
  now,
  number,
  object,
  owned,
  ownerArgs,
  requestKey,
  seal,
  text,
  transaction,
  unseal,
  uuid,
} from "./server";
import type { Decision } from "./decision-schema";
export class ClarificationPaused extends Error {}
export type ResolvedChoice = {
  field: string;
  label: string;
  value: string;
  intent: string;
};
export async function resolvedChoices(
  u: User,
  requestId: string,
  executor: Pick<Transaction, "execute"> = db(),
) {
  const rows = (
    await executor.execute({
      sql: "SELECT * FROM chatbot_clarifications WHERE workspace_id=? AND user_id=? AND request_id=? AND status='answered' ORDER BY round LIMIT 3",
      args: [...ownerArgs(u), requestId],
    })
  ).rows;
  return rows.map((row) =>
    unseal<ResolvedChoice>(
      u,
      String(row.id) + ":answer",
      row.selected_ciphertext,
    ),
  );
}
const checkpoint = (request: Row, choices: ResolvedChoice[]) =>
  hash({
    input: request.input_ciphertext,
    policy: request.policy_version,
    choices,
  });
async function event(
  tx: Transaction,
  u: User,
  card: Record<string, unknown>,
  type: string,
  key: string,
  payload: unknown,
) {
  const id = uuid();
  await tx.execute({
    sql: "INSERT INTO chatbot_clarification_events(id,workspace_id,user_id,clarification_id,request_id,event_type,client_request_id,payload_hash,event_ciphertext,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
    args: [
      id,
      ...ownerArgs(u),
      String(card.id),
      String(card.request_id),
      type,
      key,
      hash(payload),
      seal(u, id, payload),
      now(),
    ],
  });
}
export function clarificationDTO(u: User, card: Row, request: Row) {
  const payload = unseal<Decision>(u, String(card.id), card.payload_ciphertext);
  const expired = card.status === "pending" && String(card.expires_at) <= now();
  return {
    id: String(card.id),
    requestId: String(card.request_id),
    round: Number(card.round),
    version: Number(card.version),
    status: expired ? "expired" : String(card.status),
    title: payload.title,
    message: payload.text,
    options: payload.options,
    allowCustom: payload.allowCustom,
    expiresAt: String(card.expires_at),
    canAnswer:
      card.status === "pending" &&
      !expired &&
      request.status === "waiting_clarification" &&
      !request.stop_requested,
    selected: card.selected_ciphertext
      ? unseal<ResolvedChoice>(
          u,
          String(card.id) + ":answer",
          card.selected_ciphertext,
        )
      : undefined,
  };
}
export async function getClarification(u: User, id: string) {
  const card = await owned("chatbot_clarifications", u, id),
    request = await owned("chatbot_requests", u, String(card.request_id));
  await owned("chatbot_conversations", u, String(card.conversation_id));
  return clarificationDTO(u, card, request);
}
export async function requestClarifications(u: User, request: Row) {
  const rows = (
    await db().execute({
      sql: "SELECT * FROM chatbot_clarifications WHERE workspace_id=? AND user_id=? AND request_id=? ORDER BY round LIMIT 3",
      args: [...ownerArgs(u), request.id],
    })
  ).rows;
  return rows.map((c) => clarificationDTO(u, c, request));
}
export async function presentClarification(
  u: User,
  request: Row,
  decision: Decision,
  choices: ResolvedChoice[],
) {
  if (choices.length >= 3)
    fail(502, "정보 보완 한도를 넘었습니다. 조건을 포함해 새로 요청해 주세요.");
  await transaction(async (tx) => {
    await currentActor(u, tx);
    const live = await owned("chatbot_requests", u, String(request.id), tx);
    await owned("chatbot_conversations", u, String(live.conversation_id), tx);
    const policy = await activeGuardrailPolicy(u.workspaceId, tx);
    if (
      policy.version !== Number(live.policy_version) ||
      !policy.policy.aiEnabled
    )
      fail(409, "정책이 변경되었습니다.");
    if (
      live.status !== "running" ||
      live.stop_requested ||
      live.policy_version !== request.policy_version
    )
      fail(409, "요청 상태가 변경되었습니다.");
    const existing = (
      await tx.execute({
        sql: "SELECT id FROM chatbot_clarifications WHERE request_id=? AND round=?",
        args: [request.id, choices.length + 1],
      })
    ).rows[0];
    if (!existing) {
      const id = uuid(),
        created = now();
      await tx.execute({
        sql: "INSERT INTO chatbot_clarifications(id,workspace_id,user_id,conversation_id,request_id,turn_id,round,field_key,intent,status,input_hash,checkpoint_hash,payload_ciphertext,expires_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,'pending',?,?,?,?,?)",
        args: [
          id,
          ...ownerArgs(u),
          live.conversation_id,
          live.id,
          live.turn_id,
          choices.length + 1,
          decision.field,
          decision.intent,
          live.payload_hash,
          checkpoint(live, choices),
          seal(u, id, decision),
          future(),
          created,
        ],
      });
      await event(tx, u, { id, request_id: live.id }, "presented", id, {
        round: choices.length + 1,
        field: decision.field,
      });
    }
    await tx.execute({
      sql: "UPDATE chatbot_policy_approvals SET status='completed',version=version+1 WHERE request_id=? AND status='resuming'",
      args: [request.id],
    });
    await tx.execute({
      sql: "UPDATE chatbot_requests SET status='waiting_clarification',lease_until=NULL,finished_at=NULL WHERE id=?",
      args: [request.id],
    });
    await tx.execute({
      sql: "UPDATE chatbot_turns SET status='waiting_clarification',version=version+1 WHERE id=?",
      args: [live.turn_id],
    });
  });
  throw new ClarificationPaused();
}
export async function cancelRequestClarifications(
  tx: Transaction,
  u: User,
  requestId: string,
  status = "cancelled",
) {
  const rows = (
    await tx.execute({
      sql: "SELECT * FROM chatbot_clarifications WHERE workspace_id=? AND user_id=? AND request_id=? AND status='pending'",
      args: [...ownerArgs(u), requestId],
    })
  ).rows;
  for (const card of rows) {
    await tx.execute({
      sql: "UPDATE chatbot_clarifications SET status=?,version=version+1,resolved_at=? WHERE id=?",
      args: [status, now(), card.id],
    });
    await event(tx, u, card, status, uuid(), { status });
  }
}
export async function answerClarification(
  u: User,
  id: string,
  raw: unknown,
  cancel = false,
) {
  if (!cancel) (await import("./maintenance")).chatbotMaintenanceGuard();
  const body = object(raw),
    key = requestKey(body.clientRequestId),
    expected = number(body.expectedVersion),
    payloadHash = hash({ id, cancel, body });
  await workspacePlan(u.id, u.workspaceId);
  return transaction(async (tx) => {
    await currentActor(u, tx);
    const card = await owned("chatbot_clarifications", u, id, tx),
      r = await owned("chatbot_requests", u, String(card.request_id), tx);
    await owned("chatbot_conversations", u, String(card.conversation_id), tx);
    const type = cancel ? "cancelled" : "answered";
    const old = (
      await tx.execute({
        sql: "SELECT * FROM chatbot_clarification_events WHERE workspace_id=? AND user_id=? AND event_type=? AND client_request_id=?",
        args: [...ownerArgs(u), type, key],
      })
    ).rows[0];
    if (old) {
      if (old.payload_hash !== payloadHash)
        fail(409, "다른 선택에 사용한 요청 ID입니다.");
      return { requestId: String(r.id), accepted: true };
    }
    if (
      card.status !== "pending" ||
      Number(card.version) !== expected ||
      String(card.expires_at) <= now() ||
      r.stop_requested ||
      r.status !== "waiting_clarification"
    )
      fail(
        409,
        "이미 처리되었거나 만료된 선택입니다. 상태를 새로고침해 주세요.",
      );
    const policy = await activeGuardrailPolicy(u.workspaceId, tx);
    if (
      !cancel &&
      (policy.version !== Number(r.policy_version) || !policy.policy.aiEnabled)
    )
      fail(409, "정책이 변경되었습니다. 취소하고 다시 요청해 주세요.");
    const choices = await resolvedChoices(u, String(r.id), tx);
    if (
      card.input_hash !== r.payload_hash ||
      card.checkpoint_hash !== checkpoint(r, choices)
    )
      fail(409, "선택의 원래 문맥이 변경되었습니다.");
    if (cancel) {
      await tx.execute({
        sql: "UPDATE chatbot_clarifications SET status='cancelled',version=version+1,resolved_at=? WHERE id=?",
        args: [now(), id],
      });
      await event(tx, u, card, type, key, { id, cancel, body });
      await tx.execute({
        sql: "UPDATE chatbot_requests SET status='cancelled',stop_requested=1,finished_at=? WHERE id=?",
        args: [now(), r.id],
      });
      await tx.execute({
        sql: "UPDATE chatbot_turns SET status='cancelled',version=version+1 WHERE id=?",
        args: [r.turn_id],
      });
      return { requestId: String(r.id), accepted: true };
    }
    const payload = unseal<Decision>(u, id, card.payload_ciphertext);
    let value: string, label: string;
    if (body.customValue !== undefined) {
      const option = payload.options.find((o) => o.id === body.optionId);
      if (
        body.optionId !== undefined
          ? option?.action !== "custom"
          : !payload.allowCustom
      )
        fail(400, "직접 지정할 수 없는 항목입니다.");
      value = text(body.customValue, 500);
      label = value;
    } else {
      const option = payload.options.find((o) => o.id === body.optionId);
      if (!option || option.action !== "select")
        fail(400, "제시된 선택지의 값을 지정해 주세요.");
      value = option.value;
      label = option.label;
    }
    const active = (
      await tx.execute({
        sql: "SELECT id FROM chatbot_requests WHERE conversation_id=? AND status IN ('queued','running')",
        args: [r.conversation_id],
      })
    ).rows[0];
    if (active)
      fail(
        409,
        "다른 질문을 처리 중입니다. 잠시 후 이 선택을 다시 제출해 주세요.",
      );
    const selected = {
      field: String(card.field_key),
      intent: String(card.intent),
      label,
      value,
    };
    await tx.execute({
      sql: "UPDATE chatbot_clarifications SET status='answered',version=version+1,selected_ciphertext=?,resolved_at=? WHERE id=?",
      args: [seal(u, id + ":answer", selected), now(), id],
    });
    await event(tx, u, card, type, key, { id, cancel, body });
    await tx.execute({
      sql: "UPDATE chatbot_requests SET status='queued',lease_until=NULL,finished_at=NULL WHERE id=?",
      args: [r.id],
    });
    await tx.execute({
      sql: "UPDATE chatbot_turns SET status='queued',version=version+1 WHERE id=?",
      args: [r.turn_id],
    });
    return { requestId: String(r.id), accepted: true };
  }).catch((e) => {
    if (
      /SQLITE_(BUSY|LOCKED)|SQLITE_CONSTRAINT_UNIQUE/.test(
        String(e?.code) + String(e?.extendedCode),
      )
    )
      fail(
        409,
        "다른 선택이나 질문이 먼저 처리되었습니다. 상태를 새로고침한 뒤 다시 시도해 주세요.",
      );
    throw e;
  });
}
export async function cleanupClarifications() {
  const rows = (
    await db().execute({
      sql: "SELECT c.*,r.status AS request_status FROM chatbot_clarifications c JOIN chatbot_requests r ON r.id=c.request_id JOIN chatbot_conversations v ON v.id=c.conversation_id WHERE c.status='pending' AND (c.expires_at<? OR r.stop_requested=1 OR v.deleted_at IS NOT NULL OR r.status IN ('failed','cancelled','completed','unknown')) LIMIT 100",
      args: [now()],
    })
  ).rows;
  for (const c of rows)
    await transaction(async (tx) => {
      const u = {
        id: String(c.user_id),
        workspaceId: String(c.workspace_id),
      } as User;
      const current = await owned(
        "chatbot_clarifications",
        u,
        String(c.id),
        tx,
      );
      if (current.status !== "pending") return;
      const status =
        String(current.expires_at) <= now() ? "expired" : "invalidated";
      await cancelRequestClarifications(tx, u, String(c.request_id), status);
      await tx.execute({
        sql: "UPDATE chatbot_requests SET status='cancelled',stop_requested=1,finished_at=? WHERE id=? AND status='waiting_clarification'",
        args: [now(), c.request_id],
      });
      await tx.execute({
        sql: "UPDATE chatbot_turns SET status='cancelled',version=version+1 WHERE id=? AND status='waiting_clarification'",
        args: [c.turn_id],
      });
    });
}
