import { requireUser, errorResponse } from "@/lib/auth";
import { onlyofficeConfiguration, onlyofficeHeaders } from "@/lib/onlyoffice";

export async function GET(_request: Request, context: { params: Promise<{ projectId: string; fileId: string }> }) {
  try {
    const user = await requireUser(), { projectId, fileId } = await context.params;
    return Response.json(await onlyofficeConfiguration(user, projectId, fileId), { headers: onlyofficeHeaders });
  } catch (error) { return errorResponse(error); }
}
