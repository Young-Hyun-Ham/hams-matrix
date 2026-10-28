// Registration no longer exposes private workspaces.
export async function GET() { return Response.json({ teams: [] }, { headers: { "Cache-Control": "no-store" } }); }
