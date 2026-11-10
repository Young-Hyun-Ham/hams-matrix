import { handleProductAdmin } from "@/lib/product-admin-api";
export async function GET(request: Request, context: {params: Promise<{userId: string}>}) { return handleProductAdmin(request, ["me", "members", (await context.params).userId]); }
