import "server-only";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fail } from "./server";
export function chatbotMaintenanceGuard() {
  if (existsSync(resolve(process.cwd(), ".auth-tests/chatbot-migration.lock")))
    fail(503, "챗봇 저장소를 갱신하고 있습니다. 잠시 후 다시 시도해 주세요.");
}
