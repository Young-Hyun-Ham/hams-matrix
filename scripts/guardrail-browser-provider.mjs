// Loaded only by the isolated browser-test server. A cache miss must not call a real AI provider.
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  if (url.startsWith("https://api.openai.com/"))
    throw Error("Browser test forbids external AI calls");
  return originalFetch(input, init);
};
