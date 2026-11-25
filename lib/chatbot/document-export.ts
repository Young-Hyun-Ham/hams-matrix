import "server-only";
import { documentMime, isDocumentFormat } from "./document-formats";
import { documentDocx, documentPptx } from "./document-ooxml";
import { documentPdf } from "./document-pdf";
import { documentMermaidError } from "@/lib/mermaid-render";
import { fail } from "./server";
export async function exportDocument(
  source: string,
  format: string,
  signal?: AbortSignal,
) {
  if (!isDocumentFormat(format)) fail(400, "지원하지 않는 문서 형식입니다.");
  if (format === "mermaid") {
    source = source
      .trim()
      .replace(/^```mermaid\s*\n/i, "")
      .replace(/\n```\s*$/, "")
      .trim();
    const error = documentMermaidError(source);
    if (error) fail(502, error);
  }
  const bytes =
    format === "docx"
      ? await documentDocx(source)
      : format === "pptx"
        ? await documentPptx(source)
        : format === "pdf"
          ? await documentPdf(source, signal)
          : Buffer.from(source, "utf8");
  if (bytes.length > 67108864) fail(413, "생성한 문서는 최대 64MB입니다.");
  return {
    bytes,
    source,
    mime: documentMime[format],
    extension: format === "mermaid" ? "mmd" : format,
  };
}
