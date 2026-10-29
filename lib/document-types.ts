export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
export type DocumentFolder = {
  id: string;
  parentId: string | null;
  name: string;
};
export type DocumentFile = {
  id: string;
  name: string;
  size: number;
  createdAt: string;
  uploadedBy: string;
};
export type DocumentListing = {
  folders: DocumentFolder[];
  files: DocumentFile[];
};
