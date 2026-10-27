export type User = {
  id: string;
  name: string;
  jobTitle?: string;
  email: string | null;
  workspaceId: string;
  workspaceName: string;
  role: string;
  plan: string;
  accountRole: "owner" | "user";
  onboardingComplete: boolean;
};
export type MenuKey =
  | "dashboard"
  | "team"
  | "ai";
