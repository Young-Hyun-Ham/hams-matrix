import { chatbotUser } from "@/lib/chatbot/server";
import { json, error } from "@/lib/chatbot/http";
import { getClarification } from "@/lib/chatbot/clarification";
export async function GET(
  request: Request,
  context: { params: Promise<{ clarificationId: string }> },
) {
  try {
    const user = await chatbotUser();
    const p = await context.params;
    return json(await getClarification(user, p.clarificationId));
  } catch (e) {
    return error(e);
  }
}
