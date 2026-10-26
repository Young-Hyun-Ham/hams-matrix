"use client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icon";
export function AiImagePreview({ src, label }: { src: string; label: string }) {
  const [failed, setFailed] = useState(false),
    [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);
  return (
    <>
      {failed ? (
        <span className="matrix-ai-image-error" role="status">
          이미지를 불러오지 못했습니다.
        </span>
      ) : (
        <button
          type="button"
          className="matrix-ai-image-link"
          aria-label={`${label} 크게 보기`}
          onClick={() => setOpen(true)}
        >
          <Image
            src={src}
            alt={label}
            width={640}
            height={360}
            unoptimized
            onError={() => setFailed(true)}
          />
        </button>
      )}
      <dialog
        ref={dialog}
        className="matrix-ai-image-dialog"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
          }
        }}
        onCancel={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) setOpen(false);
        }}
      >
        <div>
          <strong>{label}</strong>
          <button
            type="button"
            className="icon-button"
            aria-label="이미지 미리보기 닫기"
            onClick={() => setOpen(false)}
          >
            <Icon name="close" />
          </button>
        </div>
        {open && (
          <Image src={src} alt={label} width={1600} height={1000} unoptimized />
        )}
      </dialog>
    </>
  );
}
