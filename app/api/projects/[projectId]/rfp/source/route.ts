import { body, checkOrigin, errorResponse, requireUser } from "@/lib/auth";
import {
  detachRfpSource,
  readRfpSource,
  uploadRfpSource,
} from "@/lib/rfp-sources";
type Context = { params: Promise<{ projectId: string }> };
const headers = { "Cache-Control": "private, no-store" };
export async function GET(_request: Request, context: Context) {
  try {
    const user = await requireUser(),
      { projectId } = await context.params;
    return Response.json(
      { source: await readRfpSource(user, projectId) },
      { headers },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
async function upload(request: Request, context: Context, replace: boolean) {
  try {
    checkOrigin(request);
    const user = await requireUser(),
      { projectId } = await context.params;
    return Response.json(
      { source: await uploadRfpSource(request, user, projectId, replace) },
      { status: replace ? 200 : 201, headers },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export const POST = (request: Request, context: Context) =>
  upload(request, context, false);
export const PUT = (request: Request, context: Context) =>
  upload(request, context, true);
export async function DELETE(request: Request, context: Context) {
  try {
    checkOrigin(request);
    const user = await requireUser(),
      { projectId } = await context.params,
      input = await body(request);
    return Response.json(
      {
        source: await detachRfpSource(
          request,
          user,
          projectId,
          input.expectedSourceVersion,
        ),
      },
      { headers },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
