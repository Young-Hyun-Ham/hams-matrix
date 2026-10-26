export const AI_IMAGE_MAX_COUNT = 3;
export const AI_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
export const AI_IMAGE_MAX_TOTAL_BYTES = AI_IMAGE_MAX_COUNT * AI_IMAGE_MAX_BYTES;
export const AI_IMAGE_MAX_DIMENSION = 4096;
export type AiImageInput = { dataUrl: string };
export type AiImageInfo = {
  id: string;
  url: string;
  mimeType: string;
  byteLength: number;
  width: number;
  height: number;
};
