import { body, HttpError } from "@/lib/auth";
import {
  onlyofficeScope,
  onlyofficeCallbackPayload,
  saveOnlyoffice,
  onlyofficeHeaders,
} from "@/lib/onlyoffice";

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string; fileId: string }> },
) {
  try {
    const { projectId, fileId } = await context.params;
    const scope = onlyofficeScope(request, projectId, fileId, "callback");
    const payload = onlyofficeCallbackPayload(
      request,
      await body(request, 100000),
    );
    await saveOnlyoffice(request, scope, payload);
    return Response.json({ error: 0 }, { headers: onlyofficeHeaders });
  } catch (error) {
    // ONLYOFFICE expects an integer error code, including when storage rejects a save.
    const status = error instanceof HttpError ? error.status : 500;
    console.error("ONLYOFFICE callback failed", status);
    return Response.json({ error: 1 }, { status, headers: onlyofficeHeaders });
  }
}
