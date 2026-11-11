export type SystemSettings = {
  workspaceId: string;
  staleTimeMs: number;
  retryCount: number;
  errorMessages: Record<string, string>;
  version: number | null;
  source: "stored" | "default" | "unavailable";
};
export type SettingsInput = Pick<
  SystemSettings,
  "staleTimeMs" | "retryCount" | "errorMessages"
> & { expectedVersion: number };
