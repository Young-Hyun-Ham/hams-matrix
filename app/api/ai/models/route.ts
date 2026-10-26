import { requireUser, errorResponse } from "@/lib/auth";
import { aiModels } from "@/lib/ai-server";
export async function GET() {
  try {
    await requireUser();
    const models = await aiModels();
    const preferred = process.env.OPENAI_MODEL;
    return Response.json(
      {
        models,
        defaultModel:
          preferred && models.includes(preferred)
            ? preferred
            : models.includes("gpt-5.6-sol")
              ? "gpt-5.6-sol"
              : models[0],
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
