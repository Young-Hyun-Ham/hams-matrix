import "server-only";
import { db } from "@/lib/db";
import type { Row } from "@libsql/client";
import type { User } from "@/lib/types";
import type { Mode, Artifact } from "./types";
import { activeGuardrailPolicy } from "@/lib/ai/guardrail-policy";
import { HttpError, userInWorkspace } from "@/lib/auth";
import { workspacePlan } from "@/lib/plans";
import { blob, putBlob, documentBlob } from "./storage";
import { exportDocument } from "./document-export";
import type { DocumentFormat } from "./document-formats";
import { executeDecision } from "./decision";
import { ClarificationPaused, resolvedChoices } from "./clarification";
import { inspect, PolicyPaused, auditApproval } from "./policy";
import { callModel, type ModelResult } from "./providers";
import {
  currentActor,
  fail,
  future,
  hash,
  now,
  number,
  object,
  ownerArgs,
  owned,
  seal,
  transaction,
  unseal,
  uuid,
} from "./server";
import { reviewDTO } from "./repository";
import {
  assembleDocument,
  documentSource,
  type DocumentImage,
} from "./document";
type Input = {
  prompt: string;
  mode: Mode;
  modelId: string;
  format: string;
  history: { role: string; content: string }[];
  attachments: { id: string; storageKey: string; mime: string; hash: string }[];
  artifact?: {
    id: string;
    versionId: string;
    baseVersion: number;
    storageKey: string;
    mime: string;
  };
};
export async function assertLive(u: User, r: Row) {
  await currentActor(u);
  const current = await owned("chatbot_requests", u, String(r.id));
  if (current.stop_requested || current.status === "cancelled")
    fail(409, "요청이 중단되었습니다.");
  if (r.conversation_id)
    await owned("chatbot_conversations", u, String(r.conversation_id));
  const policy = await activeGuardrailPolicy(u.workspaceId);
  if (policy.version !== Number(r.policy_version) || !policy.policy.aiEnabled)
    fail(409, "정책이 변경되었습니다.");
  await workspacePlan(u.id, u.workspaceId);
}
export async function finishRequest(
  u: User,
  r: Row,
  status: string,
  content?: Record<string, unknown>,
) {
  await transaction(async (tx) => {
    if (content && r.turn_id)
      await tx.execute({
        sql: "INSERT INTO chatbot_messages(id,workspace_id,user_id,conversation_id,turn_id,role,content_json,created_at) VALUES (?,?,?,?,?,'assistant',?,?) ON CONFLICT(turn_id,role) DO UPDATE SET content_json=excluded.content_json",
        args: [
          uuid(),
          ...ownerArgs(u),
          r.conversation_id,
          r.turn_id,
          JSON.stringify(content),
          now(),
        ],
      });
    await tx.execute({
      sql: "UPDATE chatbot_requests SET status=?,lease_until=NULL,finished_at=? WHERE id=?",
      args: [status, now(), r.id],
    });
    if (r.turn_id)
      await tx.execute({
        sql: "UPDATE chatbot_turns SET status=?,version=version+1 WHERE id=?",
        args: [status, r.turn_id],
      });
    if (status === "completed")
      await tx.execute({
        sql: "UPDATE chatbot_policy_approvals SET status='completed',version=version+1 WHERE request_id=? AND status='resuming'",
        args: [r.id],
      });
  });
}
async function createArtifact(
  u: User,
  r: Row,
  input: Input,
  result: ModelResult,
  images: DocumentImage[] = [],
  signal?: AbortSignal,
) {
  const documentText =
    input.mode === "file"
      ? assembleDocument(result.text, images, input.format)
      : result.text;
  const exported =
    input.mode === "file"
      ? await exportDocument(documentText, input.format, signal)
      : undefined;
  const bytes =
    exported?.bytes ??
    (result.base64
      ? Buffer.from(result.base64, "base64")
      : Buffer.from(documentText, "utf8"));
  const aid = input.artifact?.id ?? uuid(),
    vid = uuid(),
    storageKey = await putBlob(u, vid, bytes, exported?.source);
  const artifact: Artifact = {
    id: aid,
    versionId: vid,
    title: input.prompt.slice(0, 60),
    kind: input.mode,
    ...(input.mode === "file"
      ? { format: input.format as DocumentFormat }
      : {}),
    version: (input.artifact?.baseVersion ?? 0) + 1,
    url: `/api/chatbot/artifacts/${aid}/versions/${vid}/download`,
  };
  let before = "";
  if (input.artifact && input.mode === "file")
    before = await documentBlob(
      u,
      input.artifact.versionId,
      input.artifact.storageKey,
    );
  await assertLive(u, r);
  await transaction(async (tx) => {
    if (input.artifact) {
      const current = await owned("chatbot_artifacts", u, aid, tx);
      artifact.title = String(current.title);
      if (Number(current.version) !== input.artifact.baseVersion)
        fail(409, "생성물의 원본 버전이 변경되었습니다.");
      const pending = (
        await tx.execute({
          sql: "SELECT id FROM chatbot_reviews WHERE workspace_id=? AND user_id=? AND source_hash=? AND status='pending'",
          args: [...ownerArgs(u), hash(input.artifact)],
        })
      ).rows[0];
      if (pending) fail(409, "이 생성물에 검토 대기 변경안이 있습니다.");
    } else
      await tx.execute({
        sql: "INSERT INTO chatbot_artifacts(id,workspace_id,user_id,conversation_id,kind,title,created_at) VALUES (?,?,?,?,?,?,?)",
        args: [
          aid,
          ...ownerArgs(u),
          r.conversation_id,
          input.mode,
          artifact.title,
          now(),
        ],
      });
    const next = Number(
      (
        await tx.execute({
          sql: "SELECT COALESCE(MAX(version_number),0)+1 AS n FROM chatbot_artifact_versions WHERE artifact_id=?",
          args: [aid],
        })
      ).rows[0].n,
    );
    artifact.version = next;
    await tx.execute({
      sql: "INSERT INTO chatbot_artifact_versions(id,workspace_id,user_id,artifact_id,version_number,base_version_id,request_id,format,mime_type,size_bytes,sha256,storage_key,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      args: [
        vid,
        ...ownerArgs(u),
        aid,
        next,
        input.artifact?.versionId ?? null,
        r.id,
        exported?.extension ?? result.format ?? input.format,
        exported?.mime ??
          result.mime ??
          (input.format === "txt"
            ? "text/plain; charset=utf-8"
            : "text/markdown; charset=utf-8"),
        bytes.length,
        hash(bytes.toString("base64")),
        storageKey,
        input.artifact ? "candidate" : "published",
        now(),
      ],
    });
    await tx.execute({
      sql: "UPDATE chatbot_blob_uploads SET status='linked' WHERE id=?",
      args: [vid],
    });
    if (!input.artifact)
      await tx.execute({
        sql: "UPDATE chatbot_artifacts SET current_version_id=?,version=? WHERE id=?",
        args: [vid, next, aid],
      });
    else {
      const id = uuid(),
        payload = {
          artifactId: aid,
          versionId: vid,
          base: input.artifact,
          artifact,
          before,
          after: input.mode === "file" ? exported!.source : "이미지 수정 후보",
          summary:
            input.mode === "image"
              ? "이미지 새 버전으로 변경"
              : "문서 새 버전으로 변경",
        };
      await tx.execute({
        sql: "INSERT INTO chatbot_reviews(id,workspace_id,user_id,request_id,kind,status,payload_ciphertext,payload_hash,source_hash,policy_version,expires_at,created_at) VALUES (?,?,?,?,'artifact','pending',?,?,?,?,?,?)",
        args: [
          id,
          ...ownerArgs(u),
          r.id,
          seal(u, id, payload),
          hash(payload),
          hash(input.artifact),
          r.policy_version,
          future(),
          now(),
        ],
      });
    }
  });
  return artifact;
}
export async function executeMessage(u: User, r: Row, signal: AbortSignal) {
  const input = unseal<Input>(u, String(r.id), r.input_ciphertext),
    images: { mime: string; base64: string }[] = [];
  let reference = "";
  for (const a of input.attachments ?? []) {
    const bytes = await blob(u, a.id, a.storageKey);
    if (hash(bytes.toString("base64")) !== a.hash)
      fail(409, "첨부 내용이 변경되었습니다.");
    if (a.mime.startsWith("image/"))
      images.push({ mime: a.mime, base64: bytes.toString("base64") });
    else reference += `\n[참조 문서]\n${bytes.toString("utf8")}`;
  }
  if (input.artifact) {
    const a = await owned("chatbot_artifacts", u, input.artifact.id);
    if (Number(a.version) !== input.artifact.baseVersion)
      fail(409, "원본 버전이 변경되었습니다.");
    const bytes = await blob(
      u,
      input.artifact.versionId,
      input.artifact.storageKey,
    );
    if (input.mode === "image")
      images.unshift({
        mime: input.artifact.mime,
        base64: bytes.toString("base64"),
      });
    else {
      const original = documentSource(
        await documentBlob(
          u,
          input.artifact.versionId,
          input.artifact.storageKey,
        ),
      );
      images.unshift(...original.images);
      reference += `\n[수정할 원본 문서]\n${original.content}`;
    }
  }
  if (input.mode === "file" && images.length > 6)
    fail(413, "문서에 사용할 이미지는 최대 6개입니다.");
  await assertLive(u, r);
  let result = r.result_ciphertext
    ? unseal<ModelResult>(u, String(r.id), r.result_ciphertext)
    : undefined;
  if (!result) {
    await inspect(u, r, "input", input.prompt, images, signal);
    await inspect(
      u,
      r,
      "context",
      JSON.stringify(input.history) + reference,
      [],
      signal,
    );
    result =
      input.mode === "chat"
        ? await executeDecision(u, r, input, images, reference, signal)
        : await callModel(
            u,
            String(r.id),
            { ...input, images, prompt: input.prompt + reference },
            signal,
          );
    // Persist paid output before output inspection. Resume never regenerates it.
    await db().execute({
      sql: "UPDATE chatbot_requests SET result_ciphertext=? WHERE id=?",
      args: [seal(u, String(r.id), result), r.id],
    });
  }
  await inspect(
    u,
    r,
    "output",
    result.text,
    result.base64 ? [{ mime: "image/png", base64: result.base64 }] : [],
    signal,
  );
  await assertLive(u, r);
  if (input.mode === "chat")
    return finishRequest(u, r, "completed", {
      text: result.text,
      resolvedContext: await resolvedChoices(u, String(r.id)),
    });
  const artifact = await createArtifact(u, r, input, result, images, signal);
  return finishRequest(u, r, input.artifact ? "waiting_review" : "completed", {
    text: input.artifact
      ? "수정안을 만들었습니다. 변경 내용을 검토해 주세요."
      : input.mode === "file"
        ? "문서를 생성했습니다."
        : result.text,
    ...(input.artifact ? {} : { artifact }),
  });
}
export async function review(u: User, id: string, raw?: unknown) {
  const r = await owned("chatbot_reviews", u, id);
  if (!raw) return reviewDTO(u, r);
  const b = object(raw);
  return transaction(async (tx) => {
    const liveActor = await currentActor(u, tx);
    const current = await owned("chatbot_reviews", u, id, tx),
      req = await owned("chatbot_requests", u, String(current.request_id), tx);
    if (
      current.status !== "pending" ||
      Number(current.version) !== number(b.expectedVersion) ||
      String(current.expires_at) <= now() ||
      req.stop_requested
    )
      fail(409, "변경안이 만료되었거나 이미 처리되었습니다.");
    if (!["approve", "reject"].includes(String(b.decision)))
      fail(400, "결정을 확인해 주세요.");
    const payload = unseal<Record<string, unknown>>(
      u,
      id,
      current.payload_ciphertext,
    );
    if (hash(payload) !== current.payload_hash)
      fail(409, "변경안 무결성을 확인하지 못했습니다.");
    const approve = b.decision === "approve";
    const policy = await activeGuardrailPolicy(u.workspaceId, tx);
    if (
      approve &&
      (policy.version !== Number(current.policy_version) ||
        !policy.policy.aiEnabled)
    )
      fail(409, "정책이 변경되었습니다.");
    let status = approve ? "applied" : "rejected";
    if (current.kind === "artifact") {
      const base = object(payload.base),
        a = await owned("chatbot_artifacts", u, String(payload.artifactId), tx);
      await owned("chatbot_conversations", u, String(a.conversation_id), tx);
      if (
        approve &&
        (Number(a.version) !== Number(base.baseVersion) ||
          a.current_version_id !== base.versionId)
      )
        fail(409, "원본이 변경되어 변경안을 적용할 수 없습니다.");
      await tx.execute({
        sql: "UPDATE chatbot_artifact_versions SET status=? WHERE id=? AND status='candidate'",
        args: [approve ? "published" : "rejected", String(payload.versionId)],
      });
      if (approve) {
        const v = await owned(
          "chatbot_artifact_versions",
          u,
          String(payload.versionId),
          tx,
        );
        await tx.execute({
          sql: "UPDATE chatbot_artifacts SET current_version_id=?,version=? WHERE id=?",
          args: [v.id, v.version_number, a.id],
        });
        await tx.execute({
          sql: "UPDATE chatbot_messages SET content_json=? WHERE turn_id=? AND role='assistant'",
          args: [
            JSON.stringify({
              text: "승인한 수정 버전을 적용했습니다.",
              artifact: payload.artifact,
            }),
            req.turn_id,
          ],
        });
      }
      await tx.execute({
        sql: "UPDATE chatbot_requests SET status='completed' WHERE id=?",
        args: [req.id],
      });
      await tx.execute({
        sql: "UPDATE chatbot_turns SET status='completed' WHERE id=?",
        args: [req.turn_id],
      });
    } else {
      const { assertBuilderAccess } = await import(
        "@/app/(builder)/server/access"
      );
      const run = await owned(
        "chatbot_scenario_runs",
        u,
        String(req.run_id),
        tx,
      );
      if (run.source === "builder-simulation") assertBuilderAccess(liveActor);
      if (
        approve &&
        hash(String(run.checkpoint_ciphertext)) !== current.source_hash
      )
        fail(409, "실행 문맥이 변경되었습니다.");
      status = approve ? "approved" : "rejected";
      await tx.execute({
        sql: "UPDATE chatbot_requests SET status=?,stop_requested=? WHERE id=?",
        args: [approve ? "queued" : "cancelled", approve ? 0 : 1, req.id],
      });
      await tx.execute({
        sql: "UPDATE chatbot_scenario_runs SET status=?,version=version+1 WHERE id=?",
        args: [approve ? "queued" : "cancelled", run.id],
      });
    }
    await tx.execute({
      sql: "UPDATE chatbot_reviews SET status=?,version=version+1,decided_by=?,decided_at=? WHERE id=?",
      args: [status, u.id, now(), id],
    });
    await auditApproval(tx, u, current, "review", status);
    if (req.run_id) {
      const { appendRunEvent } = await import("./scenarios");
      await appendRunEvent(tx, u, String(req.run_id), "review_decision", "", {
        text: approve ? "API 실행을 승인했습니다." : "API 실행을 거절했습니다.",
      });
    }

    return { id, status, version: Number(current.version) + 1 };
  });
}
export async function executeJob(id: string) {
  const r = (
    await db().execute({
      sql: "SELECT * FROM chatbot_requests WHERE id=?",
      args: [id],
    })
  ).rows[0];
  if (!r) return;
  const u = await userInWorkspace(String(r.user_id), String(r.workspace_id));
  if (!u || !u.onboardingComplete || u.accountRole === "guest")
    return markFailed(id, "ACCESS_REVOKED");
  const controller = new AbortController(),
    timeout = setTimeout(() => controller.abort(), 240000);
  const timer = setInterval(() => {
    void owned("chatbot_requests", u, id)
      .then((current) => {
        if (current.stop_requested) controller.abort();
      })
      .catch(() => controller.abort());
  }, 1500);
  try {
    await executeMessage(u, r, controller.signal);
  } catch (e) {
    if (!(e instanceof PolicyPaused) && !(e instanceof ClarificationPaused))
      await markFailed(
        id,
        controller.signal.aborted
          ? "INTERRUPTED"
          : e instanceof HttpError
            ? `HTTP_${e.status}`
            : "PROVIDER_UNKNOWN",
      );
  } finally {
    clearTimeout(timeout);
    clearInterval(timer);
  }
}
export async function markFailed(id: string, code: string) {
  await db().execute({
    sql: "UPDATE chatbot_requests SET status=CASE WHEN stop_requested=1 THEN 'cancelled' WHEN ? IN ('PROVIDER_UNKNOWN','INTERRUPTED') THEN 'unknown' ELSE 'failed' END,error_code=?,lease_until=NULL,finished_at=? WHERE id=?",
    args: [code, code, now(), id],
  });
  await db().execute({
    sql: "UPDATE chatbot_turns SET status=(SELECT status FROM chatbot_requests WHERE id=?) WHERE id=(SELECT turn_id FROM chatbot_requests WHERE id=?)",
    args: [id, id],
  });
}
export async function reviewPreview(u: User, id: string, before = false) {
  const r = await owned("chatbot_reviews", u, id);
  if (
    r.kind !== "artifact" ||
    !["pending", "applied"].includes(String(r.status))
  )
    fail(404, "검토 미리보기를 찾을 수 없습니다.");
  const req = await owned("chatbot_requests", u, String(r.request_id));
  if (req.conversation_id)
    await owned("chatbot_conversations", u, String(req.conversation_id));
  const payload = unseal<{ versionId: string; base: { versionId: string } }>(
    u,
    id,
    r.payload_ciphertext,
  );
  const v = await owned(
    "chatbot_artifact_versions",
    u,
    before ? payload.base.versionId : payload.versionId,
  );
  const bytes = await blob(u, String(v.id), v.storage_key);
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": String(v.mime_type).startsWith("image/")
        ? String(v.mime_type)
        : "text/plain; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
