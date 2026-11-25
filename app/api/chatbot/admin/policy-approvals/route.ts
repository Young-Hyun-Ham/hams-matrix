import { json, error } from "@/lib/chatbot/http";
import { adminQueue } from "@/lib/chatbot/policy";
export async function GET(request: Request) {
  try {
    return json(await adminQueue(request));
  } catch (e) {
    return error(e);
  }
}
