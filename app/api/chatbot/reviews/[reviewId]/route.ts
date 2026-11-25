import { chatbotUser } from "@/lib/chatbot/server";
import { json, error } from "@/lib/chatbot/http";
import { review } from "@/lib/chatbot/generation";

export async function GET(
  request: Request,
  context: { params: Promise<{ reviewId: string }> },
) {
  try {
    const user = await chatbotUser();
    const p = await context.params;
    return json(await review(user, p.reviewId));
  } catch (e) {
    return error(e);
  }
}
