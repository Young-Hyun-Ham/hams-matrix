import { body, checkOrigin, errorResponse } from "@/lib/auth";
import { builderUser } from "@/app/(builder)/server/access";
import {
  getResource,
  saveResource,
  deleteResource,
} from "@/app/(builder)/server/repository";
type Context = { params: Promise<{ formId: string }> };
export async function GET(request: Request, context: Context) {
  try {
    const user = await builderUser();
    const { formId } = await context.params;
    const result = await getResource(user, "forms", formId);
    return Response.json(
      { form: result },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export async function PATCH(request: Request, context: Context) {
  try {
    const user = await builderUser();
    checkOrigin(request);
    const { formId } = await context.params;
    const input = await body(request, 2200000);
    const result = await saveResource(request, user, "forms", formId, input);
    return Response.json(
      { form: result },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export async function DELETE(request: Request, context: Context) {
  try {
    const user = await builderUser();
    checkOrigin(request);
    const { formId } = await context.params;
    const input = await body(request, 2200000);
    const result = await deleteResource(request, user, "forms", formId, input);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
