import { errorResponse } from "@/lib/auth";
import { processTeamPayment } from "@/lib/team-payments";
export async function POST(request: Request) {
  try {
    return Response.json(await processTeamPayment(request));
  } catch (error) {
    return errorResponse(error);
  }
}
