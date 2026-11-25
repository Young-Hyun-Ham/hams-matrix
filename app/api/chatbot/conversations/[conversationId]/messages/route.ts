import { checkOrigin } from "@/lib/auth";
import { chatbotUser } from "@/lib/chatbot/server";
import { json, error, body } from "@/lib/chatbot/http";
import { messages, createMessage } from "@/lib/chatbot/repository";

export async function GET(
  request: Request,
  context: { params: Promise<{ conversationId: string }> },
) {
  try {
    const user = await chatbotUser();
    const p = await context.params;
    return json(
      await messages(
        user,
        p.conversationId,
        Number(
          new URL(request.url).searchParams.get("beforeSeq") ||
            Number.MAX_SAFE_INTEGER,
        ),
      ),
    );
  } catch (e) {
    return error(e);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ conversationId: string }> },
) {
  try {
    checkOrigin(request);
    const user = await chatbotUser();
    const p = await context.params;
    return json(
      await createMessage(user, p.conversationId, await body(request, 64000)),
      202,
    );
  } catch (e) {
    return error(e);
  }
}
