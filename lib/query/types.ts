import type { Plan } from "@/lib/plan-types";
export type SubscriptionResponse = {
  plan: Plan;
  plans: Plan[];
  workspacePlan?: string;
  usage: Record<string, number>;
  tokenPeriod: "total";
  imageTimezone: "Asia/Seoul";
};
