import "server-only";
import { randomUUID } from "node:crypto";
import type { Row, Transaction } from "@libsql/client";
import { db } from "../db";
import { HttpError } from "../auth";
import type { User } from "../types";
import { productAdminScope, type Executor } from "../product-access";
import { masterWorkspaceScope } from "../master-workspace-admin";
import { activeGuardrailPolicy } from "./guardrail-policy";
import { projectVersions, assertNoPendingReview } from "./change-reviews";
import { decryptImage, encryptImage } from "./image-crypto";
import {
  executionContext,
  executionHash,
  snapshotExecution,
  type ExecutionJournal,
} from "./execution-journal";
import { maskedExcerpt, policyNames } from "./guardrail-rule-catalog";
import type { GuardrailFinding } from "./guardrail-types";
import type { GuardrailApproval } from "./guardrail-approval-types";
import { validateFrozenHistory } from "./conversations";
import { requireTurn } from "./conversation-turns";
import { requireConsoleOwner } from "../ai-console-access";

type Manager = User & {
  workspaceMode: boolean;
  superMode: boolean;
  managedProductId: string;
  entryProjectId?: string;
};
type Payload = {
  format: 1 | 2;
  input: Record<string, unknown>;
  journal: ExecutionJournal;
};
const active = "('awaiting_choice','pending','approved')";
const now = () => new Date().toISOString();
const failure = (message: string, status = 409): never => {
  throw new HttpError(status, message, { code: "GUARDRAIL_STATE_CONFLICT" });
};
export function approvalVersion(value: unknown) {
  if (!Number.isSafeInteger(value) || Number(value) < 1)
    throw new HttpError(400, "최신 요청 버전을 확인해 주세요.");
  return Number(value);
}
export async function assertApprovalManager(
  actor: Manager,
  executor: Executor = db(),
) {
  if (actor.entryProjectId !== undefined)
    await requireConsoleOwner(actor, actor.entryProjectId, executor);
  if (actor.workspaceMode)
    await masterWorkspaceScope(actor, actor.workspaceId, executor);
  else {
    const product = await productAdminScope(
      actor,
      actor.managedProductId,
      executor,
      actor.superMode,
    );
    const workspace = await executor.execute({
      sql: "SELECT id FROM workspaces WHERE id=? AND product_id=?",
      args: [actor.workspaceId, product.id],
    });
    if (!workspace.rows.length)
      throw new HttpError(403, "관리 가능한 워크스페이스가 아닙니다.");
  }
}
export async function chatScopeHash(
  user: User,
  projectId: string,
  convId: string,
  executor: Executor = db(),
  legacy = false,
) {
  const rows = async (sql: string, args: string[]) =>
    (await executor.execute({ sql, args })).rows;
  const common = {
    user: await rows(
      "SELECT u.account_role,m.role FROM users u JOIN workspace_members m ON m.user_id=u.id WHERE u.id=? AND m.workspace_id=?",
      [user.id, user.workspaceId],
    ),
    subscription: await rows(
      "SELECT * FROM user_subscriptions WHERE user_id=?",
      [user.id],
    ),
    workspace: await rows(
      "SELECT id,name,plan,product_id FROM workspaces WHERE id=?",
      [user.workspaceId],
    ),
    conversation: await rows(
      `SELECT conv_id,target_page,target_version${legacy ? ",title_source" : ""} FROM ai_conversations WHERE conv_id=? AND workspace_id=? AND user_id=?`,
      [convId, user.workspaceId, user.id],
    ),
    ...(legacy
      ? {
          history: await rows(
            "SELECT id,created_at FROM ai_prompt_chats WHERE conv_id=? AND workspace_id=? AND user_id=? ORDER BY created_at,id",
            [convId, user.workspaceId, user.id],
          ),
        }
      : {}),
  };
  const project = projectId
    ? {
        versions: await projectVersions(user, projectId, executor),
        project: await rows(
          "SELECT id,name,description,status FROM projects WHERE id=? AND workspace_id=?",
          [projectId, user.workspaceId],
        ),
        members: await rows(
          "SELECT * FROM project_members WHERE project_id=? AND workspace_id=? ORDER BY user_id",
          [projectId, user.workspaceId],
        ),
        permissionPolicy: await rows(
          "SELECT * FROM project_permission_policies WHERE project_id=? AND workspace_id=?",
          [projectId, user.workspaceId],
        ),
        permissions: await rows(
          "SELECT * FROM project_role_tab_permissions WHERE project_id=? AND workspace_id=? ORDER BY role,tab_key",
          [projectId, user.workspaceId],
        ),
        files: await rows(
          "SELECT * FROM project_files WHERE project_id=? AND workspace_id=? ORDER BY id",
          [projectId, user.workspaceId],
        ),
        boards: await rows(
          "SELECT * FROM planning_boards WHERE project_id=? AND workspace_id=? ORDER BY id",
          [projectId, user.workspaceId],
        ),
        rag: await rows(
          "SELECT * FROM project_rag_generations WHERE project_id=? AND workspace_id=? ORDER BY id",
          [projectId, user.workspaceId],
        ),
        shared: await rows(
          "SELECT * FROM project_shared_answers WHERE project_id=? AND workspace_id=? ORDER BY id",
          [projectId, user.workspaceId],
        ),
      }
    : {
        projects: await rows(
          "SELECT id,name,description,status,updated_at FROM projects WHERE workspace_id=? ORDER BY id",
          [user.workspaceId],
        ),
        members: await rows(
          "SELECT m.user_id,m.role,u.name,u.job_title FROM workspace_members m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=? ORDER BY m.user_id",
          [user.workspaceId],
        ),
        posts: await rows(
          "SELECT * FROM team_posts WHERE workspace_id=? ORDER BY id",
          [user.workspaceId],
        ),
        requests: await rows(
          "SELECT * FROM team_join_requests WHERE workspace_id=? OR user_id=? ORDER BY id",
          [user.workspaceId, user.id],
        ),
      };
  return executionHash({ common, project });
}
function effectiveStatus(row: Row) {
  return ["awaiting_choice", "pending", "approved"].includes(
    String(row.status),
  ) && String(row.expires_at) <= now()
    ? "expired"
    : String(row.status);
}
function dto(
  row: Row,
  detail = false,
  manager = false,
  actorId = "",
): GuardrailApproval {
  const status = effectiveStatus(row);
  return {
    id: String(row.id),
    sequence: Number(row.approval_seq),
    turnId: row.turn_id ? String(row.turn_id) : undefined,
    turnSeq: row.turn_seq ? Number(row.turn_seq) : undefined,
    status,
    version: Number(row.version),
    originRequestId: String(row.origin_request_id),
    logicalRequestId: String(row.logical_request_id),
    workspaceId: String(row.workspace_id),
    projectId: String(row.project_id ?? ""),
    projectName: manager
      ? String(row.project_name ?? "프로젝트 없음")
      : row.project_id
        ? "현재 요청의 프로젝트"
        : "프로젝트 없음",
    convId: String(row.conv_id),
    userId: String(row.user_id),
    userName: String(row.user_name ?? ""),
    userEmail: String(row.user_email ?? ""),
    policyVersion: Number(row.policy_version),
    stage: String(row.stage),
    policies: policyNames(JSON.parse(String(row.rules_json))),
    targetPage: String(row.target_page),
    createdAt: String(row.created_at),
    requestedAt: row.requested_at ? String(row.requested_at) : null,
    expiresAt: String(row.expires_at),
    decidedAt: row.decided_at ? String(row.decided_at) : null,
    decidedBy: String(row.decider_name ?? ""),
    comment: String(row.comment),
    attemptRequestId: String(row.attempt_request_id ?? ""),
    canResume: !manager && status === "approved",
    canCancel:
      !manager &&
      ["awaiting_choice", "pending", "approved", "resuming"].includes(status),
    canDecide:
      manager &&
      status === "pending" &&
      (row.user_id !== actorId || Number(row.requester_project_manager) === 1),
    ...(detail
      ? {
          promptExcerpt: String(row.prompt_excerpt),
          ...(manager
            ? { inspectionExcerpt: String(row.inspection_excerpt) }
            : {}),
          pendingCount: Number(row.pending_count),
          imageCount: Number(row.image_count),
        }
      : {}),
  };
}
const select =
  "SELECT a.*,a.rowid AS approval_seq,(SELECT seq FROM ai_conversation_turns t WHERE t.turn_id=a.turn_id) AS turn_seq,u.name AS user_name,u.email AS user_email,p.name AS project_name,d.name AS decider_name,EXISTS(SELECT 1 FROM project_members pm JOIN workspace_members wm ON wm.workspace_id=pm.workspace_id AND wm.user_id=pm.user_id WHERE pm.project_id=p.id AND pm.workspace_id=a.workspace_id AND pm.user_id=a.user_id AND (p.owner_id=pm.user_id OR pm.role='admin') AND u.account_role!='guest' AND u.onboarding_complete=1) AS requester_project_manager FROM ai_guardrail_approvals a JOIN users u ON u.id=a.user_id LEFT JOIN projects p ON p.id=a.project_id AND p.workspace_id=a.workspace_id LEFT JOIN users d ON d.id=a.decided_by";
async function getRow(
  id: string,
  workspaceId: string,
  executor: Executor,
  userId?: string,
) {
  const row = (
    await executor.execute({
      sql: `${select} WHERE a.id=? AND a.workspace_id=?${userId ? " AND a.user_id=?" : ""}`,
      args: [id, workspaceId, ...(userId ? [userId] : [])],
    })
  ).rows[0];
  if (!row) throw new HttpError(404, "승인 요청을 찾을 수 없습니다.");
  return row;
}
async function event(
  tx: Executor,
  id: string,
  actorId: string,
  status: string,
  comment = "",
) {
  await tx.execute({
    sql: "INSERT INTO ai_guardrail_approval_events(id,approval_id,actor_id,status,comment,created_at) VALUES (?,?,?,?,?,?)",
    args: [randomUUID(), id, actorId, status, comment, now()],
  });
  await tx.execute({
    sql: "UPDATE ai_conversation_turns SET status=?,version=version+1 WHERE turn_id=(SELECT turn_id FROM ai_guardrail_approvals WHERE id=?) AND final_chat_id IS NULL",
    args: [status, id],
  });
}
async function expire(tx: Executor, userId: string, workspaceId: string) {
  const abandoned = await tx.execute({
    sql: "UPDATE ai_guardrail_approvals SET status='failed',checkpoint_json=NULL,version=version+1,finished_at=? WHERE workspace_id=? AND user_id=? AND status='resuming' AND lease_until<=? RETURNING id,attempt_request_id",
    args: [now(), workspaceId, userId, now()],
  });
  for (const row of abandoned.rows) {
    await tx.execute({
      sql: "UPDATE ai_generation_requests SET status='stop_requested' WHERE request_id=? AND status IN ('running','finalizing')",
      args: [String(row.attempt_request_id)],
    });
    await event(
      tx,
      String(row.id),
      userId,
      "failed",
      "실행 연결이 종료되어 복구할 수 없습니다. 새 요청을 제출해 주세요.",
    );
  }
  const result = await tx.execute({
    sql: `UPDATE ai_guardrail_approvals SET status='expired',checkpoint_json=NULL,version=version+1,finished_at=? WHERE workspace_id=? AND user_id=? AND status IN ${active} AND expires_at<=? RETURNING id`,
    args: [now(), workspaceId, userId, now()],
  });
  for (const row of result.rows)
    await event(tx, String(row.id), userId, "expired");
}
async function transaction<T>(fn: (tx: Transaction) => Promise<T>) {
  let tx: Transaction;
  try {
    tx = await db().transaction("write");
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      ["SQLITE_BUSY", "SQLITE_LOCKED"].includes(String(error.code))
    )
      failure("다른 요청을 처리 중입니다. 최신 상태를 확인해 주세요.");
    throw error;
  }
  try {
    const result = await fn(tx);
    await tx.commit();
    return result;
  } catch (error) {
    await tx.rollback();
    throw error;
  } finally {
    tx.close();
  }
}
async function cleanupDue(workspaceId: string, userId?: string) {
  const due = await db().execute({
    sql: `SELECT DISTINCT user_id FROM ai_guardrail_approvals WHERE workspace_id=? ${userId ? "AND user_id=?" : ""} AND ((status IN ${active} AND expires_at<=?) OR (status='resuming' AND lease_until<=?))`,
    args: [workspaceId, ...(userId ? [userId] : []), now(), now()],
  });
  if (due.rows.length)
    await transaction(async (tx) => {
      for (const row of due.rows)
        await expire(tx, String(row.user_id), workspaceId);
    });
}
export async function assertNoGuardrailWait(user: User, convId: string) {
  await transaction(async (tx) => {
    await expire(tx, user.id, user.workspaceId);
    const row = (
      await tx.execute({
        sql: "SELECT id FROM ai_guardrail_approvals WHERE workspace_id=? AND user_id=? AND conv_id=? AND status IN ('awaiting_choice','pending','approved','resuming') AND (context_version=1 OR status='resuming') AND id!=?",
        args: [
          user.workspaceId,
          user.id,
          convId,
          executionContext()?.approvalId ?? "",
        ],
      })
    ).rows[0];
    if (row && row.id !== executionContext()?.approvalId)
      failure(
        "실행 중이거나 이전 버전의 승인 요청이 있습니다. 처리 후 다시 시도해 주세요.",
      );
  });
}
export async function createApprovalChallenge(input: {
  user: User;
  requestId: string;
  convId: string;
  projectId: string;
  targetPage: string;
  targetVersion: number;
  policyVersion: number;
  sourceHash: string;
  eventId: string;
  stage: string;
  findings: GuardrailFinding[];
  operationKey: string;
  excerpt: string;
  requestInput: Record<string, unknown>;
  pendingCount: number;
}) {
  const id = randomUUID(),
    scope = executionContext();
  const payload: Payload = {
    format: scope?.journal.historyContext ? 2 : 1,
    input: input.requestInput,
    journal: snapshotExecution(),
  };
  const serialized = JSON.stringify(payload);
  if (Buffer.byteLength(serialized) > 16 * 1024 * 1024)
    throw new HttpError(
      413,
      "재개 자료가 너무 큽니다. 요청 범위를 줄여 주세요.",
    );
  const encrypted = encryptImage(
    Buffer.from(serialized),
    Buffer.from(`${id}:${input.user.workspaceId}:${input.user.id}`),
  );
  await transaction(async (tx) => {
    await expire(tx, input.user.id, input.user.workspaceId);
    if (scope?.approvalId) {
      await tx.execute({
        sql: "UPDATE ai_guardrail_approvals SET status='reblocked',version=version+1,checkpoint_json=NULL,finished_at=? WHERE id=? AND status='resuming'",
        args: [now(), scope.approvalId],
      });
      await event(tx, scope.approvalId, input.user.id, "reblocked");
    }
    await tx.execute({
      sql: `INSERT INTO ai_guardrail_approvals(id,workspace_id,user_id,project_id,conv_id,origin_request_id,logical_request_id,parent_id,event_id,policy_version,stage,rules_json,operation_key,target_page,target_version,source_hash,prompt_excerpt,inspection_excerpt,pending_count,image_count,checkpoint_json,checkpoint_hash,created_at,expires_at,turn_id,context_version) VALUES (${Array(26).fill("?").join(",")})`,
      args: [
        id,
        input.user.workspaceId,
        input.user.id,
        input.projectId || null,
        input.convId,
        input.requestId,
        scope?.journal.logicalRequestId ?? input.requestId,
        scope?.approvalId ?? null,
        input.eventId,
        input.policyVersion,
        input.stage,
        JSON.stringify(input.findings),
        input.operationKey,
        input.targetPage,
        input.targetVersion,
        input.sourceHash,
        maskedExcerpt(input.requestInput.prompt),
        maskedExcerpt(input.excerpt),
        input.pendingCount,
        Array.isArray(input.requestInput.images)
          ? input.requestInput.images.length
          : 0,
        JSON.stringify(encrypted),
        executionHash(payload),
        now(),
        new Date(Date.now() + 30 * 60000).toISOString(),
        scope?.journal.turn?.id ?? null,
        payload.format,
      ],
    });
    if (scope?.journal.turn)
      await tx.execute({
        sql: "UPDATE ai_conversation_turns SET prompt_excerpt=? WHERE turn_id=?",
        args: [maskedExcerpt(input.requestInput.prompt), scope.journal.turn.id],
      });
    await event(tx, id, input.user.id, "awaiting_choice");
  });
  return getApproval(input.user, id);
}
export async function getApproval(user: User, id: string, manager?: Manager) {
  if (manager) await assertApprovalManager(manager);
  await cleanupDue(
    manager?.workspaceId ?? user.workspaceId,
    manager ? undefined : user.id,
  );
  if (!manager)
    await transaction((tx) => expire(tx, user.id, user.workspaceId));
  const row = await getRow(
    id,
    manager?.workspaceId ?? user.workspaceId,
    db(),
    manager ? undefined : user.id,
  );
  if (manager && !row.requested_at)
    throw new HttpError(404, "승인 요청을 찾을 수 없습니다.");
  const result = dto(row, true, !!manager, user.id);
  const events = await db().execute({
    sql: "SELECT e.status,e.comment,e.created_at,u.name FROM ai_guardrail_approval_events e JOIN users u ON u.id=e.actor_id WHERE approval_id=? ORDER BY e.created_at,e.rowid",
    args: [id],
  });
  result.events = events.rows.map((e) => ({
    status: String(e.status),
    comment: String(e.comment),
    createdAt: String(e.created_at),
    actorName: String(e.name),
  }));
  return result;
}
export async function userApprovals(
  user: User,
  convId: string,
  turnIds: string[] = [],
) {
  await cleanupDue(user.workspaceId, user.id);
  await transaction((tx) => expire(tx, user.id, user.workspaceId));
  const result = await db().execute({
    sql: `${select} WHERE a.workspace_id=? AND a.user_id=? AND a.conv_id=? AND (a.status IN ('awaiting_choice','pending','approved','resuming') OR ${turnIds.length ? `a.turn_id IN (${turnIds.map(() => "?").join(",")})` : "a.rowid IN (SELECT rowid FROM ai_guardrail_approvals WHERE workspace_id=? AND user_id=? AND conv_id=? ORDER BY rowid DESC LIMIT 20)"}) ORDER BY a.created_at DESC,a.rowid DESC`,
    args: [
      user.workspaceId,
      user.id,
      convId,
      ...(turnIds.length ? turnIds : [user.workspaceId, user.id, convId]),
    ],
  });
  return result.rows.map((row) => dto(row, true));
}
async function validRow(row: Row, tx: Executor) {
  const policy = await activeGuardrailPolicy(String(row.workspace_id), tx);
  const owner = {
    id: String(row.user_id),
    workspaceId: String(row.workspace_id),
  } as User;
  if (Number(row.context_version) === 2) {
    try {
      const payload = approvalPayload(row);
      if (
        !payload.journal.historyContext ||
        !payload.journal.turn ||
        payload.journal.turn.id !== row.turn_id
      )
        return false;
      await requireTurn(owner, String(row.conv_id), String(row.turn_id), tx);
      await validateFrozenHistory(
        owner,
        String(row.project_id ?? ""),
        String(row.conv_id),
        payload.journal.historyContext,
        tx,
      );
    } catch (error) {
      // A temporary DB/key/service failure must not destroy a durable grant.
      if (error instanceof HttpError && [403, 404, 409].includes(error.status))
        return false;
      throw error;
    }
  }
  return (
    policy.policy.aiEnabled &&
    policy.version === Number(row.policy_version) &&
    row.checkpoint_json !== null &&
    row.source_hash ===
      (await chatScopeHash(
        owner,
        String(row.project_id ?? ""),
        String(row.conv_id),
        tx,
        Number(row.context_version) === 1,
      ))
  );
}
function approvalPayload(row: Row): Payload {
  const payload = JSON.parse(
    decryptImage(
      JSON.parse(String(row.checkpoint_json)),
      Buffer.from(`${row.id}:${row.workspace_id}:${row.user_id}`),
    ).toString(),
  ) as Payload;
  if (
    ![1, 2].includes(payload.format) ||
    payload.journal.format !== 1 ||
    executionHash(payload) !== row.checkpoint_hash
  )
    failure("저장된 재개 자료를 검증하지 못했습니다.");
  return payload;
}
export async function userApprovalDecision(
  user: User,
  id: string,
  action: string,
  version: number,
) {
  await transaction(async (tx) => {
    await expire(tx, user.id, user.workspaceId);
    const row = await getRow(id, user.workspaceId, tx, user.id);
    const target =
      action === "request_approval"
        ? "pending"
        : action === "decline"
          ? "declined"
          : action === "cancel"
            ? "cancelled"
            : "";
    if (!target) throw new HttpError(400, "처리 방법을 확인해 주세요.");
    if (row.status === target) return; // Response-loss retry is idempotent.
    if (Number(row.version) !== version)
      failure("요청 상태가 변경되었습니다. 새로고침해 주세요.");
    if (target === "pending" || target === "declined") {
      if (row.status !== "awaiting_choice") failure("이미 선택한 요청입니다.");
    } else if (
      !["awaiting_choice", "pending", "approved"].includes(String(row.status))
    )
      failure(
        "이미 실행 중이거나 종료된 요청입니다. 실행 중이면 생성 중지를 사용해 주세요.",
      );
    const stamp = now();
    await tx.execute({
      sql: "UPDATE ai_guardrail_approvals SET status=?,version=version+1,requested_at=CASE WHEN ?='pending' THEN ? ELSE requested_at END,expires_at=CASE WHEN ?='pending' THEN ? ELSE expires_at END,checkpoint_json=CASE WHEN ?='pending' THEN checkpoint_json ELSE NULL END,finished_at=CASE WHEN ?='pending' THEN NULL ELSE ? END WHERE id=? AND version=?",
      args: [
        target,
        target,
        stamp,
        target,
        new Date(Date.now() + 86400000).toISOString(),
        target,
        target,
        stamp,
        id,
        version,
      ],
    });
    await event(tx, id, user.id, target);
  });
  return getApproval(user, id);
}
export async function decideApproval(
  actor: Manager,
  id: string,
  decision: string,
  version: number,
  comment: unknown,
) {
  if (
    !["approve", "reject"].includes(decision) ||
    typeof comment !== "string" ||
    !comment.trim() ||
    comment.trim().length > 1000
  )
    throw new HttpError(400, "처리 의견을 1~1,000자로 입력해 주세요.");
  const outcome = await transaction(async (tx) => {
    await assertApprovalManager(actor, tx);
    const row = await getRow(id, actor.workspaceId, tx);
    if (row.user_id === actor.id && Number(row.requester_project_manager) !== 1)
      throw new HttpError(
        403,
        "해당 프로젝트 관리자만 자신의 요청을 승인·반려할 수 있습니다.",
      );
    const target = decision === "approve" ? "approved" : "rejected";
    if (
      row.status === target &&
      row.decided_by === actor.id &&
      row.comment === maskedExcerpt(comment.trim(), 1000)
    )
      return "ok";
    if (row.status !== "pending" || Number(row.version) !== version)
      failure("다른 관리자가 먼저 처리했거나 상태가 변경되었습니다.");
    const invalid =
      effectiveStatus(row) === "expired"
        ? "expired"
        : !(await validRow(row, tx))
          ? "invalidated"
          : "";
    const status = invalid || target;
    await tx.execute({
      sql: "UPDATE ai_guardrail_approvals SET status=?,version=version+1,comment=?,decided_by=?,decided_at=?,checkpoint_json=CASE WHEN ?='approved' THEN checkpoint_json ELSE NULL END WHERE id=? AND version=? AND status='pending'",
      args: [
        status,
        maskedExcerpt(comment.trim(), 1000),
        actor.id,
        now(),
        status,
        id,
        version,
      ],
    });
    await event(tx, id, actor.id, status, maskedExcerpt(comment.trim(), 1000));
    return invalid;
  });
  if (outcome && outcome !== "ok")
    failure("원본·정책이 변경되었거나 만료되었습니다. 새 요청이 필요합니다.");
  return getApproval(actor, id, actor);
}
export async function claimApproval(
  user: User,
  id: string,
  version: number,
  attemptId: string,
) {
  const result = await transaction(async (tx) => {
    const row = await getRow(id, user.workspaceId, tx, user.id);
    if (row.status !== "approved" || Number(row.version) !== version)
      failure("승인 후 아직 실행하지 않은 요청만 이어서 진행할 수 있습니다.");
    await assertNoPendingReview(user, String(row.conv_id), tx);
    const invalid =
      effectiveStatus(row) === "expired"
        ? "expired"
        : !(await validRow(row, tx))
          ? "invalidated"
          : "";
    if (invalid) {
      await tx.execute({
        sql: "UPDATE ai_guardrail_approvals SET status=?,version=version+1,checkpoint_json=NULL WHERE id=?",
        args: [invalid, id],
      });
      await event(tx, id, user.id, invalid);
      return null;
    }
    const payload = approvalPayload(row);
    if (
      ![1, 2].includes(payload.format) ||
      payload.journal.format !== 1 ||
      executionHash(payload) !== row.checkpoint_hash
    )
      failure("저장된 재개 자료를 검증하지 못했습니다.");
    if (row.turn_id)
      payload.journal.turn = await requireTurn(
        user,
        String(row.conv_id),
        String(row.turn_id),
        tx,
      );
    if (!payload.journal.grants.includes(String(row.operation_key)))
      payload.journal.grants.push(String(row.operation_key));
    const duplicate = await tx.execute({
      sql: "SELECT request_id FROM ai_generation_requests WHERE request_id=?",
      args: [attemptId],
    });
    if (duplicate.rows.length) failure("이미 사용한 실행 요청 ID입니다.");
    const stamp = now();
    const room = await tx.execute({
      sql: "UPDATE ai_conversations SET request_id=?,busy_until=? WHERE conv_id=? AND workspace_id=? AND user_id=? AND (request_id IS NULL OR busy_until<?) RETURNING conv_id",
      args: [
        attemptId,
        new Date(Date.now() + 240000).toISOString(),
        String(row.conv_id),
        user.workspaceId,
        user.id,
        stamp,
      ],
    });
    if (!room.rows.length)
      failure("다른 답변을 생성 중입니다. 완료 후 이어서 진행해 주세요.");
    await tx.execute({
      sql: "UPDATE ai_guardrail_approvals SET status='resuming',version=version+1,attempt_request_id=?,lease_until=? WHERE id=? AND status='approved' AND version=?",
      args: [
        attemptId,
        new Date(Date.now() + 240000).toISOString(),
        id,
        version,
      ],
    });
    await event(tx, id, user.id, "resuming");
    return payload;
  });
  if (!result)
    failure("원본·정책이 변경되었거나 만료되었습니다. 새 요청이 필요합니다.");
  return result!;
}
export async function finishApproval(
  user: User,
  id: string,
  status: string,
  executor?: Executor,
) {
  const finish = async (tx: Executor) => {
    const changed = await tx.execute({
      sql: "UPDATE ai_guardrail_approvals SET status=?,version=version+1,checkpoint_json=NULL,finished_at=? WHERE id=? AND user_id=? AND workspace_id=? AND status='resuming' RETURNING id",
      args: [status, now(), id, user.id, user.workspaceId],
    });
    if (changed.rows.length) await event(tx, id, user.id, status);
  };
  if (executor) await finish(executor);
  else await transaction(finish);
}

export async function cancelConversationApprovals(
  user: User,
  convId: string,
  executor: Executor,
) {
  const result = await executor.execute({
    sql: "UPDATE ai_guardrail_approvals SET status='cancelled',checkpoint_json=NULL,version=version+1,finished_at=? WHERE workspace_id=? AND user_id=? AND conv_id=? AND status IN ('awaiting_choice','pending','approved') RETURNING id",
    args: [now(), user.workspaceId, user.id, convId],
  });
  for (const row of result.rows)
    await event(executor, String(row.id), user.id, "cancelled");
}

export async function approvalQueue(actor: Manager, params: URLSearchParams) {
  await assertApprovalManager(actor);
  await cleanupDue(actor.workspaceId);
  const args: (string | number)[] = [actor.workspaceId],
    clauses = ["a.workspace_id=?", "a.requested_at IS NOT NULL"];
  const state = `CASE WHEN a.status IN ${active} AND a.expires_at<='${now()}' THEN 'expired' ELSE a.status END`;
  const tab = params.get("tab") ?? "pending";
  clauses.push(
    tab === "approved"
      ? `${state}='approved'`
      : tab === "history"
        ? `${state} NOT IN ('pending','approved')`
        : `${state}='pending'`,
  );
  for (const [key, column] of [
    ["projectId", "a.project_id"],
    ["stage", "a.stage"],
    ["status", state],
  ] as const) {
    const value = params.get(key);
    if (value === "none" && key === "projectId")
      clauses.push("a.project_id IS NULL");
    else if (value) {
      clauses.push(`${column}=?`);
      args.push(value);
    }
  }
  const search = params.get("search")?.trim();
  if (search) {
    clauses.push(
      "(instr(lower(u.name),lower(?))>0 OR instr(lower(COALESCE(u.email,'')),lower(?))>0)",
    );
    args.push(search.slice(0, 100), search.slice(0, 100));
  }
  const rule = params.get("rule");
  if (rule) {
    clauses.push(
      "EXISTS(SELECT 1 FROM json_each(a.rules_json) j WHERE json_extract(j.value,'$.rule')=?)",
    );
    args.push(rule);
  }
  for (const key of ["from", "to"]) {
    const date = params.get(key);
    if (!date) continue;
    const time = Date.parse(`${date}T00:00:00+09:00`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(time) ||
      new Date(time + 9 * 3600000).toISOString().slice(0, 10) !== date
    )
      throw new HttpError(400, "검색 날짜를 확인해 주세요.");
    clauses.push(`a.requested_at${key === "from" ? ">=" : "<"}?`);
    args.push(
      new Date(
        Date.parse(`${date}T00:00:00+09:00`) + (key === "to" ? 86400000 : 0),
      ).toISOString(),
    );
  }
  const cursor = params.get("cursor");
  const descending = tab === "history";
  if (cursor) {
    let parsed: string[];
    try {
      parsed = JSON.parse(Buffer.from(cursor, "base64url").toString());
    } catch {
      throw new HttpError(400, "목록 커서를 확인해 주세요.");
    }
    if (
      !Array.isArray(parsed) ||
      parsed.length !== 2 ||
      !parsed.every((v) => typeof v === "string" && v.length < 100)
    )
      throw new HttpError(400, "목록 커서를 확인해 주세요.");
    const op = descending ? "<" : ">";
    clauses.push(`(a.requested_at${op}? OR (a.requested_at=? AND a.id${op}?))`);
    args.push(parsed[0], parsed[0], parsed[1]);
  }
  const rows = await db().execute({
    sql: `${select} WHERE ${clauses.join(" AND ")} ORDER BY a.requested_at ${descending ? "DESC" : "ASC"},a.id ${descending ? "DESC" : "ASC"} LIMIT 21`,
    args,
  });
  const page = rows.rows.slice(0, 20),
    last = page.at(-1);
  const projects = await db().execute({
    sql: "SELECT id,name FROM projects WHERE workspace_id=? ORDER BY name,id",
    args: [actor.workspaceId],
  });
  return {
    requests: page.map((row) => dto(row, false, true, actor.id)),
    nextCursor:
      rows.rows.length > 20 && last
        ? Buffer.from(JSON.stringify([last.requested_at, last.id])).toString(
            "base64url",
          )
        : null,
    projects: projects.rows,
  };
}
export async function approvalCounts(actor: Manager) {
  await assertApprovalManager(actor);
  await cleanupDue(actor.workspaceId);
  const rows = await db().execute({
    sql: `SELECT status,COUNT(*) AS n FROM ai_guardrail_approvals WHERE workspace_id=? AND requested_at IS NOT NULL AND (status='resuming' OR (status IN ('pending','approved') AND expires_at>?)) GROUP BY status`,
    args: [actor.workspaceId, now()],
  });
  return Object.fromEntries(
    ["pending", "approved", "resuming"].map((status) => [
      status,
      Number(rows.rows.find((row) => row.status === status)?.n ?? 0),
    ]),
  );
}
