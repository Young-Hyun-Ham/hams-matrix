import { chatbotUser } from "@/lib/chatbot/server";
import { json, error } from "@/lib/chatbot/http";
import { usage } from "@/lib/chatbot/repository";
export async function GET() {
  try {
    const user = await chatbotUser();
    return json({ usage: await usage(user) });
  } catch (e) {
    return error(e);
  }
}
