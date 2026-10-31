import type { Client } from "@libsql/client";
import { db } from "./db";

export type AppSetting = {
  key: string;
  value: unknown;
  type: "boolean" | "number" | "string" | "json";
  category: string;
  label: string;
  description: string;
  version: number;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

// Server-side only. Reading settings must not audit itself (logging depends on these values).
// Read fresh on each call so a future admin update takes effect without restarting the server.
export async function getAppSetting(
  key: string,
  executor: Pick<Client, "execute"> = db(),
): Promise<AppSetting | null> {
  const result = await executor.execute({
    sql: "SELECT * FROM admin_setting WHERE setting_key=?",
    args: [key],
  });
  const row = result.rows[0];
  if (!row) return null;
  return {
    key: String(row.setting_key),
    value: JSON.parse(String(row.value_json)),
    type: row.value_type as AppSetting["type"],
    category: String(row.category),
    label: String(row.label),
    description: String(row.description),
    version: Number(row.version),
    updatedBy: row.updated_by === null ? null : String(row.updated_by),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function getBooleanSetting(
  key: string,
  fallback = false,
  executor?: Pick<Client, "execute">,
) {
  const setting = await getAppSetting(key, executor);
  return setting?.type === "boolean" && typeof setting.value === "boolean"
    ? setting.value
    : fallback;
}
