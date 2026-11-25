import { checkOrigin } from "@/lib/auth";
import { chatbotUser } from "@/lib/chatbot/server";
import { json, error, body } from "@/lib/chatbot/http";
import { settings, saveSettings } from "@/lib/chatbot/repository";

export async function GET() {
  try {
    const user = await chatbotUser();
    return json(await settings(user));
  } catch (e) {
    return error(e);
  }
}

export async function PATCH(request: Request) {
  try {
    checkOrigin(request);
    const user = await chatbotUser();
    return json(await saveSettings(user, await body(request, 16000)));
  } catch (e) {
    return error(e);
  }
}
