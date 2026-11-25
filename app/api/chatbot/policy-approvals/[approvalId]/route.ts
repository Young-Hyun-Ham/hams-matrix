import { chatbotUser } from "@/lib/chatbot/server";
import { json, error } from "@/lib/chatbot/http";
import { policyApproval } from "@/lib/chatbot/policy";

export async function GET(
  request: Request,
  context: { params: Promise<{ approvalId: string }> },
) {
  try {
    const user = await chatbotUser();
    const p = await context.params;
    return json(await policyApproval(user, p.approvalId));
  } catch (e) {
    return error(e);
  }
}
