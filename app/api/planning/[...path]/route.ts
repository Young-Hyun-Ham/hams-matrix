import { handle } from "@/app/(editor)/planning-board/lib/server/handler";
export const maxDuration = 180;
async function route(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  return handle(request, (await context.params).path);
}
export {
  route as GET,
  route as POST,
  route as PUT,
  route as PATCH,
  route as DELETE,
};
