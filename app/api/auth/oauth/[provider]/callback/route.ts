import { finishOAuth } from "@/lib/oauth";
export async function GET(
  request: Request,
  context: { params: Promise<{ provider: string }> },
) {
  return finishOAuth(request, (await context.params).provider);
}
