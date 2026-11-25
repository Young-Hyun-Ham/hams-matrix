import { chatbotUser } from "@/lib/chatbot/server";
import { json, error } from "@/lib/chatbot/http";
import { requestStatus } from "@/lib/chatbot/repository";

export async function GET(
  request: Request,
  context: { params: Promise<{ requestId: string }> },
) {
  try {
    const user = await chatbotUser();
    const p = await context.params;
    return json(await requestStatus(user, p.requestId));
  } catch (e) {
    return error(e);
  }
}
