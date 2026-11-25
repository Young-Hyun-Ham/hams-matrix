import { HttpError } from "@/lib/auth";
import { chatbotUser } from "@/lib/chatbot/server";
import { json, error } from "@/lib/chatbot/http";
import { models } from "@/lib/chatbot/providers";

export async function GET(request: Request) {
  try {
    await chatbotUser();
    const mode = new URL(request.url).searchParams.get("mode") || "chat";
    if (!["chat", "image", "file"].includes(mode))
      throw new HttpError(400, "생성 모드를 확인해 주세요.");
    return json(await models(mode as "chat" | "image" | "file"));
  } catch (e) {
    return error(e);
  }
}
