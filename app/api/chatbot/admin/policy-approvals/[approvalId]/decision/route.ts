import { checkOrigin } from "@/lib/auth";
import { json, error, body } from "@/lib/chatbot/http";
import { adminQueue } from "@/lib/chatbot/policy";
export async function POST(
  request: Request,
  context: { params: Promise<{ approvalId: string }> },
) {
  try {
    checkOrigin(request);
    const q = await context.params;
    return json(
      await adminQueue(request, q.approvalId, await body(request, 16000)),
    );
  } catch (e) {
    return error(e);
  }
}
