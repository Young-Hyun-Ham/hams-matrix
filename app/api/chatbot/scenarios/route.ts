import { chatbotUser } from "@/lib/chatbot/server";
import { json, error } from "@/lib/chatbot/http";
import { availableScenarios } from "@/lib/chatbot/scenarios";

export async function GET(request: Request) {
  try {
    const user = await chatbotUser();
    return json(await availableScenarios(user, new URL(request.url).searchParams.get("scope") === "command"));
  } catch (e) {
    return error(e);
  }
}
