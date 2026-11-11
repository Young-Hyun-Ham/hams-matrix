import { checkOrigin, errorResponse, HttpError, requireUser } from "@/lib/auth";
import { parseSettingsInput } from "@/lib/system-settings/defaults";
import {
  getWorkspaceSystemSettings,
  requireSystemSettingsAdmin,
  saveWorkspaceSystemSettings,
} from "@/lib/system-settings/server";
import { noStore } from "@/lib/admin-query";
export async function GET() {
  try {
    const user = await requireUser({ allowPlanMismatch: true });
    await requireSystemSettingsAdmin(user);
    return Response.json(await getWorkspaceSystemSettings(user), noStore);
  } catch (error) {
    return errorResponse(error);
  }
}
export async function PATCH(request: Request) {
  try {
    checkOrigin(request);
    const user = await requireUser({ allowPlanMismatch: true });
    await requireSystemSettingsAdmin(user);
    // Bound actual UTF-8 bytes, including chunked requests.
    const reader = request.body?.getReader();
    if (!reader) throw new HttpError(400, "설정이 필요합니다.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 128 * 1024) {
        await reader.cancel();
        throw new HttpError(413, "설정 크기를 줄여 주세요.");
      }
      chunks.push(value);
    }
    let input;
    try {
      input = parseSettingsInput(Buffer.concat(chunks).toString("utf8"));
    } catch (error) {
      throw new HttpError(
        400,
        error instanceof Error ? error.message : "입력을 확인하세요.",
      );
    }
    return Response.json(
      await saveWorkspaceSystemSettings(request, user, input),
      noStore,
    );
  } catch (error) {
    return errorResponse(error);
  }
}
