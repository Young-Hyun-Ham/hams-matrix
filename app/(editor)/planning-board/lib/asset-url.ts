export type AssetScope = { projectId: string; screenId: string };

export function assetUrl(scope: AssetScope, assetId: string) {
  return `/api/planning/projects/${encodeURIComponent(scope.projectId)}/screens/${encodeURIComponent(scope.screenId)}/assets/${encodeURIComponent(assetId)}/content`;
}

// Accept only canonical relative URLs, including the historical prefix.
export function parseAssetUrl(value: unknown) {
  if (typeof value !== "string" || value.length > 600) return null;
  const match =
    /^(?:\/api\/planning|\/planning-board\/api)\/projects\/([^/]+)\/screens\/([^/]+)\/assets\/([^/]+)\/content$/.exec(
      value,
    );
  if (!match) return null;
  try {
    const [projectId, screenId, assetId] = match.slice(1).map((part) => {
      const decoded = decodeURIComponent(part);
      if (
        !decoded ||
        decoded === "." ||
        decoded === ".." ||
        /[\u0000-\u0020\u007f/\\?#%]/.test(decoded) ||
        encodeURIComponent(decoded) !== part
      )
        throw new Error("Invalid asset path");
      return decoded;
    });
    return { projectId, screenId, assetId };
  } catch {
    return null;
  }
}

export function normalizeDocumentImages<T>(document: T, scope?: AssetScope): T {
  if (!document || typeof document !== "object" || Array.isArray(document))
    return document;
  const images = (document as { layerImages?: unknown }).layerImages;
  if (!images || typeof images !== "object" || Array.isArray(images))
    return document;
  return {
    ...document,
    layerImages: Object.fromEntries(
      Object.entries(images).map(([key, value]) => {
        const parsed = parseAssetUrl(value);
        return [
          key,
          parsed &&
          (!scope ||
            (parsed.projectId === scope.projectId &&
              parsed.screenId === scope.screenId))
            ? assetUrl(parsed, parsed.assetId)
            : value,
        ];
      }),
    ),
  };
}
