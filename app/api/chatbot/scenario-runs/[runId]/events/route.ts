import { chatbotUser } from "@/lib/chatbot/server";
import { json, error } from "@/lib/chatbot/http";
import { getRun } from "@/lib/chatbot/scenarios";

export async function GET(
  request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  try {
    const user = await chatbotUser();
    const p = await context.params;
    return json(
      await getRun(
        user,
        p.runId,
        Number(new URL(request.url).searchParams.get("after") || 0),
      ),
    );
  } catch (e) {
    return error(e);
  }
}
