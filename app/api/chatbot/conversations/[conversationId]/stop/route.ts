import { checkOrigin } from "@/lib/auth";
import { chatbotUser } from "@/lib/chatbot/server";
import { stopConversation } from "@/lib/chatbot/repository";
import { json, error } from "@/lib/chatbot/http";
export async function POST(
  request: Request,
  context: { params: Promise<{ conversationId: string }> },
) {
  try {
    checkOrigin(request);
    const user = await chatbotUser(),
      p = await context.params;
    return json(await stopConversation(user, p.conversationId));
  } catch (e) {
    return error(e);
  }
}
