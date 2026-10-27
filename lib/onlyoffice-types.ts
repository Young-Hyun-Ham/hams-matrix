import type { DocumentEditorProps } from "@onlyoffice/document-editor-react";

export type OnlyofficeConfiguration = {
  documentServerUrl: string;
  name: string;
  canEdit: boolean;
  config: DocumentEditorProps["config"];
};
