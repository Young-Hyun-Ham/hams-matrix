import { randomUUID } from "node:crypto";
import { body, checkOrigin, errorResponse, HttpError, requireUser, rateLimit } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeGuardrailPolicy, requireGuardrailAdmin, validateGuardrailPolicy } from "@/lib/ai/guardrail-policy";
import { createGuardrailSession } from "@/lib/ai/guardrails";
import { defaultGuardrailPolicy, type GuardrailStage, type GuardrailResult } from "@/lib/ai/guardrail-types";
import { validateAiImages } from "@/lib/ai/chat-images";
import { extractGuardrailFiles } from "@/lib/ai/guardrail-files";
import { createTokenTracker } from "@/lib/ai/token-usage";
import { aiModels } from "@/lib/ai-server";
import { memberPlan } from "@/lib/plans";

const headers = { "Cache-Control": "private, no-store" };
export async function GET() {
  try {
    const user = await requireUser();
    requireGuardrailAdmin(user);
    const results = await Promise.all([
      activeGuardrailPolicy(user.workspaceId),
      db().execute({ sql: "SELECT draft_json,draft_revision FROM ai_guardrail_configs WHERE workspace_id=?", args: [user.workspaceId] }),
      db().execute({ sql: "SELECT version,published_by,published_at,restored_from FROM ai_guardrail_policies WHERE workspace_id=? ORDER BY version DESC LIMIT 50", args: [user.workspaceId] }),
      db().execute({ sql: "SELECT id,request_id,policy_version,stage,decision,rules_json,duration_ms,created_at FROM ai_guardrail_events WHERE workspace_id=? ORDER BY created_at DESC LIMIT 100", args: [user.workspaceId] }),
    ]);
    const row = results[1].rows[0];
    return Response.json({ active: results[0], draft: row ? JSON.parse(String(row.draft_json)) : defaultGuardrailPolicy,
      revision: Number(row?.draft_revision ?? 0), versions: results[2].rows,
      events: results[3].rows.map(event => ({ ...event, findings: JSON.parse(String(event.rules_json)), rules_json: undefined })),
    }, { headers });
  } catch (error) { return errorResponse(error); }
}
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    requireGuardrailAdmin(user);
    const input = await body(request, 20 * 1024 * 1024);
    if (input.action === "test") {
      await rateLimit(`guardrail-test:${user.workspaceId}:${user.id}`, 20);
      const policy = validateGuardrailPolicy(input.policy);
      const text = input.text === undefined ? "" : input.text;
      if (typeof text !== "string" || text.length > 10000 || !["input", "context", "tool", "tool-result", "output"].includes(String(input.stage))) throw new HttpError(400, "검사 단계와 최대 10,000자의 테스트 내용을 확인해 주세요.");
      const signal = AbortSignal.any([request.signal, AbortSignal.timeout(140000)]);
      const images = validateAiImages(input.images, (await memberPlan(user.id)).attachmentLimit);
      const files = await extractGuardrailFiles(input.files, signal);
      if (!text.trim() && !images.length && !files.length) throw new HttpError(400, "테스트 내용이나 첨부 파일을 추가해 주세요.");
      if (policy.classifierEnabled && !(await aiModels()).includes(policy.classifierModel)) throw new HttpError(400, "사용 가능한 검사 모델을 선택해 주세요.");
      const requestId = randomUUID();
      const checkpoint = async () => { signal.throwIfAborted(); };
      const guard = createGuardrailSession({ workspaceId: user.workspaceId, userId: user.id, requestId, version: 0, policy, checkpoint,
        track: createTokenTracker({ workspaceId: user.workspaceId, userId: user.id, projectId: "", projectName: "", convId: "guardrail-policy-test", conversationTitle: "가드레일 정책 테스트", chatId: requestId, requestId, model: policy.classifierModel, prompt: text + files.map(file => file.text).join("\n") }),
      });
      const stage = input.stage as GuardrailStage;
      const checks: GuardrailResult[] = [];
      if (text.trim() || images.length) checks.push(await guard.inspect(stage, text, images, true));
      if (files.length) checks.push(await guard.inspect(stage, { source: "untrusted_file_attachments", files: files.map(file => ({ name: file.name, text: file.text })) }, [], true));
      const result: GuardrailResult = { stage, decision: checks.some(check => check.decision === "block") ? "block" : checks.some(check => check.decision === "monitor") ? "monitor" : "allow",
        findings: Array.from(new Map(checks.flatMap(check => check.findings).map(finding => [`${finding.rule}:${finding.severity}`, finding])).values()),
        imageInspection: checks.find(check => check.imageInspection)?.imageInspection,
      };
      return Response.json({ requestId, result, attachments: { images: images.length, files: files.map(({ name, characters }) => ({ name, characters })), readOnly: images.length > 0 && policy.imageMode === "read-only" } }, { headers });
    }
    if (!["draft", "publish", "restore"].includes(String(input.action)) || !Number.isInteger(input.revision) || !Number.isInteger(input.activeVersion)) throw new HttpError(400, "정책 작업과 버전을 확인해 주세요.");
    const policy = input.action === "draft" ? validateGuardrailPolicy(input.policy) : undefined;
    if (policy?.classifierEnabled && !(await aiModels()).includes(policy.classifierModel)) throw new HttpError(400, "사용 가능한 검사 모델을 선택해 주세요.");
    const tx = await db().transaction("write");
    try {
      const role = (await tx.execute({ sql: "SELECT role FROM workspace_members WHERE workspace_id=? AND user_id=?", args: [user.workspaceId, user.id] })).rows[0];
      if (!role || !["owner", "admin"].includes(String(role.role))) throw new HttpError(403, "관리 권한이 변경되었습니다.");
      const current = (await tx.execute({ sql: "SELECT * FROM ai_guardrail_configs WHERE workspace_id=?", args: [user.workspaceId] })).rows[0];
      if (Number(current?.draft_revision ?? 0) !== input.revision || Number(current?.active_version ?? 0) !== input.activeVersion) throw new HttpError(409, "다른 관리자가 설정을 변경했습니다. 새로고침해 주세요.");
      const timestamp = new Date().toISOString();
      let appliedVersion = Number(current?.active_version ?? 0);
      if (input.action === "draft") {
        await tx.execute({ sql: "INSERT INTO ai_guardrail_configs(workspace_id,draft_json,draft_revision,updated_by,updated_at) VALUES (?,?,1,?,?) ON CONFLICT(workspace_id) DO UPDATE SET draft_json=excluded.draft_json,draft_revision=draft_revision+1,updated_by=excluded.updated_by,updated_at=excluded.updated_at", args: [user.workspaceId, JSON.stringify(policy), user.id, timestamp] });
      } else {
        if (!current) throw new HttpError(400, "먼저 초안을 저장해 주세요.");
        let value = JSON.parse(String(current.draft_json));
        if (input.action === "restore") {
          if (!Number.isInteger(input.version)) throw new HttpError(400, "복원 버전을 선택해 주세요.");
          const old = (await tx.execute({ sql: "SELECT config_json FROM ai_guardrail_policies WHERE workspace_id=? AND version=?", args: [user.workspaceId, Number(input.version)] })).rows[0];
          if (!old) throw new HttpError(404, "정책 버전을 찾을 수 없습니다.");
          value = JSON.parse(String(old.config_json));
        }
        const validated = validateGuardrailPolicy(value);
        const version = Number((await tx.execute({ sql: "SELECT COALESCE(MAX(version),0)+1 AS version FROM ai_guardrail_policies WHERE workspace_id=?", args: [user.workspaceId] })).rows[0].version);
        appliedVersion = version;
        await tx.execute({ sql: "INSERT INTO ai_guardrail_policies(workspace_id,version,config_json,published_by,published_at,restored_from) VALUES (?,?,?,?,?,?)", args: [user.workspaceId, version, JSON.stringify(validated), user.id, timestamp, input.action === "restore" ? Number(input.version) : null] });
        await tx.execute({ sql: "UPDATE ai_guardrail_configs SET active_version=?,draft_json=?,draft_revision=draft_revision+1,updated_by=?,updated_at=? WHERE workspace_id=?", args: [version, JSON.stringify(validated), user.id, timestamp, user.workspaceId] });
      }
      await tx.execute({ sql: "INSERT INTO ai_guardrail_events(id,workspace_id,user_id,request_id,policy_version,stage,decision,rules_json,duration_ms,created_at) VALUES (?,?,?,?,?,?,?,?,0,?)", args: [randomUUID(), user.workspaceId, user.id, randomUUID(), appliedVersion, `policy:${input.action}`, "allow", JSON.stringify([{ rule: `revision_${Number(input.revision) + 1}`, severity: "medium" }]), timestamp] });
      await tx.commit();
    } catch (error) { await tx.rollback(); throw error; }
    finally { tx.close(); }
    return Response.json({ success: true }, { headers });
  } catch (error) { return errorResponse(error); }
}
