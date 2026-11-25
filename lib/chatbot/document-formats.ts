export const documentFormats = [
  "md",
  "txt",
  "docx",
  "pptx",
  "pdf",
  "mermaid",
] as const;
export type DocumentFormat = (typeof documentFormats)[number];
export function isDocumentFormat(value: unknown): value is DocumentFormat {
  return documentFormats.includes(value as DocumentFormat);
}
export const documentMime: Record<DocumentFormat, string> = {
  md: "text/markdown; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  pdf: "application/pdf",
  mermaid: "text/vnd.mermaid; charset=utf-8",
};
