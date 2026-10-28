export type AccountRole = "master" | "admin" | "user" | "guest";
export type ProjectRole = "owner" | "admin" | "member" | "viewer";
export type PlanCode = "free" | "plus" | "pro" | "business";
export type Plan = {
  code: PlanCode; name: string; priceMode: "fixed" | "contact";
  monthlyPrice: number | null; yearlyPrice: number | null;
  projectLimit: number | null; tokenLimit: number | null; dailyImageLimit: number | null;
  attachmentLimit: number; historyEnabled: boolean; recommended: boolean; version: number;
};
export const isPlatformAdmin = (role: AccountRole) => role === "master" || role === "admin";
