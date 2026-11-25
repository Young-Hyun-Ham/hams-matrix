import { checkOrigin } from "@/lib/auth";
import { chatbotUser } from "@/lib/chatbot/server";
import { json, error } from "@/lib/chatbot/http";
import { stopRequest } from "@/lib/chatbot/repository";

export async function POST(
  request: Request,
  context: { params: Promise<{ requestId: string }> },
) {
  try {
    checkOrigin(request);
    const user = await chatbotUser();
    const p = await context.params;
    return json(await stopRequest(user, p.requestId));
  } catch (e) {
    return error(e);
  }
}
