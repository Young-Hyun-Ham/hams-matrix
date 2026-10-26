"use client";
import { useState } from "react";
import type { PreviewDetail } from "./preview-dialog";
// Every page owns a separate hook instance; no preview/filter state is shared between pages.
export function usePreviewDialog() {
  const [detail, setDetail] = useState<PreviewDetail | null>(null);
  return {
    detail,
    setDetail,
    preview: (title: string, body: string) => setDetail({ title, body }),
    close: () => setDetail(null),
  };
}
