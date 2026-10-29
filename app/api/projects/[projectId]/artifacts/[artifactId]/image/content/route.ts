import { errorResponse, requireUser } from "@/lib/auth";
import { readArchitectureImage } from "@/lib/ai/architecture-images";

type Context = { params: Promise<{ projectId: string; artifactId: string }> };
export async function GET(request: Request, { params }: Context) {
  try {
    const user = await requireUser(),
      { projectId, artifactId: id } = await params;
    const query = new URL(request.url).searchParams;
    const { bytes, info } = await readArchitectureImage(
      user,
      projectId,
      id,
      query.get("imageId"),
    );
    const filename = encodeURIComponent(`아키텍처구성도-${id}-${info.id}.png`);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "image/png",
        "Content-Length": String(bytes.length),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        Vary: "Cookie",
        "Content-Disposition": `${query.get("download") === "1" ? "attachment" : "inline"}; filename="architecture.png"; filename*=UTF-8''${filename}`,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
