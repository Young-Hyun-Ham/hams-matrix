"use client";
/* eslint-disable @next/next/no-img-element -- Saved authenticated PNG; preserve its native resolution for download. */
import { useEffect, useId, useRef, useState } from "react";
import { jsonRequest } from "@/lib/client-request";
import type { GeneratedImageInfo } from "@/lib/generated-image-types";
import "./database-erd-preview.css";

export function DatabaseErdPreview({
  projectId,
  canWrite,
}: {
  projectId: string;
  canWrite: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    active = useRef(true),
    running = useRef(false);
  const titleId = useId();
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [image, setImage] = useState<GeneratedImageInfo | null>(null);
  const [sourceHash, setSourceHash] = useState(""),
    [error, setError] = useState(""),
    [imageError, setImageError] = useState(false);
  const [zoom, setZoom] = useState<"fit" | "actual">("fit");
  const endpoint = `/api/projects/${encodeURIComponent(projectId)}/database/erd/image`;
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    if (!open) dialog.current?.close();
  }, [open]);
  async function load(regenerate = false, generateMissing = true) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    setImageError(false);
    if (!open) {
      setImage(null);
      setOpen(true);
      setZoom("fit");
    }
    try {
      const saved: { image: GeneratedImageInfo | null; sourceHash: string } =
        await jsonRequest(endpoint);
      if (!active.current) return;
      setSourceHash(saved.sourceHash);
      if (!regenerate) setImage(saved.image);
      if (saved.image && !regenerate) return;
      if (!generateMissing && !regenerate) return;
      if (!canWrite)
        throw new Error(
          "저장된 이미지가 없습니다. DB설계 수정 권한이 있는 사용자에게 생성을 요청해 주세요.",
        );
      if (regenerate && saved.image?.id !== image?.id) {
        setImage(saved.image);
        throw new Error(
          "다른 사용자가 이미지를 변경했습니다. 최신 이미지를 불러왔습니다. 확인 후 다시 생성해 주세요.",
        );
      }
      const result = await jsonRequest(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceHash: saved.sourceHash,
          ...(regenerate
            ? { regenerate: true, expectedImageId: saved.image?.id }
            : {}),
        }),
      });
      if (active.current) {
        setImage(result.image);
        setSourceHash(result.sourceHash);
        setZoom("fit");
      }
    } catch (e) {
      if (active.current)
        setError(
          e instanceof Error ? e.message : "미리보기를 불러오지 못했습니다.",
        );
    } finally {
      running.current = false;
      if (active.current) setBusy(false);
    }
  }
  async function download() {
    if (!image || running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`${image.url}&download=1`, {
        cache: "no-store",
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || "다운로드하지 못했습니다.");
      }
      const url = URL.createObjectURL(await response.blob()),
        link = document.createElement("a");
      link.href = url;
      link.download = `ERD-${projectId}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (e) {
      if (active.current)
        setError(e instanceof Error ? e.message : "다운로드하지 못했습니다.");
    } finally {
      running.current = false;
      if (active.current) setBusy(false);
    }
  }
  return (
    <>
      <button
        type="button"
        className="button"
        onClick={() => void load()}
        disabled={busy}
      >
        미리보기
      </button>
      <dialog
        ref={dialog}
        className="workspace-dialog admin-detail-dialog database-erd-preview"
        aria-labelledby={titleId}
        onCancel={(e) => {
          e.preventDefault();
          if (!running.current) setOpen(false);
        }}
      >
        <header className="dialog-header admin-detail-header database-erd-preview-header">
          <h2 id={titleId}>ERD 이미지 미리보기</h2>
          <button
            type="button"
            className="button admin-detail-close"
            disabled={busy}
            onClick={() => setOpen(false)}
          >
            닫기
          </button>
        </header>
        <div
          className="admin-detail-body database-erd-preview-body"
          aria-busy={busy}
        >
          <p>관계별 테이블 배치와 직각 연결선으로 정리한 저장 이미지입니다.</p>
          {busy && (
            <p role="status">
              {image
                ? "요청을 처리하고 있습니다. 기존 이미지는 유지됩니다."
                : "저장 이미지를 확인하고, 없으면 AI가 배치를 구성해 이미지를 생성합니다. 잠시 기다려 주세요."}
            </p>
          )}
          {error && (
            <p role="alert" className="matrix-error">
              {error}
            </p>
          )}
          {image && (
            <>
              <div className="database-erd-preview-toolbar">
                <p>
                  {new Date(image.createdAt).toLocaleString("ko-KR", {
                    timeZone: "Asia/Seoul",
                  })}{" "}
                  · {image.width} × {image.height}px
                </p>
                <button
                  type="button"
                  className="button"
                  onClick={() =>
                    setZoom((z) => (z === "fit" ? "actual" : "fit"))
                  }
                >
                  {zoom === "fit" ? "원본 크기" : "한눈에 보기"}
                </button>
              </div>
              {sourceHash && image.sourceHash !== sourceHash && (
                <p role="status">
                  테이블이 변경되었습니다. 저장된 이미지를 표시합니다. 최신
                  내용을 반영하려면 ‘다시 생성’을 눌러 주세요.
                </p>
              )}
              <div
                className={`database-erd-preview-canvas ${zoom === "fit" ? "is-fit" : "is-actual"}`}
              >
                <img
                  key={image.id}
                  src={image.url}
                  alt="테이블과 컬럼의 외래키 관계를 정리한 ERD"
                  onError={() => setImageError(true)}
                  onLoad={() => setImageError(false)}
                />
              </div>
              {imageError && (
                <p role="alert">
                  이미지를 불러오지 못했습니다. 저장 이미지를 다시 불러와
                  주세요.
                </p>
              )}
            </>
          )}
          {!image && !busy && !error && <p>저장된 이미지가 없습니다.</p>}
        </div>
        <footer className="project-registration-footer database-erd-preview-footer">
          <button
            type="button"
            className="button"
            disabled={busy}
            onClick={() => void load(false, false)}
          >
            저장 이미지 다시 불러오기
          </button>
          {canWrite && (
            <button
              type="button"
              className="button"
              disabled={busy}
              onClick={() => void load(!!image)}
            >
              {image ? "다시 생성" : "이미지 생성"}
            </button>
          )}
          <button
            type="button"
            className="button primary"
            disabled={busy || !image}
            onClick={() => void download()}
          >
            이미지 다운로드
          </button>
        </footer>
      </dialog>
    </>
  );
}
