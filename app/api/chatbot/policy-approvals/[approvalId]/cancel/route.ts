import { checkOrigin } from "@/lib/auth";
import { chatbotUser } from "@/lib/chatbot/server";
import { json, error, body } from "@/lib/chatbot/http";
import { policyApproval } from "@/lib/chatbot/policy";

export async function POST(
  request: Request,
  context: { params: Promise<{ approvalId: string }> },
) {
  try {
    checkOrigin(request);
    const user = await chatbotUser();
    const p = await context.params;
    return json(
      await policyApproval(
        user,
        p.approvalId,
        await body(request, 16000),
        "cancel",
      ),
    );
  } catch (e) {
    return error(e);
  }
}
