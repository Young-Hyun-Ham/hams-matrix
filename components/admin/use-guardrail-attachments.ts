"use client";
import { useEffect, useRef, useState, type ClipboardEvent } from "react";
import { useAiImages } from "@/components/ai/use-ai-images";
import {
  GUARDRAIL_FILE_EXTENSIONS,
  GUARDRAIL_FILE_MAX_BYTES,
  GUARDRAIL_FILE_MAX_COUNT,
  GUARDRAIL_FILE_MAX_TOTAL_BYTES,
  type GuardrailTestFile,
} from "@/lib/ai/guardrail-file-types";

export function useGuardrailAttachments(
  disabled: boolean,
  invalidate: () => void,
) {
  const [attachmentLimit, setAttachmentLimit] = useState(0);
  const imageState = useAiImages(
    disabled || attachmentLimit === 0,
    attachmentLimit,
  );
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/me/subscription", {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        if (response.ok)
          setAttachmentLimit((await response.json()).plan.attachmentLimit);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  const [files, setFiles] = useState<(GuardrailTestFile & { id: string })[]>(
    [],
  );
  const [filesLoading, setFilesLoading] = useState(false),
    [fileError, setFileError] = useState("");
  const current = useRef(files),
    busy = useRef(false),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function addAttachments(selected: File[]) {
    if (
      disabled ||
      busy.current ||
      imageState.imagesLoading ||
      !selected.length
    )
      return;
    invalidate();
    busy.current = true;
    setFilesLoading(true);
    setFileError("");
    try {
      const images: File[] = [],
        documents: File[] = [];
      for (const file of selected) {
        const extension = file.name.split(".").at(-1)?.toLowerCase() ?? "";
        if (
          file.type.startsWith("image/") ||
          ["png", "jpg", "jpeg", "webp"].includes(extension)
        )
          images.push(file);
        else {
          if (!GUARDRAIL_FILE_EXTENSIONS.includes(extension))
            throw new Error(
              "이미지·텍스트·PDF·Word DOCX 파일을 선택해 주세요. DOC 파일은 DOCX로 저장해 주세요.",
            );
          if (!file.size || file.size > GUARDRAIL_FILE_MAX_BYTES)
            throw new Error(
              "문서는 비어 있지 않아야 하며 개당 최대 4MB입니다.",
            );
          documents.push(file);
        }
      }
      if (current.current.length + documents.length > GUARDRAIL_FILE_MAX_COUNT)
        throw new Error("문서는 최대 3개까지 첨부할 수 있습니다.");
      if (
        current.current.reduce((sum, file) => sum + file.byteLength, 0) +
          documents.reduce((sum, file) => sum + file.size, 0) >
        GUARDRAIL_FILE_MAX_TOTAL_BYTES
      )
        throw new Error("문서 합계는 최대 8MB입니다.");
      const added = await Promise.all(
        documents.map(async (file) => {
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result).split(",")[1]);
            reader.onerror = () =>
              reject(new Error("첨부 파일을 읽지 못했습니다."));
            reader.readAsDataURL(file);
          });
          return {
            id: crypto.randomUUID(),
            name: file.name,
            byteLength: file.size,
            base64,
          };
        }),
      );
      if (!mounted.current) return;
      current.current = [...current.current, ...added];
      setFiles(current.current);
      await imageState.addFiles(images);
    } catch (error) {
      if (mounted.current)
        setFileError(
          error instanceof Error
            ? error.message
            : "파일을 첨부하지 못했습니다.",
        );
    } finally {
      busy.current = false;
      if (mounted.current) setFilesLoading(false);
    }
  }
  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const selected = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === "file")
      .map((item) => item.getAsFile())
      .filter((file): file is File => !!file);
    if (!selected.length) return;
    event.preventDefault();
    void addAttachments(selected);
  }
  function removeFile(id: string) {
    if (disabled || busy.current) return;
    invalidate();
    current.current = current.current.filter((file) => file.id !== id);
    setFiles(current.current);
    setFileError("");
  }
  function removeImage(id: string) {
    invalidate();
    imageState.removeImage(id);
  }
  return {
    attachmentLimit,
    images: imageState.images,
    files,
    loading: filesLoading || imageState.imagesLoading,
    error: fileError || imageState.attachmentError,
    addAttachments,
    handlePaste,
    removeFile,
    removeImage,
  };
}
