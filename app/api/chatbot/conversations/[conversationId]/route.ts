import { checkOrigin } from "@/lib/auth";
import { chatbotUser } from "@/lib/chatbot/server";
import { json, error, body } from "@/lib/chatbot/http";
import { editConversation } from "@/lib/chatbot/repository";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ conversationId: string }> },
) {
  try {
    checkOrigin(request);
    const user = await chatbotUser();
    const p = await context.params;
    return json({
      conversation: await editConversation(
        user,
        p.conversationId,
        await body(request, 16000),
      ),
    });
  } catch (e) {
    return error(e);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ conversationId: string }> },
) {
  try {
    checkOrigin(request);
    const user = await chatbotUser();
    const p = await context.params;
    return json(
      await editConversation(
        user,
        p.conversationId,
        await body(request, 16000),
        true,
      ),
    );
  } catch (e) {
    return error(e);
  }
}
