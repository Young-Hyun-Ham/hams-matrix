export const GUARDRAIL_FILE_MAX_COUNT = 3;
export const GUARDRAIL_FILE_MAX_BYTES = 4 * 1024 * 1024;
export const GUARDRAIL_FILE_MAX_TOTAL_BYTES = 8 * 1024 * 1024;
export const GUARDRAIL_FILE_MAX_TEXT = 100000;
export const GUARDRAIL_FILE_EXTENSIONS = ["txt", "md", "markdown", "csv", "json", "log", "yaml", "yml", "xml", "pdf", "docx"];
export const GUARDRAIL_FILE_ACCEPT = "image/png,image/jpeg,image/webp," + GUARDRAIL_FILE_EXTENSIONS.map(extension => `.${extension}`).join(",");
export type GuardrailTestFile = { name: string; base64: string; byteLength: number };
