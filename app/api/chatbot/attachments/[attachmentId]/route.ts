import { checkOrigin } from "@/lib/auth";
import { chatbotUser } from "@/lib/chatbot/server";
import { json, error } from "@/lib/chatbot/http";
import { attachment } from "@/lib/chatbot/storage";

export async function GET(
  request: Request,
  context: { params: Promise<{ attachmentId: string }> },
) {
  try {
    const user = await chatbotUser();
    const p = await context.params;
    return json(await attachment(user, p.attachmentId));
  } catch (e) {
    return error(e);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ attachmentId: string }> },
) {
  try {
    checkOrigin(request);
    const user = await chatbotUser();
    const p = await context.params;
    return json(await attachment(user, p.attachmentId, true));
  } catch (e) {
    return error(e);
  }
}
