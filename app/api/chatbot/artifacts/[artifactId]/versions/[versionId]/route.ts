import { chatbotUser } from "@/lib/chatbot/server";
import { json, error } from "@/lib/chatbot/http";
import { artifactVersion } from "@/lib/chatbot/storage";

export async function GET(
  request: Request,
  context: { params: Promise<{ artifactId: string; versionId: string }> },
) {
  try {
    const user = await chatbotUser();
    const p = await context.params;
    return json(await artifactVersion(user, p.artifactId, p.versionId));
  } catch (e) {
    return error(e);
  }
}
