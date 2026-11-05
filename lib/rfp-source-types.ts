export const RFP_SOURCE_MAX_BYTES = 20 * 1024 * 1024;
export const RFP_GENERATION_PROMPT_MAX_LENGTH = 2000;
export const RFP_SOURCE_EXTENSIONS = ["pdf", "docx", "txt", "md"];
export const RFP_SOURCE_ACCEPT = RFP_SOURCE_EXTENSIONS.map(
  (value) => `.${value}`,
).join(",");
export type RfpSource = {
  version: number;
  file: null | {
    id: string;
    name: string;
    size: number;
    createdAt: string;
    uploadedBy: string;
  };
  active: boolean;
  requestId: string | null;
};
export type RfpGeneration = {
  requestId: string;
  status:
    | "running"
    | "stop_requested"
    | "finalizing"
    | "completed"
    | "cancelled"
    | "failed";
  documentId: string | null;
  documentVersion: number | null;
  errorCode: number | null;
};
export type RfpGenerationHistory = {
  items: Array<{
    requestId: string;
    status: RfpGeneration["status"];
    sourceName: string;
    model: string;
    prompt: string;
    documentVersion: number | null;
    errorCode: number | null;
    createdAt: string;
    finishedAt: string | null;
  }>;
  nextCursor: string | null;
};
