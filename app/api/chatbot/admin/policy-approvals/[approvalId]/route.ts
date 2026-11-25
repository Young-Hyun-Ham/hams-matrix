import { json, error } from "@/lib/chatbot/http";
import { adminQueue } from "@/lib/chatbot/policy";
export async function GET(
  request: Request,
  context: { params: Promise<{ approvalId: string }> },
) {
  try {
    const q = await context.params;
    return json(await adminQueue(request, q.approvalId));
  } catch (e) {
    return error(e);
  }
}
