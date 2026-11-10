import { handleSuperAdmin } from "@/lib/super-admin-api";
type Context = { params: Promise<{ segments: string[] }> };
export async function GET(request: Request, context: Context) {
  return handleSuperAdmin(request, (await context.params).segments);
}
export async function POST(request: Request, context: Context) {
  return handleSuperAdmin(request, (await context.params).segments);
}
export async function PATCH(request: Request, context: Context) {
  return handleSuperAdmin(request, (await context.params).segments);
}
