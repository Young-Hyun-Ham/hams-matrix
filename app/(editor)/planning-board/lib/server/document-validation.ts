import { HttpError } from "@/lib/auth";
import type { Layer, PreviewDocument } from "../../components/types";
import {
  normalizeDocumentImages,
  parseAssetUrl,
  type AssetScope,
} from "../asset-url";
export type BoardDocument = PreviewDocument & { schemaVersion: 1 };
const kinds = new Set([
  "page",
  "section",
  "layer",
  "text",
  "image",
  "clipboard",
  "button",
  "checkbox",
  "radio",
  "select",
  "icon",
]);
const fail = (message = "플래닝보드 문서 형식을 확인해 주세요."): never => {
  throw new HttpError(400, message);
};
export function validateDocument(
  input: unknown,
  scope?: AssetScope,
): BoardDocument {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail();
  const d = normalizeDocumentImages(structuredClone(input)) as BoardDocument;
  if (Buffer.byteLength(JSON.stringify(d), "utf8") > 5 * 1024 * 1024)
    throw new HttpError(413, "문서는 최대 5MiB입니다.");
  if (d.schemaVersion !== undefined && d.schemaVersion !== 1) fail();
  d.schemaVersion = 1;
  if (
    typeof d.title !== "string" ||
    !d.title.trim() ||
    d.title.length > 80 ||
    !Array.isArray(d.layers) ||
    !d.layers.length ||
    d.layers.length > 30
  )
    fail();
  const ids = new Set<string>();
  let count = 0;
  const visit = (layers: Layer[], depth: number) => {
    if (depth > 12) fail("레이어 깊이는 12단계까지 허용됩니다.");
    for (const layer of layers) {
      if (
        !layer ||
        typeof layer !== "object" ||
        typeof layer.id !== "string" ||
        !layer.id ||
        layer.id.length > 128 ||
        ids.has(layer.id) ||
        ["__proto__", "prototype", "constructor"].includes(layer.id) ||
        !kinds.has(layer.kind) ||
        typeof layer.name !== "string" ||
        layer.name.length > 200
      )
        fail();
      if ((depth === 0) !== (layer.kind === "page")) fail();
      ids.add(layer.id);
      if (++count > 2000) fail("전체 요소는 2,000개까지 허용됩니다.");
      for (const key of ["visible", "locked"] as const)
        if (layer[key] !== undefined && typeof layer[key] !== "boolean") fail();
      if (
        layer.iconType !== undefined &&
        !["", "mui", "svg"].includes(layer.iconType)
      )
        fail();
      if (
        layer.iconSize !== undefined &&
        (!Number.isFinite(layer.iconSize) ||
          layer.iconSize < 1 ||
          layer.iconSize > 512)
      )
        fail();
      if (
        layer.optionItems !== undefined &&
        (!Array.isArray(layer.optionItems) ||
          layer.optionItems.length > 20 ||
          layer.optionItems.some(
            (o) =>
              typeof o.display !== "string" ||
              typeof o.value !== "string" ||
              o.display.length > 500 ||
              o.value.length > 500,
          ))
      )
        fail();
      if (
        layer.selectMode !== undefined &&
        !["single", "multi"].includes(layer.selectMode)
      )
        fail();
      if (layer.children !== undefined) {
        if (
          !Array.isArray(layer.children) ||
          !["page", "section", "layer"].includes(layer.kind)
        )
          fail();
        visit(layer.children, depth + 1);
      }
    }
  };
  visit(d.layers, 0);
  const maps = [
    "sizes",
    "positions",
    "layerText",
    "layerImages",
    "layerStyles",
  ] as const;
  for (const key of maps) {
    const map = d[key];
    if (!map || typeof map !== "object" || Array.isArray(map)) fail();
    for (const [id, value] of Object.entries(map)) {
      if (
        !ids.has(id) ||
        ["__proto__", "prototype", "constructor"].includes(id)
      )
        fail();
      if (key === "layerText") {
        if (typeof value !== "string" || value.length > 10000) fail();
        continue;
      }
      if (key === "layerImages") {
        const asset = parseAssetUrl(value);
        if (
          typeof value !== "string" ||
          !asset ||
          (scope &&
            (asset.projectId !== scope.projectId ||
              asset.screenId !== scope.screenId)) ||
          value.length > 600
        )
          fail("이미지는 해당 화면의 비공개 첨부 자산만 사용할 수 있습니다.");
        continue;
      }
      if (!value || typeof value !== "object" || Array.isArray(value)) fail();
      for (const [name, v] of Object.entries(value)) {
        const numeric = [
          "fontSize",
          "lineHeight",
          "fontWeight",
          "borderWidth",
          "opacity",
          "borderRadius",
        ];
        const strings = [
          "color",
          "backgroundColor",
          "borderColor",
          "textAlign",
          "verticalAlign",
          "effect",
        ];
        if (
          key === "layerStyles" &&
          ((!numeric.includes(name) && !strings.includes(name)) ||
            (numeric.includes(name) && typeof v !== "number") ||
            (strings.includes(name) && typeof v !== "string"))
        )
          fail();
        if (
          key === "layerStyles" &&
          numeric.includes(name) &&
          typeof v === "number" &&
          v < 0
        )
          fail();

        if (
          name === "verticalAlign" &&
          !["top", "middle", "bottom"].includes(String(v))
        )
          fail();

        if (
          typeof v === "number" &&
          (!Number.isFinite(v) || Math.abs(v) > 50000)
        )
          fail();
        if (
          ["width", "height"].includes(name) &&
          (typeof v !== "number" || v <= 0)
        )
          fail();
        if (name === "opacity" && (typeof v !== "number" || v < 0 || v > 1))
          fail();
        if (
          typeof v === "string" &&
          (v.length > 300 || /url\s*\(|expression\s*\(|[<>;]/i.test(v))
        )
          fail();
      }
      if (
        key === "sizes" &&
        (!("width" in value) ||
          !("height" in value) ||
          typeof value.width !== "number" ||
          typeof value.height !== "number")
      )
        fail();
      if (
        key === "positions" &&
        (!("x" in value) ||
          !("y" in value) ||
          typeof value.x !== "number" ||
          typeof value.y !== "number")
      )
        fail();
    }
  }
  d.activePageId =
    typeof d.activePageId === "string"
      ? d.activePageId
      : ((input as { selected?: string }).selected ?? d.layers[0].id);
  // Selection can point to a child in the editor; preview must reference its page.
  if (!d.layers.some((p) => p.id === d.activePageId))
    d.activePageId = d.layers[0].id;
  return {
    schemaVersion: 1,
    title: d.title,
    activePageId: d.activePageId,
    layers: d.layers,
    sizes: d.sizes,
    positions: d.positions,
    layerText: d.layerText,
    layerImages: d.layerImages,
    layerStyles: d.layerStyles,
  };
}
