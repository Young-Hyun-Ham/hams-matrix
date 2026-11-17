import {
  body,
  checkOrigin,
  errorResponse,
  rateLimit,
  requireUser,
} from "@/lib/auth";
import {
  listSharedAnswers,
  registerSharedAnswer,
} from "@/lib/ai/shared-answers";
import { inspectSharedOutput } from "@/lib/ai/shared-answer-output";
import { assertAiEnabled } from "@/lib/ai/guardrail-policy";
type Context = { params: Promise<{ projectId: string }> };
const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: Request, { params }: Context) {
  try {
    const { projectId } = await params,
      user = await requireUser();
    const result = await listSharedAnswers(user, projectId);
    await inspectSharedOutput(user, projectId, result, request.signal);
    return Response.json(result, { headers });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request, { params }: Context) {
  try {
    checkOrigin(request);
    const { projectId } = await params,
      user = await requireUser();
    await rateLimit(`shared-register:${user.workspaceId}:${user.id}`, 20);
    await assertAiEnabled(user.workspaceId);
    return Response.json(
      await registerSharedAnswer(user, projectId, await body(request, 40000)),
      { status: 201, headers },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
