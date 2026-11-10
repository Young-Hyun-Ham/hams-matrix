import { errorResponse, requireUser } from "@/lib/auth";
import { readDatabaseErdImage } from "@/lib/ai/database-erd-images";
type Context = { params: Promise<{ projectId: string }> };
export async function GET(request: Request, { params }: Context) {
  try {
    const user = await requireUser(),
      { projectId } = await params,
      query = new URL(request.url).searchParams;
    const { bytes, info } = await readDatabaseErdImage(
      user,
      projectId,
      query.get("imageId"),
    );
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "image/png",
        "Content-Length": String(bytes.length),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        Vary: "Cookie",
        "Content-Disposition": `${query.get("download") === "1" ? "attachment" : "inline"}; filename="erd.png"; filename*=UTF-8''${encodeURIComponent(`ERD-${projectId}-${info.id}.png`)}`,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
