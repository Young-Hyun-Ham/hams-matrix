import { guardrailAdminUser } from "@/lib/guardrail-admin-access";
import { consoleOwnedProjects } from "@/lib/ai-console-access";
import { json, error } from "@/lib/chatbot/http";
export async function GET(request: Request) {
  try {
    const user = await guardrailAdminUser(request);
    return json({ projects: await consoleOwnedProjects(user) });
  } catch (e) {
    return error(e);
  }
}
