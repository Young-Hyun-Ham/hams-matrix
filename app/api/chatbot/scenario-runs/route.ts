import { checkOrigin } from "@/lib/auth";
import { chatbotUser } from "@/lib/chatbot/server";
import { json, error, body } from "@/lib/chatbot/http";
import { listRuns, createRun } from "@/lib/chatbot/scenarios";

export async function GET(request: Request) {
  try {
    const user = await chatbotUser();
    const q = new URL(request.url).searchParams;
    return json(
      await listRuns(
        user,
        q.get("source") || "chatbot",
        q.get("scenarioId") || "",
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
    return json(await createRun(user, await body(request, 1600000)), 202);
  } catch (e) {
    return error(e);
  }
}
