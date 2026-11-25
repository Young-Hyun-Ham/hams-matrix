import { checkOrigin } from "@/lib/auth";
import { chatbotUser } from "@/lib/chatbot/server";
import { json, error, body } from "@/lib/chatbot/http";
import { submitInput } from "@/lib/chatbot/scenarios";
export async function POST(
  request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  try {
    checkOrigin(request);
    const user = await chatbotUser();
    const q = await context.params;
    return json(await submitInput(user, q.runId, await body(request, 64000)));
  } catch (e) {
    return error(e);
  }
}
