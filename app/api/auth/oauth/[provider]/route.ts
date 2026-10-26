import { startOAuth } from "@/lib/oauth";
export async function GET(
  request: Request,
  context: { params: Promise<{ provider: string }> },
) {
  return startOAuth(request, (await context.params).provider);
}
