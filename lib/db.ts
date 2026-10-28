import { createClient, type Client } from "@libsql/client";
let client: Client | undefined;
export function db() {
  if (!process.env.TURSO_DATABASE_URL)
    throw new Error("Database is not configured");
  return (client ??= createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
    // Local development/test connections may contend; remote clients ignore this option.
    timeout: 5000,
  }));
}
