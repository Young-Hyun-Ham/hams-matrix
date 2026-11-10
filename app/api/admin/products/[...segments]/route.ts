import { handleProductAdmin } from "@/lib/product-admin-api";
type Context = { params: Promise<{ segments: string[] }> };
export async function GET(request: Request, context: Context) {
  return handleProductAdmin(request, (await context.params).segments);
}
export async function POST(request: Request, context: Context) {
  return handleProductAdmin(request, (await context.params).segments);
}
