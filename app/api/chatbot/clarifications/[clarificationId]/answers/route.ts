import { checkOrigin } from "@/lib/auth";
import { chatbotUser } from "@/lib/chatbot/server";
import { json, error, body } from "@/lib/chatbot/http";
import { answerClarification } from "@/lib/chatbot/clarification";
export async function POST(
  request: Request,
  context: { params: Promise<{ clarificationId: string }> },
) {
  try {
    checkOrigin(request);
    const user = await chatbotUser();
    const p = await context.params;
    return json(
      await answerClarification(
        user,
        p.clarificationId,
        await body(request, 8000),
      ),
      202,
    );
  } catch (e) {
    return error(e);
  }
}
