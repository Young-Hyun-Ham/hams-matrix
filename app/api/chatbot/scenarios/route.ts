import { chatbotUser } from "@/lib/chatbot/server";
import { json, error } from "@/lib/chatbot/http";
import { availableScenarios } from "@/lib/chatbot/scenarios";

export async function GET() {
  try {
    const user = await chatbotUser();
    return json(await availableScenarios(user));
  } catch (e) {
    return error(e);
  }
}
