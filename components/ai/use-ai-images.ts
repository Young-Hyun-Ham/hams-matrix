"use client";
import { useEffect, useRef, useState, type ClipboardEvent } from "react";
import {
  AI_IMAGE_MAX_BYTES,
  AI_IMAGE_MAX_COUNT,
  AI_IMAGE_MAX_DIMENSION,
  type AiImageInput,
  type AiImageInfo,
} from "@/lib/ai-image-types";
export type PastedAiImage = AiImageInput & {
  id: string;
  width: number;
  height: number;
  byteLength: number;
};
async function captureImage(file: File): Promise<PastedAiImage> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
    throw new Error("PNG·JPEG·WebP 캡처 이미지를 붙여넣어 주세요.");
  if (file.size > 10 * 1024 * 1024)
    throw new Error("원본 이미지가 너무 큽니다. 캡처 영역을 줄여 주세요.");
  const bitmap = await createImageBitmap(file);
  try {
    if (
      bitmap.width > AI_IMAGE_MAX_DIMENSION ||
      bitmap.height > AI_IMAGE_MAX_DIMENSION
    )
      throw new Error("이미지 가로·세로는 각각 4096px 이하여야 합니다.");
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("이미지 미리보기를 만들지 못했습니다.");
    ctx.drawImage(bitmap, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) =>
          value
            ? resolve(value)
            : reject(new Error("이미지를 변환하지 못했습니다.")),
        "image/png",
      ),
    );
    if (blob.size > AI_IMAGE_MAX_BYTES)
      throw new Error(
        "이미지는 한 장당 최대 2MB입니다. 캡처 영역을 줄여 주세요.",
      );
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("이미지를 읽지 못했습니다."));
      reader.readAsDataURL(blob);
    });
    return {
      id: crypto.randomUUID(),
      dataUrl,
      byteLength: blob.size,
      width: canvas.width,
      height: canvas.height,
    };
  } finally {
    bitmap.close();
  }
}
export function useAiImages(disabled: boolean) {
  const [images, setImages] = useState<PastedAiImage[]>([]),
    [imagesLoading, setImagesLoading] = useState(false),
    [attachmentError, setAttachmentError] = useState("");
  const current = useRef<PastedAiImage[]>([]),
    busy = useRef(false),
    operation = useRef(0),
    active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  function clearImages() {
    operation.current += 1;
    busy.current = false;
    current.current = [];
    setImages([]);
    setImagesLoading(false);
    setAttachmentError("");
  }
  function removeImage(id: string) {
    if (disabled) return;
    current.current = current.current.filter((image) => image.id !== id);
    setImages(current.current);
    setAttachmentError("");
  }
  async function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === "file")
      .map((item) => item.getAsFile())
      .filter((file): file is File => !!file);
    if (!files.length) return;
    event.preventDefault();
    await addFiles(files);
  }
  async function addFiles(files: File[]) {
    if (!files.length) return;
    if (disabled || busy.current) return;
    if (current.current.length + files.length > AI_IMAGE_MAX_COUNT) {
      setAttachmentError("이미지는 최대 3장까지 첨부할 수 있습니다.");
      return;
    }
    busy.current = true;
    const operationId = ++operation.current;
    setImagesLoading(true);
    setAttachmentError("");
    try {
      const added = await Promise.all(files.map(captureImage));
      if (!active.current || operationId !== operation.current) return;
      current.current = [...current.current, ...added];
      setImages(current.current);
    } catch (error) {
      if (active.current && operationId === operation.current)
        setAttachmentError(
          error instanceof Error
            ? error.message
            : "이미지를 붙여넣지 못했습니다.",
        );
    } finally {
      if (operationId === operation.current) {
        busy.current = false;
        if (active.current) setImagesLoading(false);
      }
    }
  }
  async function restoreImages(saved: AiImageInfo[]) {
    if (disabled || busy.current) return false;
    busy.current = true;
    const operationId = ++operation.current;
    setImagesLoading(true);
    setAttachmentError("");
    try {
      const restored = await Promise.all(
        saved.map(async (image, index) => {
          const response = await fetch(image.url, { cache: "no-store" });
          if (!response.ok)
            throw new Error("기록의 첨부 이미지를 불러오지 못했습니다.");
          return captureImage(
            new File([await response.blob()], `capture-${index}.png`, {
              type: "image/png",
            }),
          );
        }),
      );
      if (!active.current || operationId !== operation.current) return false;
      current.current = restored;
      setImages(restored);
      return true;
    } catch (error) {
      if (active.current && operationId === operation.current)
        setAttachmentError(
          error instanceof Error
            ? error.message
            : "이미지를 다시 사용하지 못했습니다.",
        );
      return false;
    } finally {
      if (operationId === operation.current) {
        busy.current = false;
        if (active.current) setImagesLoading(false);
      }
    }
  }
  return {
    images,
    imagesLoading,
    attachmentError,
    handlePaste,
    addFiles,
    removeImage,
    restoreImages,
    clearImages,
  };
}
