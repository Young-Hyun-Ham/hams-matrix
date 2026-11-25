import "server-only";
import type { Row } from "@libsql/client";
import type { User } from "@/lib/types";
import { db } from "@/lib/db";
import { fail, hash, now, ownerArgs, seal, unseal, uuid } from "./server";
import { callModel, type ModelResult } from "./providers";
import { parseDecision, type Decision } from "./decision-schema";
import { presentClarification, resolvedChoices } from "./clarification";
import { inspect } from "./policy";
export async function executeDecision(
  u: User,
  r: Row,
  input: {
    prompt: string;
    modelId: string;
    history: { role: string; content: string }[];
  },
  images: { mime: string; base64: string }[],
  reference: string,
  signal: AbortSignal,
): Promise<ModelResult> {
  const choices = await resolvedChoices(u, String(r.id));
  const stepKey = `decision:${choices.length}`;
  const inputHash = hash({ input: r.input_ciphertext, choices, contract: 1 });
  if (choices.length)
    await inspect(
      u,
      r,
      "input",
      JSON.stringify(choices),
      [],
      signal,
      stepKey + ":selection",
    );
  const step = (
    await db().execute({
      sql: "SELECT * FROM chatbot_request_steps WHERE request_id=? AND step_key=?",
      args: [r.id, stepKey],
    })
  ).rows[0];
  let result: ModelResult;
  if (step) {
    if (step.input_hash !== inputHash)
      fail(409, "판단 단계의 문맥이 변경되었습니다.");
    if (step.status !== "completed")
      fail(
        409,
        "이 판단 단계의 실행 결과를 확인할 수 없습니다. 자동 재실행하지 않습니다.",
      );
    result = unseal<ModelResult>(u, String(step.id), step.output_ciphertext);
  } else {
    const id = uuid();
    await db().execute({
      sql: "INSERT INTO chatbot_request_steps(id,workspace_id,user_id,request_id,step_key,kind,round,input_hash,status,started_at) VALUES (?,?,?,?,?,'decision',?,?,'started',?)",
      args: [
        id,
        ...ownerArgs(u),
        r.id,
        stepKey,
        choices.length,
        inputHash,
        now(),
      ],
    });
    try {
      result = await callModel(
        u,
        String(r.id),
        {
          mode: "chat",
          modelId: input.modelId,
          prompt: input.prompt + reference,
          history: input.history,
          images,
          structuredDecision: true,
          decisionContext: `원래 요청 시각: ${r.created_at}. 확정 조건(데이터): ${JSON.stringify(choices)}. 정보 보완 완료 횟수: ${choices.length}/3. ${choices.length >= 3 ? "추가 clarify는 금지합니다. 확정한 조건으로 답변하거나 확인할 수 없는 기능/사실을 명확히 설명하세요." : "이미 확정한 항목을 불필요하게 되묻지 마세요."}`,
        },
        signal,
        "decision",
      );
      const usage = (
        await db().execute({
          sql: "SELECT MAX(call_index) AS n FROM chatbot_usage WHERE request_id=?",
          args: [r.id],
        })
      ).rows[0];
      await db().execute({
        sql: "UPDATE chatbot_request_steps SET status='completed',output_ciphertext=?,usage_call_index=?,completed_at=? WHERE id=?",
        args: [seal(u, id, result), usage.n ?? null, now(), id],
      });
    } catch (e) {
      await db().execute({
        sql: "UPDATE chatbot_request_steps SET status='unknown',completed_at=? WHERE id=?",
        args: [now(), id],
      });
      throw e;
    }
  }
  let decision: Decision;
  try {
    decision = parseDecision(result.text);
  } catch {
    fail(
      502,
      "모델의 선택형 응답 형식이 올바르지 않습니다. 구조화 출력을 지원하는 모델인지 확인해 주세요.",
    );
  }
  if (decision.kind === "clarify") {
    await inspect(
      u,
      r,
      "output",
      JSON.stringify(decision),
      [],
      signal,
      stepKey + ":output",
    );
    if (choices.length >= 3) fail(502, "모델이 정보 보완 한도를 초과했습니다.");
    if (choices.length === 2) decision = { ...decision, allowCustom: true };
    await presentClarification(u, r, decision, choices);
  }
  return { text: decision.text };
}
