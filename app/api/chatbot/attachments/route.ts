import { checkOrigin } from "@/lib/auth";
import { chatbotUser } from "@/lib/chatbot/server";
import { json, error, body } from "@/lib/chatbot/http";
import { upload } from "@/lib/chatbot/storage";

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await chatbotUser();
    return json(await upload(user, await body(request)), 201);
  } catch (e) {
    return error(e);
  }
}
