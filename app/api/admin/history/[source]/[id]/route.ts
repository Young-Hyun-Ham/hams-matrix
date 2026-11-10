import { handleProductAdmin } from "@/lib/product-admin-api";
export async function GET(request: Request, context: {params: Promise<{source:string;id:string}>}) { const p=await context.params; return handleProductAdmin(request, ["me", "history",p.source,p.id]); }
