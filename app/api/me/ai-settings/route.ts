import {
  requireUser,
  body,
  checkOrigin,
  errorResponse,
  HttpError,
} from "@/lib/auth";
import { aiUserSettings, saveAiUserSettings } from "@/lib/ai/user-settings";
import { tokenBudgetStatus } from "@/lib/ai/token-budget";
const headers = { "Cache-Control": "no-store" };
export async function GET() {
  try {
    const user = await requireUser({ allowPlanMismatch: true });
    if (user.accountRole === "guest")
      throw new HttpError(403, "게스트는 설정을 조회할 수 없습니다.");
    return Response.json(
      {
        settings: await aiUserSettings(user),
        budget: await tokenBudgetStatus(user),
      },
      { headers },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
export async function PATCH(request: Request) {
  try {
    checkOrigin(request);
    const user = await requireUser({ allowPlanMismatch: true });
    const input = await body(request);
    return Response.json(
      {
        settings: await saveAiUserSettings(user, input),
        budget: await tokenBudgetStatus(user),
      },
      { headers },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
