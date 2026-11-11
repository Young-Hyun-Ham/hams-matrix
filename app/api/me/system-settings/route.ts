import { errorResponse, requireUser } from "@/lib/auth";
import { getWorkspaceSystemSettings } from "@/lib/system-settings/server";
import { noStore } from "@/lib/admin-query";
export async function GET() {
  try {
    return Response.json(
      await getWorkspaceSystemSettings(
        await requireUser({ allowPlanMismatch: true }),
      ),
      noStore,
    );
  } catch (error) {
    return errorResponse(error);
  }
}
