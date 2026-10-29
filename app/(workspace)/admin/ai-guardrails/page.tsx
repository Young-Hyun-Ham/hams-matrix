import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { requirePlatformAdmin } from "@/lib/plans";
export default async function Page() {
  requirePlatformAdmin(await requireUser());
  redirect("/admin/settings?tab=guardrails");
}
