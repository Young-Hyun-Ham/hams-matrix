import {
  body,
  checkOrigin,
  errorResponse,
  requireUser,
  rateLimit,
} from "@/lib/auth";
import { createTeamOrder, teamPaymentStatus } from "@/lib/team-payments";
import { db } from "@/lib/db";
export async function GET() {
  try {
    const user = await requireUser({ allowPlanMismatch: true });
    const orders = (
      await db().execute({
        sql: "SELECT id,amount,currency,billing_cycle,status,fulfilled_at,created_at FROM payment_orders WHERE user_id=? ORDER BY created_at DESC LIMIT 20",
        args: [user.id],
      })
    ).rows;
    return Response.json(
      { ...teamPaymentStatus(), orders },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await requireUser({ allowPlanMismatch: true });
    await rateLimit(`team-order:${user.id}`, 10);
    return Response.json(await createTeamOrder(user, await body(request)), {
      status: 201,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
