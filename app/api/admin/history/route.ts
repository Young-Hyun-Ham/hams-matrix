import { handleProductAdmin } from "@/lib/product-admin-api";
export async function GET(request: Request) { return handleProductAdmin(request, ["me", "history"]); }
