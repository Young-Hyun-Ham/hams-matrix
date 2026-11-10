import type { AccountRole } from "./plan-types";
export type User = {
  id: string;
  name: string;
  jobTitle?: string;
  email: string | null;
  workspaceId: string;
  workspaceName: string;
  role: string;
  plan: string;
  workspacePlan?: string;
  productId?: string | null;
  workspaceProductId?: string | null;
  productName?: string | null;
  workspaceProductName?: string | null;
  teamSharingEnabled: boolean;
  accountRole: AccountRole;
  onboardingComplete: boolean;
};
export type MenuKey = "dashboard" | "team" | "ai";

export type NavigationMenuKey =
  | MenuKey
  | "subscription"
  | "admin"
  | "super-admin"
  | "viewer"
  | "settings"
  | "help";
export type NavigationMenu = {
  key: NavigationMenuKey;
  label: string;
  en: string;
  icon: string;
  description: string;
  href: string;
  action: "link" | "ai" | "help";
  admin: boolean;
};
