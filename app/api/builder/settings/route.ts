import { body, checkOrigin, errorResponse } from "@/lib/auth";
import { builderUser } from "@/app/(builder)/server/access";
import { settings, saveSettings } from "@/app/(builder)/server/repository";
export async function GET() {
  try {
    const user = await builderUser();
    const result = await settings(user);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function PUT(request: Request) {
  try {
    const user = await builderUser();
    checkOrigin(request);
    const input = await body(request, 2200000);
    const result = await saveSettings(request, user, input);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function DELETE(request: Request) {
  try {
    const user = await builderUser();
    checkOrigin(request);
    const input = await body(request, 2200000);
    const result = await saveSettings(request, user, input, true);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
