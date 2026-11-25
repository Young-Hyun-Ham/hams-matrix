import { checkOrigin } from "@/lib/auth";
import { chatbotUser } from "@/lib/chatbot/server";
import { json, error, body } from "@/lib/chatbot/http";
import { conversations, createConversation } from "@/lib/chatbot/repository";

export async function GET(request: Request) {
  try {
    const user = await chatbotUser();
    return json(
      await conversations(
        user,
        new URL(request.url).searchParams.get("cursor") || "",
      ),
    );
  } catch (e) {
    return error(e);
  }
}

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await chatbotUser();
    return json(
      {
        conversation: await createConversation(
          user,
          await body(request, 16000),
        ),
      },
      201,
    );
  } catch (e) {
    return error(e);
  }
}
