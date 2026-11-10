// Fixture client for pre-selector regressions: perform the same explicit target save
// as the UI before changing tabs. Target contract/race tests call the routes directly.
export function withAiTargetSelection(rawRequest) {
  return async function request(path, options = {}) {
    const input = options.data;
    if (path === "/api/ai/chats" && options.method === "POST" && input && !Object.hasOwn(input, "targetPage")) {
      const projectId = input.projectId || "";
      const response = await rawRequest(`/api/ai/chats?${new URLSearchParams({ projectId, convId: input.convId || "" })}`, { cookie: options.cookie });
      if (response.ok) {
        let room = (await response.json()).conversation;
        const target = projectId ? input.tab : input.pathname?.slice(1);
        if (target && (room.targetPage !== target || !room.targetVersion)) {
          const saved = await rawRequest(`/api/ai/conversations/${room.convId}`, {
            cookie: options.cookie, method: "PATCH",
            data: { projectId, targetPage: target, expectedTargetVersion: room.targetVersion },
          });
          if (saved.ok) room = (await saved.json()).conversation;
        }
        if (target && room.targetPage === target) options = { ...options, data: {
          ...input, targetPage: room.targetPage, expectedTargetVersion: room.targetVersion,
          sourceContext: { pathname: input.pathname, tab: input.tab },
        } };
      }
    }
    return rawRequest(path, options);
  };
}
