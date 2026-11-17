import "server-only";
import { randomUUID } from "node:crypto";
import { HttpError } from "../auth";
import type { User } from "../types";
import { activeGuardrailPolicy, assertAiEnabled } from "./guardrail-policy";
import { createGuardrailSession } from "./guardrails";
import { createTokenTracker } from "./token-usage";

// Detail/list reads must also honor today's output policy, including AI classifiers.
export async function inspectSharedOutput(
  user: User,
  projectId: string,
  value: unknown,
  signal: AbortSignal,
) {
  const active = await activeGuardrailPolicy(user.workspaceId),
    requestId = randomUUID();
  await assertAiEnabled(user.workspaceId);
  const guard = createGuardrailSession({
    workspaceId: user.workspaceId,
    userId: user.id,
    requestId,
    version: active.version,
    policy: active.policy,
    deadline: Date.now() + 30000,
    checkpoint: async () => {
      if (signal.aborted) throw new HttpError(408, "요청이 취소되었습니다.");
      await assertAiEnabled(user.workspaceId);
    },
    track: createTokenTracker({
      workspaceId: user.workspaceId,
      userId: user.id,
      projectId,
      projectName: "",
      convId: "",
      conversationTitle: "",
      chatId: "",
      requestId,
      model: active.policy.classifierModel,
      prompt: "",
    }),
  });
  await guard.inspect("output", value);
}
