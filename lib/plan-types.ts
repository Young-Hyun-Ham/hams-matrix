export type AccountRole =
  | "master"
  | "admin"
  | "user"
  | "guest"
  | "biz_admin"
  | "team_admin";
export type ProjectRole = "owner" | "admin" | "member" | "viewer";
export type PlanCode = "free" | "pro" | "team" | "business";
export type Plan = {
  code: PlanCode;
  name: string;
  priceMode: "fixed" | "contact";
  monthlyPrice: number | null;
  yearlyPrice: number | null;
  monthlyDiscountPrice: number | null;
  yearlyDiscountPrice: number | null;
  projectLimit: number | null;
  projectInviteLimit: number | null;
  tokenLimit: number | null;
  dailyImageLimit: number | null;
  attachmentLimit: number;
  historyEnabled: boolean;
  teamSharingEnabled: boolean;
  recommended: boolean;
  version: number;
};
export const isPlatformAdmin = (role: AccountRole) => role === "master";

export const isProductAdmin = (role: AccountRole) =>
  role === "biz_admin" || role === "team_admin";
