import { requireUser, errorResponse } from "@/lib/auth";
import { imageModels } from "@/lib/ai/image-generation";
export async function GET() {
  try {
    await requireUser();
    return Response.json(await imageModels(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
