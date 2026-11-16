import {
  requireUser,
  errorResponse,
  checkOrigin,
  body,
  HttpError,
} from "@/lib/auth";
import { headerNotifications } from "@/lib/header-notifications";
import { db } from "@/lib/db";
import { noStore } from "@/lib/admin-query";
export async function GET() {
  try {
    return Response.json(
      await headerNotifications(await requireUser()),
      noStore,
    );
  } catch (e) {
    return errorResponse(e);
  }
}
export async function PATCH(request: Request) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    const input = await body(request);
    const current = await headerNotifications(user);
    const visible = [
      ...current.requests.map((item) => item.key),
      ...(current.budget.exceeded ? [current.budget.key] : []),
    ];
    if (typeof input.key !== "string" || !visible.includes(input.key))
      throw new HttpError(404, "확인할 수 있는 알림이 없습니다.");
    await db().execute({
      sql: "INSERT INTO notification_acknowledgements(user_id,workspace_id,notification_key,read_at) VALUES (?,?,?,?) ON CONFLICT(user_id,workspace_id,notification_key) DO NOTHING",
      args: [user.id, user.workspaceId, input.key, new Date().toISOString()],
    });
    return Response.json(await headerNotifications(user), noStore);
  } catch (e) {
    return errorResponse(e);
  }
}
