// Each editor window owns its optimistic version cursor; never patch global fetch.
import { useWorkspace } from "@/stores/workspace";

let readable = false,
  writable = false,
  cursorScope = "";
export function setPlanningAccess(canRead: boolean, canWrite: boolean) {
  readable = canRead;
  writable = canRead && canWrite;
}

export async function planningFetch(
  path: string,
  init?: RequestInit,
  accessErrors: "screen" | "operation" = "screen",
): Promise<Response> {
  const method = (init?.method ?? "GET").toUpperCase();
  if (
    !readable ||
    (method !== "GET" && !writable && !path.endsWith("/format-code"))
  )
    return Response.json(
      { error: "화면 권한을 다시 확인해 주세요." },
      { status: 403 },
    );
  const scope = JSON.stringify(boardScope());
  const user = useWorkspace.getState().user;
  const response = await window.fetch(path, { ...init, cache: "no-store" });
  const active = useWorkspace.getState().user;
  if (
    scope !== JSON.stringify(boardScope()) ||
    user?.id !== active?.id ||
    user?.workspaceId !== active?.workspaceId
  )
    return Response.json(
      { error: "사용자 또는 화면이 변경되었습니다. 다시 열어 주세요." },
      { status: 409 },
    );
  if (
    path.startsWith("/api/planning/") &&
    (response.status === 401 ||
      (accessErrors === "screen" && [403, 404].includes(response.status)))
  )
    window.dispatchEvent(
      new CustomEvent("planning:access-error", { detail: response.status }),
    );
  return response;
}

let version = 0,
  screenVersion = 0;
export function boardScope() {
  const query = new URLSearchParams(window.location.search);
  return {
    projectId: query.get("projectId") ?? "",
    screenId: query.get("screenId") ?? "",
  };
}
export function boardBase() {
  const { projectId, screenId } = boardScope();
  const base = `/api/planning/projects/${encodeURIComponent(projectId)}/screens/${encodeURIComponent(screenId)}`;
  if (cursorScope !== base) {
    version = 0;
    screenVersion = 0;
    cursorScope = base;
  }
  return base;
}
export async function boardFetch(
  input: string,
  init?: RequestInit,
): Promise<Response> {
  let path = input;
  if (input === "/api/projects")
    path = init?.method ? `${boardBase()}/board` : `${boardBase()}/documents`;
  else if (input.startsWith("/api/projects?")) path = `${boardBase()}/board`;
  else if (input.startsWith("/api/projects/"))
    path =
      boardBase() +
      input
        .replace(/^\/api\/projects\/[^/]+/, "")
        .replace("ai-prompt-chats", "ai/history");
  else if (input === "/api/generate-screen")
    path = `${boardBase()}/ai/generate`;
  else if (input === "/api/format-code") path = `${boardBase()}/format-code`;
  else if (input.startsWith("/template-data"))
    path = `/api/planning/templates/${new URL(input, window.location.origin).searchParams.get("template")}`;
  const method = init?.method ?? "GET";
  let options = init;
  if (typeof init?.body === "string" && method !== "GET") {
    const data = JSON.parse(init.body);
    options = {
      ...init,
      body: JSON.stringify({
        ...data,
        expectedVersion: version,
        expectedScreenVersion: screenVersion,
        requestId: data.requestId ?? crypto.randomUUID(),
      }),
    };
  }
  const requestScope = JSON.stringify(boardScope());
  const response = await planningFetch(path, options);
  if (
    response.ok &&
    (path.endsWith("/board") ||
      path.endsWith("/ai/generate") ||
      path.endsWith("/review"))
  ) {
    const data = await response.clone().json();
    if (!readable || requestScope !== JSON.stringify(boardScope()))
      return Response.json(
        { error: "화면이 변경되었습니다. 다시 열어 주세요." },
        { status: 409 },
      );
    if (typeof data.version === "number") version = data.version;
    if (typeof data.screenVersion === "number")
      screenVersion = data.screenVersion;
    if (method !== "GET") {
      const channel = new BroadcastChannel(
        `matrix-planning:${boardScope().projectId}`,
      );
      channel.postMessage({ type: "saved" });
      channel.close();
    }
  }
  return response;
}
