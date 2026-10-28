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
  accountRole: AccountRole;
  onboardingComplete: boolean;
};
export type MenuKey =
  | "dashboard"
  | "team"
  | "ai";

export type NavigationMenuKey = MenuKey | 'subscription' | 'admin' | 'settings' | 'help';
export type NavigationMenu = {
 key: NavigationMenuKey; label: string; en: string; icon: string; description: string;
 href: string; action: 'link' | 'ai' | 'help'; admin: boolean;
};
