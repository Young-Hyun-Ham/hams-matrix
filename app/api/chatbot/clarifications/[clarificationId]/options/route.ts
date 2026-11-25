import { chatbotUser } from "@/lib/chatbot/server";
import { json, error } from "@/lib/chatbot/http";
import { getClarification } from "@/lib/chatbot/clarification";
export async function GET(
  request: Request,
  context: { params: Promise<{ clarificationId: string }> },
) {
  try {
    const user = await chatbotUser();
    const p = await context.params;
    const card = await getClarification(user, p.clarificationId);
    const query = (new URL(request.url).searchParams.get("q") ?? "")
      .slice(0, 80)
      .toLocaleLowerCase();
    return json({
      version: card.version,
      options: card.options.filter((c) =>
        c.label.toLocaleLowerCase().includes(query),
      ),
    });
  } catch (e) {
    return error(e);
  }
}
