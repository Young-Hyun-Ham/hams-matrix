import { HttpError } from "@/lib/auth";
import { validateDocument } from "./document-validation";
import type { TemplateDocument } from "../../types/templates";
export const templateAssetReference = (id: string) => `template-asset:${id}`;
export function templateAssetId(value: string) {
  const match = /^template-asset:([0-9a-f-]{36})$/.exec(value);
  if (!match) throw new HttpError(400, "템플릿 이미지 형식을 확인해 주세요.");
  return match[1];
}
export function validateTemplateDocument(input: unknown): TemplateDocument {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new HttpError(400, "템플릿 문서 형식을 확인해 주세요.");
  const source = input as TemplateDocument;
  if (
    !source.layerImages ||
    typeof source.layerImages !== "object" ||
    Array.isArray(source.layerImages) ||
    Buffer.byteLength(JSON.stringify(input), "utf8") > 5 * 1024 * 1024
  )
    throw new HttpError(400, "템플릿 문서 형식을 확인해 주세요.");
  const base = validateDocument({ ...source, layerImages: {} });
  const ids = new Set<string>();
  const visit = (layers: typeof base.layers) => {
    for (const layer of layers) {
      ids.add(layer.id);
      if (layer.children) visit(layer.children);
    }
  };
  visit(base.layers);
  for (const [id, value] of Object.entries(source.layerImages)) {
    if (!ids.has(id) || typeof value !== "string")
      throw new HttpError(400, "템플릿 이미지 형식을 확인해 주세요.");
    templateAssetId(value);
  }
  return { ...base, layerImages: { ...source.layerImages } };
}
