import "server-only";
import { unzipSync } from "fflate";
import { SaxesParser } from "saxes";
import { getDocumentProxy } from "unpdf";
import { HttpError } from "./auth";
const DOCUMENT_MAX_TEXT = 100000;

function boundedText(text: string) {
  if (text.length > DOCUMENT_MAX_TEXT)
    throw new HttpError(
      400,
      "파일의 추출 본문이 100,000자를 초과합니다. 문서를 나누어 첨부해 주세요.",
    );
  return text;
}
function utf8(bytes: Uint8Array) {
  try {
    return new TextDecoder("utf-8", { fatal: true })
      .decode(bytes)
      .replace(/^\uFEFF/, "");
  } catch {
    throw new HttpError(400, "텍스트 파일은 UTF-8 형식으로 저장해 주세요.");
  }
}
async function pdfText(bytes: Buffer, signal: AbortSignal) {
  if (!bytes.subarray(0, 1024).includes(Buffer.from("%PDF-")))
    throw new HttpError(400, "올바른 PDF 파일이 아닙니다.");
  const pdf = await getDocumentProxy(new Uint8Array(bytes), {
    disableFontFace: true,
    useSystemFonts: false,
    stopAtErrors: true,
    verbosity: 0,
  });
  try {
    if (pdf.numPages > 50)
      throw new HttpError(400, "PDF는 최대 50페이지까지 검사할 수 있습니다.");
    let text = "";
    for (let index = 1; index <= pdf.numPages; index++) {
      signal.throwIfAborted();
      const page = await pdf.getPage(index);
      try {
        const content = await page.getTextContent();
        text = boundedText(
          text +
            content.items
              .map((item) => ("str" in item ? item.str : ""))
              .join(" ") +
            "\n",
        );
      } finally {
        page.cleanup();
      }
    }
    return text;
  } finally {
    await pdf.loadingTask.destroy();
  }
}
function docxText(bytes: Buffer) {
  if (bytes.readUInt32LE(0) !== 0x04034b50)
    throw new HttpError(400, "올바른 Word DOCX 파일이 아닙니다.");
  let count = 0,
    total = 0;
  const entries = unzipSync(bytes, {
    filter: (file) => {
      if (++count > 1000)
        throw new HttpError(400, "Word 문서의 내부 파일 수가 너무 많습니다.");
      const include =
        file.name === "[Content_Types].xml" ||
        /^word\/(?:document|header\d*|footer\d*|footnotes|endnotes|comments)\.xml$/.test(
          file.name,
        );
      if (!include) return false;
      total += file.originalSize;
      if (file.originalSize > 2 * 1024 * 1024 || total > 8 * 1024 * 1024)
        throw new HttpError(400, "Word 문서의 압축 해제 크기가 너무 큽니다.");
      return true;
    },
  });
  if (!entries["word/document.xml"] || !entries["[Content_Types].xml"])
    throw new HttpError(400, "Word 문서 본문을 찾을 수 없습니다.");
  let text = "";
  for (const [name, data] of Object.entries(entries)) {
    if (name === "[Content_Types].xml") continue;
    const parser = new SaxesParser({ xmlns: true });
    let capture = false;
    parser.on("doctype", () => {
      throw new HttpError(400, "Word 문서의 DTD 선언은 지원하지 않습니다.");
    });
    parser.on("error", () => {
      throw new HttpError(400, "Word 문서의 XML 본문이 손상되었습니다.");
    });
    parser.on("opentag", (tag) => {
      if (tag.local === "t" || tag.local === "instrText") capture = true;
    });
    parser.on("text", (value) => {
      if (capture) text = boundedText(text + value);
    });
    parser.on("closetag", (tag) => {
      if (tag.local === "t" || tag.local === "instrText") capture = false;
      if (tag.local === "p") text = boundedText(text + "\n");
    });
    parser.write(utf8(data)).close();
    text = boundedText(text + "\n");
  }
  return text;
}
export async function extractDocumentText(
  bytes: Buffer,
  extension: string,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  let text: string;
  try {
    text =
      extension === "pdf"
        ? await pdfText(bytes, signal)
        : extension === "docx"
          ? docxText(bytes)
          : boundedText(utf8(bytes));
  } catch (error) {
    if (error instanceof HttpError || signal.aborted) throw error;
    throw new HttpError(
      400,
      "문서를 읽지 못했습니다. 암호화·손상 여부와 파일 형식을 확인해 주세요.",
    );
  }
  if (!text.trim() || /\x00/.test(text))
    throw new HttpError(
      400,
      "추출할 수 있는 텍스트가 없습니다. 스캔 PDF는 OCR 처리 후 첨부해 주세요.",
    );
  signal.throwIfAborted();
  return text;
}
