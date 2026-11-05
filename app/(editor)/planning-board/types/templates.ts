import type { PreviewDocument } from "../components/types";
export type TemplateSummary = {
  id: string;
  name: string;
  kind: "builtin" | "custom";
  createdAt?: string;
};
export type TemplateDocument = PreviewDocument & { schemaVersion: 1 };
export const builtinTemplates: TemplateSummary[] = [
  { id: "screens-template", name: "화면설계서 기본템플릿", kind: "builtin" },
  { id: "screens-template2", name: "화면설계서 상세템플릿", kind: "builtin" },
];
