import { checkOrigin } from "@/lib/auth";
import { chatbotUser } from "@/lib/chatbot/server";
import { json, error } from "@/lib/chatbot/http";
import { stopRun } from "@/lib/chatbot/scenarios";
export async function POST(
  request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  try {
    checkOrigin(request);
    const user = await chatbotUser();
    const q = await context.params;
    return json(await stopRun(user, q.runId));
  } catch (e) {
    return error(e);
  }
}
