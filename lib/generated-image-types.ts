export type GeneratedImageInfo = {
  id: string;
  model: string;
  prompt: string;
  createdAt: string;
  width: number;
  height: number;
  byteLength: number;
  url: string;
  artifactVersion?: number;
  sourceHash?: string;
};
