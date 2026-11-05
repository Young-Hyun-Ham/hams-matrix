import "server-only";
import { extractDocumentText } from "../document-text";
import { HttpError } from "../auth";
import {
  GUARDRAIL_FILE_EXTENSIONS,
  GUARDRAIL_FILE_MAX_BYTES,
  GUARDRAIL_FILE_MAX_COUNT,
  GUARDRAIL_FILE_MAX_TOTAL_BYTES,
} from "./guardrail-file-types";

export async function extractGuardrailFiles(
  value: unknown,
  signal: AbortSignal,
) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > GUARDRAIL_FILE_MAX_COUNT)
    throw new HttpError(400, "문서 파일은 최대 3개까지 첨부할 수 있습니다.");
  let total = 0;
  const files = value.map((item) => {
    if (
      !item ||
      typeof item !== "object" ||
      typeof item.name !== "string" ||
      !item.name.trim() ||
      item.name.length > 160 ||
      /[\x00-\x1f/\\]/.test(item.name) ||
      typeof item.base64 !== "string"
    )
      throw new HttpError(400, "첨부 파일 이름과 형식을 확인해 주세요.");
    const extension = item.name.split(".").at(-1)?.toLowerCase();
    if (!extension || !GUARDRAIL_FILE_EXTENSIONS.includes(extension))
      throw new HttpError(
        400,
        "UTF-8 텍스트·PDF·Word DOCX 파일만 지원합니다. DOC 파일은 DOCX로 저장해 주세요.",
      );
    if (
      item.base64.length > 4 * Math.ceil(GUARDRAIL_FILE_MAX_BYTES / 3) ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(item.base64)
    )
      throw new HttpError(
        400,
        "파일은 비어 있지 않아야 하며 개당 최대 4MB입니다.",
      );
    const bytes = Buffer.from(item.base64, "base64");
    total += bytes.length;
    if (
      bytes.toString("base64") !== item.base64 ||
      !bytes.length ||
      bytes.length > GUARDRAIL_FILE_MAX_BYTES ||
      total > GUARDRAIL_FILE_MAX_TOTAL_BYTES
    )
      throw new HttpError(
        400,
        "문서는 개당 4MB, 합계 8MB까지 첨부할 수 있습니다.",
      );
    return { name: item.name as string, extension, bytes };
  });
  const extracted = [];
  for (const file of files) {
    signal.throwIfAborted();
    const text = await extractDocumentText(file.bytes, file.extension, signal);
    extracted.push({
      name: file.name,
      text,
      byteLength: file.bytes.length,
      characters: text.length,
    });
  }
  return extracted;
}
