import "server-only";
import { db } from "@/lib/db";
import type { User } from "@/lib/types";
import type { Settings, Message, Mode } from "./types";
import { chatbotThemes, defaultSettings } from "./theme-presets";
import {
  fail,
  hash,
  now,
  future,
  object,
  text,
  number,
  requestKey,
  ownerArgs,
  owned,
  transaction,
  uuid,
  seal,
  unseal,
} from "./server";

export async function settings(u: User): Promise<Settings> {
  const r = (
    await db().execute({
      sql: "SELECT settings_json,version FROM chatbot_user_settings WHERE workspace_id=? AND user_id=?",
      args: ownerArgs(u),
    })
  ).rows[0];
  return r
    ? {
        ...defaultSettings,
        ...JSON.parse(String(r.settings_json)),
        version: Number(r.version),
      }
    : { ...defaultSettings };
}
export async function saveSettings(u: User, raw: unknown) {
  const b = object(raw),
    version = number(b.expectedVersion);
  if (
    typeof b.themePreset !== "string" ||
    !Object.hasOwn(chatbotThemes, b.themePreset) ||
    !["ko", "en"].includes(String(b.language)) ||
    typeof b.truncateLongResponses !== "boolean"
  )
    fail(400, "설정값을 확인해 주세요.");
  const value = {
    themePreset: b.themePreset,
    language: b.language,
    truncateLongResponses: b.truncateLongResponses,
    inputPlaceholder: text(b.inputPlaceholder, 150),
  };
  await transaction(async (tx) => {
    const r = (
      await tx.execute({
        sql: "SELECT version FROM chatbot_user_settings WHERE workspace_id=? AND user_id=?",
        args: ownerArgs(u),
      })
    ).rows[0];
    if (Number(r?.version ?? 0) !== version)
      fail(409, "설정이 변경되었습니다. 새로 열어 확인해 주세요.");
    await tx.execute({
      sql: "INSERT INTO chatbot_user_settings(workspace_id,user_id,settings_json,version,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(workspace_id,user_id) DO UPDATE SET settings_json=excluded.settings_json,version=excluded.version,updated_at=excluded.updated_at",
      args: [...ownerArgs(u), JSON.stringify(value), version + 1, now()],
    });
  });
  return settings(u);
}
export async function conversations(u: User, cursor = "") {
  const rows = (
    await db().execute({
      sql: "SELECT id,title,version FROM chatbot_conversations WHERE workspace_id=? AND user_id=? AND deleted_at IS NULL AND (?='' OR id<?) ORDER BY id DESC LIMIT 21",
      args: [...ownerArgs(u), cursor, cursor],
    })
  ).rows;
  return {
    conversations: rows.slice(0, 20).map((r) => ({
      id: String(r.id),
      title: String(r.title),
      version: Number(r.version),
    })),
    nextCursor: rows.length > 20 ? String(rows[19].id) : null,
  };
}
export async function createConversation(u: User, raw: unknown) {
  const b = object(raw),
    key = requestKey(b.clientRequestId),
    payloadHash = hash({ title: b.title ?? "새 채팅" });
  return transaction(async (tx) => {
    const existing = (
      await tx.execute({
        sql: "SELECT * FROM chatbot_conversations WHERE workspace_id=? AND user_id=? AND create_request_id=?",
        args: [...ownerArgs(u), key],
      })
    ).rows[0];
    if (existing) {
      if (existing.create_payload_hash !== payloadHash || existing.deleted_at)
        fail(409, "이미 사용한 요청 ID입니다.");
      return {
        id: String(existing.id),
        title: String(existing.title),
        version: Number(existing.version),
      };
    }
    // Timestamp prefix makes list cursors deterministic even when titles change.
    const id = `${Date.now()}-${uuid()}`,
      title = text(b.title ?? "새 채팅", 100);
    await tx.execute({
      sql: "INSERT INTO chatbot_conversations(id,workspace_id,user_id,create_request_id,create_payload_hash,title,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)",
      args: [id, ...ownerArgs(u), key, payloadHash, title, now(), now()],
    });
    return { id, title, version: 1 };
  });
}
export async function editConversation(
  u: User,
  id: string,
  raw: unknown,
  remove = false,
) {
  const b = object(raw);
  return transaction(async (tx) => {
    const r = await owned("chatbot_conversations", u, id, tx);
    if (number(b.expectedVersion) !== Number(r.version))
      fail(409, "채팅방이 변경되었습니다.");
    if (remove) {
      const busy = (
        await tx.execute({
          sql: "SELECT id FROM chatbot_requests WHERE conversation_id=? AND status IN ('queued','running','waiting_review','waiting_policy_approval') LIMIT 1",
          args: [id],
        })
      ).rows[0];
      if (busy)
        fail(409, "진행 중인 요청을 중단하거나 검토를 마친 후 삭제해 주세요.");
      const waiting = (
        await tx.execute({
          sql: "SELECT id,turn_id FROM chatbot_requests WHERE conversation_id=? AND status='waiting_clarification'",
          args: [id],
        })
      ).rows;
      for (const request of waiting) {
        await (
          await import("./clarification")
        ).cancelRequestClarifications(tx, u, String(request.id));
        await tx.execute({
          sql: "UPDATE chatbot_requests SET status='cancelled',stop_requested=1,finished_at=? WHERE id=?",
          args: [now(), request.id],
        });
        await tx.execute({
          sql: "UPDATE chatbot_turns SET status='cancelled',version=version+1 WHERE id=?",
          args: [request.turn_id],
        });
      }
      await tx.execute({
        sql: "UPDATE chatbot_conversations SET deleted_at=?,version=version+1 WHERE id=?",
        args: [now(), id],
      });
    } else
      await tx.execute({
        sql: "UPDATE chatbot_conversations SET title=?,title_source='manual',version=version+1,updated_at=? WHERE id=?",
        args: [text(b.title, 100), now(), id],
      });
    return {
      id,
      title: remove ? String(r.title) : text(b.title, 100),
      version: Number(r.version) + 1,
    };
  });
}
export async function requestStatus(u: User, id: string) {
  const r = await owned("chatbot_requests", u, id);
  if (r.conversation_id)
    await owned("chatbot_conversations", u, String(r.conversation_id));
  return {
    id,
    status: String(r.status),
    errorCode: r.error_code ? String(r.error_code) : undefined,
  };
}
export async function stopRequest(u: User, id: string) {
  await owned("chatbot_requests", u, id);
  await transaction(async (tx) => {
    const { cancelRequestClarifications } = await import("./clarification");
    await cancelRequestClarifications(tx, u, id);
    await tx.execute({
      sql: "UPDATE chatbot_turns SET status='cancelled',version=version+1 WHERE id=(SELECT turn_id FROM chatbot_requests WHERE id=?) AND status='waiting_clarification'",
      args: [id],
    });
    await tx.execute({
      sql: "UPDATE chatbot_requests SET stop_requested=1,status=CASE WHEN status='running' THEN status ELSE 'cancelled' END WHERE id=? AND status NOT IN ('completed','failed','cancelled','unknown')",
      args: [id],
    });
    await tx.execute({
      sql: "UPDATE chatbot_reviews SET status='rejected',version=version+1 WHERE request_id=? AND status='pending'",
      args: [id],
    });
    await tx.execute({
      sql: "UPDATE chatbot_policy_approvals SET status='cancelled',version=version+1 WHERE request_id=? AND status IN ('awaiting_choice','pending','approved')",
      args: [id],
    });
  });
  return requestStatus(u, id);
}
export async function messages(
  u: User,
  id: string,
  before = Number.MAX_SAFE_INTEGER,
) {
  if (!Number.isSafeInteger(before) || before <= 0)
    fail(400, "대화 커서를 확인해 주세요.");
  await owned("chatbot_conversations", u, id);
  const turns = (
    await db().execute({
      sql: "SELECT t.*,r.id AS request_id,r.status AS request_status,r.error_code FROM chatbot_turns t JOIN chatbot_requests r ON r.turn_id=t.id WHERE t.workspace_id=? AND t.user_id=? AND t.conversation_id=? AND t.seq<? ORDER BY t.seq DESC LIMIT 21",
      args: [...ownerArgs(u), id, before],
    })
  ).rows;
  const output: Message[] = [];
  for (const t of turns.slice(0, 20).reverse()) {
    const rows = (
      await db().execute({
        sql: "SELECT * FROM chatbot_messages WHERE turn_id=? ORDER BY CASE role WHEN 'user' THEN 0 ELSE 1 END",
        args: [t.id],
      })
    ).rows;
    for (const m of rows)
      output.push({
        id: String(m.id),
        seq: Number(t.seq),
        role: String(m.role),
        status: String(t.request_status),
        ...JSON.parse(String(m.content_json)),
      });
    const review = (
      await db().execute({
        sql: "SELECT * FROM chatbot_reviews WHERE request_id=? ORDER BY created_at DESC LIMIT 1",
        args: [t.request_id],
      })
    ).rows[0];
    const approval = (
      await db().execute({
        sql: "SELECT a.*,e.rule_codes_json FROM chatbot_policy_approvals a JOIN chatbot_policy_events e ON e.id=a.event_id WHERE a.request_id=? ORDER BY a.created_at DESC LIMIT 1",
        args: [t.request_id],
      })
    ).rows[0];
    output.push({
      id: `status:${t.id}`,
      seq: Number(t.seq),
      role: "status",
      text: t.error_code
        ? "요청을 완료하지 못했습니다. 상태를 확인해 주세요."
        : "",
      status: String(t.request_status),
      requestId: String(t.request_id),
      clarifications: await (
        await import("./clarification")
      ).requestClarifications(u, {
        ...t,
        id: t.request_id,
        status: t.request_status,
      }),
      review: review ? reviewDTO(u, review) : undefined,
      approval: approval
        ? {
            id: String(approval.id),
            status: String(approval.status),
            version: Number(approval.version),
            requestId: String(t.request_id),
            rules: JSON.parse(String(approval.rule_codes_json)).map(
              (r: { rule: string }) => r.rule,
            ),
          }
        : undefined,
    });
  }
  return {
    messages: output,
    nextCursor: turns.length > 20 ? Number(turns[19].seq) : null,
  };
}
export function reviewDTO(u: User, r: import("@libsql/client").Row) {
  const p = unseal<{ before?: string; after?: string; summary: string }>(
    u,
    String(r.id),
    r.payload_ciphertext,
  );
  return {
    id: String(r.id),
    kind: String(r.kind),
    status: String(r.status),
    version: Number(r.version),
    before: p.before,
    after: p.after,
    summary: p.summary,
  };
}
export async function createMessage(u: User, id: string, raw: unknown) {
  (await import("./maintenance")).chatbotMaintenanceGuard();
  const b = object(raw),
    prompt = text(b.prompt, 12000),
    key = requestKey(b.clientRequestId),
    mode = String(b.mode || "chat") as Mode;
  if (!["chat", "image", "file"].includes(mode))
    fail(400, "생성 모드를 확인해 주세요.");
  const { isDocumentFormat } = await import("./document-formats");
  if (mode === "file" && b.format !== undefined && !isDocumentFormat(b.format))
    fail(400, "지원하는 문서 형식을 선택해 주세요.");
  const payloadHash = hash({ ...b, conversationId: id });
  const { allowedModel, models } = await import("./providers");
  const modelId =
    mode === "chat" ? text(b.modelId, 150) : (await models(mode)).defaultModel;
  if (mode === "chat") await allowedModel(mode, modelId);
  const attachmentIds = Array.isArray(b.attachmentIds)
    ? b.attachmentIds.map((v) => text(v, 100))
    : [];
  if (attachmentIds.length > 3) fail(400, "첨부는 최대 3개입니다.");
  return transaction(async (tx) => {
    const room = await owned("chatbot_conversations", u, id, tx);
    const existing = (
      await tx.execute({
        sql: "SELECT id,payload_hash FROM chatbot_requests WHERE workspace_id=? AND user_id=? AND operation='message' AND client_request_id=?",
        args: [...ownerArgs(u), key],
      })
    ).rows[0];
    if (existing) {
      if (existing.payload_hash !== payloadHash)
        fail(409, "다른 요청에 사용한 요청 ID입니다.");
      return { requestId: String(existing.id) };
    }
    if (
      (
        await tx.execute({
          sql: "SELECT id FROM chatbot_requests WHERE conversation_id=? AND status IN ('queued','running')",
          args: [id],
        })
      ).rows.length
    )
      fail(409, "이 방에서 요청을 처리 중입니다.");
    const attachments = [];
    for (const attachmentId of attachmentIds) {
      const a = await owned("chatbot_attachments", u, attachmentId, tx);
      if (
        a.conversation_id !== id ||
        a.status !== "ready" ||
        String(a.expires_at) <= now()
      )
        fail(400, "첨부를 다시 업로드해 주세요.");
      attachments.push({
        id: attachmentId,
        mime: a.mime_type,
        hash: a.sha256,
        storageKey: a.storage_key,
      });
    }
    let artifact: Record<string, unknown> | undefined;
    if (b.artifactId) {
      const a = await owned(
        "chatbot_artifacts",
        u,
        text(b.artifactId, 100),
        tx,
      );
      if (
        a.conversation_id !== id ||
        a.kind !== mode ||
        Number(a.version) !== number(b.baseVersion) ||
        !a.current_version_id
      )
        fail(409, "수정 대상 버전이 변경되었습니다.");
      const v = await owned(
        "chatbot_artifact_versions",
        u,
        String(a.current_version_id),
        tx,
      );
      artifact = {
        id: a.id,
        baseVersion: a.version,
        versionId: v.id,
        storageKey: v.storage_key,
        mime: v.mime_type,
      };
      if (
        (
          await tx.execute({
            sql: "SELECT v.id FROM chatbot_reviews v JOIN chatbot_requests r ON r.id=v.request_id WHERE r.conversation_id=? AND v.status='pending'",
            args: [id],
          })
        ).rows.length
      )
        fail(409, "기존 변경안을 먼저 검토해 주세요.");
    }
    const history = (
      await tx.execute({
        sql: "SELECT m.role,m.content_json FROM chatbot_messages m JOIN chatbot_turns t ON t.id=m.turn_id WHERE m.conversation_id=? AND t.status='completed' ORDER BY t.seq DESC,CASE m.role WHEN 'assistant' THEN 0 ELSE 1 END LIMIT 20",
        args: [id],
      })
    ).rows
      .reverse()
      .map((r) => {
        const content = JSON.parse(String(r.content_json));
        const resolved = Array.isArray(content.resolvedContext)
          ? content.resolvedContext
              .slice(0, 3)
              .filter(
                (v: { field?: unknown; value?: unknown }) =>
                  typeof v?.field === "string" && typeof v?.value === "string",
              )
              .map((v: { field: string; value: string }) => ({
                field: v.field.slice(0, 64),
                value: v.value.slice(0, 500),
              }))
          : [];
        return {
          role: String(r.role),
          content:
            String(content.text ?? "").slice(0, 6000) +
            (resolved.length
              ? "\n[사용자가 확정한 조건(데이터)]\n" + JSON.stringify(resolved)
              : ""),
        };
      });
    const rid = uuid(),
      turn = uuid(),
      input = {
        prompt,
        mode,
        modelId,
        attachments,
        artifact,
        format: isDocumentFormat(b.format) ? b.format : "md",
        history,
      };
    const { activeGuardrailPolicy } = await import("@/lib/ai/guardrail-policy");
    const policy = await activeGuardrailPolicy(u.workspaceId, tx);
    if (!policy.policy.aiEnabled) fail(403, "관리자가 AI 사용을 중단했습니다.");
    await tx.execute({
      sql: "INSERT INTO chatbot_turns(id,workspace_id,user_id,conversation_id,seq,mode,model_id,logical_request_id,status,created_at) VALUES (?,?,?,?,?,?,?,?,'queued',?)",
      args: [
        turn,
        ...ownerArgs(u),
        id,
        room.next_seq,
        mode,
        modelId,
        rid,
        now(),
      ],
    });
    await tx.execute({
      sql: "INSERT INTO chatbot_requests(id,workspace_id,user_id,conversation_id,turn_id,logical_request_id,operation,client_request_id,payload_hash,mode,model_id,status,input_ciphertext,attachment_ids_json,policy_version,created_at) VALUES (?,?,?,?,?,?,'message',?,?,?,?,'queued',?,?,?,?)",
      args: [
        rid,
        ...ownerArgs(u),
        id,
        turn,
        rid,
        key,
        payloadHash,
        mode,
        modelId,
        seal(u, rid, input),
        JSON.stringify(attachmentIds),
        policy.version,
        now(),
      ],
    });
    await tx.execute({
      sql: "INSERT INTO chatbot_messages(id,workspace_id,user_id,conversation_id,turn_id,role,content_json,created_at) VALUES (?,?,?,?,?,'user',?,?)",
      args: [
        uuid(),
        ...ownerArgs(u),
        id,
        turn,
        JSON.stringify({ text: prompt, mode }),
        now(),
      ],
    });
    await tx.execute({
      sql: "UPDATE chatbot_conversations SET next_seq=next_seq+1,updated_at=?,title=CASE WHEN title_source='auto' AND next_seq=1 THEN ? ELSE title END,version=version+1 WHERE id=?",
      args: [now(), prompt.slice(0, 100), id],
    });
    return { requestId: rid };
  });
}
export async function usage(u: User) {
  return (
    await db().execute({
      sql: "SELECT purpose,model_id,status,SUM(total_tokens) AS totalTokens,SUM(image_count) AS imageCount,COUNT(*) AS calls FROM chatbot_usage WHERE workspace_id=? AND user_id=? GROUP BY purpose,model_id,status",
      args: ownerArgs(u),
    })
  ).rows.map((r) => ({ ...r }));
}
export { future };

export async function stopConversation(u: User, id: string) {
  await owned("chatbot_conversations", u, id);
  const rows = (
    await db().execute({
      sql: "SELECT id FROM chatbot_requests WHERE conversation_id=? AND status IN ('queued','running')",
      args: [id],
    })
  ).rows;
  for (const row of rows) await stopRequest(u, String(row.id));
  return { stopRequested: rows.length };
}
