import { errorResponse, requireUser } from "@/lib/auth";
import { readWbsImage } from "@/lib/ai/wbs-images";
type Context = { params: Promise<{ projectId: string }> };
export async function GET(request: Request, { params }: Context) {
  try {
    const user = await requireUser(),
      { projectId } = await params;
    const query = new URL(request.url).searchParams;
    const { bytes, info } = await readWbsImage(
      user,
      projectId,
      query.get("imageId"),
    );
    const filename = encodeURIComponent(
      `WBS-마일스톤-${projectId}-${info.id}.png`,
    );
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "image/png",
        "Content-Length": String(bytes.length),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        Vary: "Cookie",
        "Content-Disposition": `${query.get("download") === "1" ? "attachment" : "inline"}; filename="wbs.png"; filename*=UTF-8''${filename}`,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
