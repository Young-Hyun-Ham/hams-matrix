import { chatbotUser } from "@/lib/chatbot/server";
import { error } from "@/lib/chatbot/http";
import { reviewPreview } from "@/lib/chatbot/generation";

export async function GET(
  request: Request,
  context: { params: Promise<{ reviewId: string }> },
) {
  try {
    const user = await chatbotUser();
    const p = await context.params;
    return await reviewPreview(
      user,
      p.reviewId,
      new URL(request.url).searchParams.has("before"),
    );
  } catch (e) {
    return error(e);
  }
}
