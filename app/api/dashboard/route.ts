import { connection } from "next/server";
import { requireUser, errorResponse, HttpError } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { dashboardData } from "@/lib/dashboard-query";

export async function GET(request: Request) {
  await connection();
  try {
    const user = await requireUser();
    const values = new URL(request.url).searchParams.getAll("projectId");
    if (values.length > 1 || (values[0]?.length ?? 0) > 100)
      throw new HttpError(400, "프로젝트 선택을 확인해 주세요.");
    const data = await dashboardData(user, values[0] ?? "");
    await audit(request, {
      user,
      action: "READ",
      resource: "dashboard",
      metadata: { returned: data.projects.length },
    });
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
