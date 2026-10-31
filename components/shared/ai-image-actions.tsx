"use client";
/* eslint-disable @next/next/no-img-element -- Authenticated image routes serve the saved PNG directly. */
import { useEffect, useId, useRef, useState } from "react";
import type { GeneratedImageInfo } from "@/lib/generated-image-types";
import { jsonRequest } from "@/lib/client-request";
import "./ai-image-actions.css";

type Intent = "preview" | "download";
type Mode = Intent | "generate" | null;
export function AiImageActions({
  endpoint,
  label,
  subject,
  description,
  promptPlaceholder,
  filename,
  artifactVersion,
  canWrite,
  onBusyChange,
}: {
  endpoint: string;
  label: string;
  subject: string;
  description: string;
  promptPlaceholder: string;
  filename: string;
  artifactVersion?: number;
  canWrite: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const active = useRef(true),
    running = useRef(false);
  const [mode, setMode] = useState<Mode>(null);
  const [intent, setIntent] = useState<Intent>("preview");
  const [image, setImage] = useState<GeneratedImageInfo | null>(null);
  const [sourceHash, setSourceHash] = useState("");
  const [models, setModels] = useState<string[]>([]),
    [model, setModel] = useState("");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false),
    [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [imageError, setImageError] = useState(false),
    [imageLoaded, setImageLoaded] = useState(false);

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    if (mode && !dialog.current?.open) dialog.current?.showModal();
    if (!mode) dialog.current?.close();
  }, [mode]);

  const setWorking = (value: boolean) => {
    running.current = value;
    if (active.current) {
      setBusy(value);
      onBusyChange?.(value);
    }
  };
  const showError = (error: unknown) => {
    if (active.current)
      setError(
        error instanceof Error ? error.message : "이미지 요청에 실패했습니다.",
      );
  };
  async function loadModels(previous: GeneratedImageInfo | null) {
    setModels([]);
    setModel("");
    const response = await jsonRequest("/api/ai/image-models");
    if (!active.current) return;
    setModels(response.models);
    setModel(
      previous && response.models.includes(previous.model)
        ? previous.model
        : response.defaultModel,
    );
  }
  async function open(requested: Intent) {
    if (running.current) return;
    setWorking(true);
    setError("");
    setImageError(false);
    setImageLoaded(false);
    setIntent(requested);
    try {
      const result: { image: GeneratedImageInfo | null; sourceHash?: string } =
        await jsonRequest(endpoint);
      if (!active.current) return;
      setImage(result.image);
      setSourceHash(result.sourceHash ?? "");
      if (result.image) setMode(requested);
      else {
        if (!canWrite)
          throw new Error(
            "저장된 이미지가 없습니다. 프로젝트 편집 권한이 있는 사용자에게 생성을 요청해 주세요.",
          );
        setPrompt("");
        setMode("generate");
        await loadModels(null);
      }
    } catch (error) {
      showError(error);
    } finally {
      setWorking(false);
    }
  }
  async function regenerate() {
    if (running.current || !canWrite) return;
    setWorking(true);
    setError("");
    setMode("generate");
    try {
      const result: { image: GeneratedImageInfo | null; sourceHash?: string } =
        await jsonRequest(endpoint);
      if (!active.current) return;
      setImage(result.image);
      setSourceHash(result.sourceHash ?? "");
      setPrompt(result.image?.prompt ?? "");
      await loadModels(result.image);
    } catch (error) {
      showError(error);
    } finally {
      setWorking(false);
    }
  }
  async function retryModels() {
    if (running.current) return;
    setWorking(true);
    setError("");
    try {
      await loadModels(image);
    } catch (error) {
      showError(error);
    } finally {
      setWorking(false);
    }
  }
  async function generate() {
    if (running.current || !model || !canWrite) return;
    setWorking(true);
    setGenerating(true);
    setError("");
    try {
      const result: { image: GeneratedImageInfo; sourceHash?: string } =
        await jsonRequest(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            prompt,
            artifactVersion,
            sourceHash,
            regenerate: !!image,
            expectedImageId: image?.id,
          }),
        });
      if (!active.current) return;
      setImage(result.image);
      if (result.sourceHash) setSourceHash(result.sourceHash);
      setImageError(false);
      setImageLoaded(false);
      setMode(intent);
    } catch (error) {
      showError(error);
    } finally {
      if (active.current) setGenerating(false);
      setWorking(false);
    }
  }
  function close() {
    if (busy) return;
    setError("");
    // Cancelling regeneration returns to the previous saved image.
    setMode(mode === "generate" && image ? intent : null);
  }
  async function download() {
    if (!image || running.current) return;
    setWorking(true);
    setError("");
    try {
      const response = await fetch(`${image.url}&download=1`, {
        cache: "no-store",
      });
      if (!response.ok) {
        const failure = await response.json();
        throw new Error(failure.error || "이미지를 다운로드하지 못했습니다.");
      }
      const blob = await response.blob();
      if (!active.current) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${filename.replace(/[<>:"/\\|?*]/g, "-")}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (error) {
      showError(error);
    } finally {
      setWorking(false);
    }
  }

  const title =
    mode === "generate"
      ? `AI ${label} 이미지 생성`
      : mode === "download"
        ? `${label} 이미지 다운로드`
        : `${label} 이미지 미리보기`;
  const stale =
    image &&
    (artifactVersion !== undefined
      ? image.artifactVersion !== artifactVersion
      : image.sourceHash !== sourceHash);
  return (
    <>
      <div className="matrix-image-actions">
        <button
          type="button"
          className="button"
          disabled={busy}
          onClick={() => void open("preview")}
        >
          미리보기
        </button>
        <button
          type="button"
          className="button"
          disabled={busy}
          onClick={() => void open("download")}
        >
          PNG 이미지 다운로드
        </button>
        {busy && !mode && <span role="status">저장 이미지 확인 중...</span>}
        {error && !mode && (
          <p role="alert" className="matrix-error">
            {error}
          </p>
        )}
      </div>
      <dialog
        ref={dialog}
        className={`matrix-dialog matrix-image-modal ${mode === "generate" ? "matrix-image-generate" : "matrix-image-preview"}`}
        aria-labelledby={titleId}
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
      >
        <header className="matrix-image-header">
          <h2 id={titleId}>{title}</h2>
          <button
            type="button"
            className="button"
            disabled={busy}
            onClick={close}
          >
            {mode === "generate" ? "취소" : "닫기"}
          </button>
        </header>
        {mode === "generate" ? (
          <form
            className="matrix-image-form"
            onSubmit={(event) => {
              event.preventDefault();
              void generate();
            }}
          >
            <p>{subject}</p>
            <p className="matrix-image-hint">{description}</p>
            <fieldset disabled={busy || !canWrite}>
              <label>
                AI 이미지 모델 *
                <select
                  required
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                >
                  <option value="">
                    {busy ? "모델 조회 중..." : "이미지 모델을 선택하세요"}
                  </option>
                  {models.map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                추가 요청 (선택)
                <input
                  type="text"
                  value={prompt}
                  maxLength={1000}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder={promptPlaceholder}
                />
              </label>
            </fieldset>
            {generating && (
              <p role="status">
                AI가 이미지를 생성하고 저장하고 있습니다. 잠시 기다려 주세요.
              </p>
            )}
            {error && (
              <p role="alert" className="matrix-error">
                {error}
              </p>
            )}
            <footer className="matrix-image-actions matrix-image-footer">
              {!models.length && !busy && (
                <button
                  type="button"
                  className="button"
                  onClick={() => void retryModels()}
                >
                  모델 다시 조회
                </button>
              )}
              <button
                type="submit"
                className="button primary"
                disabled={busy || !model || !canWrite}
              >
                {generating
                  ? "생성 중..."
                  : image
                    ? "다시 생성하고 저장"
                    : "생성하고 저장"}
              </button>
            </footer>
          </form>
        ) : (
          mode &&
          image && (
            <div className="matrix-image-image-result">
              <p>
                {image.model} ·{" "}
                {new Date(image.createdAt).toLocaleString("ko-KR", {
                  timeZone: "Asia/Seoul",
                })}{" "}
                · {image.width} × {image.height}px
              </p>
              {stale && (
                <p className="matrix-image-stale" role="status">
                  이전 {label} 데이터를 기준으로 생성된 이미지입니다. 최신
                  내용을 반영하려면 다시 생성해 주세요.
                </p>
              )}
              <div className="matrix-image-canvas">
                <img
                  key={image.id}
                  src={image.url}
                  alt={`${subject} AI 생성 ${label} 이미지`}
                  className="matrix-image-generated-image"
                  onLoad={() => {
                    setImageLoaded(true);
                    setImageError(false);
                  }}
                  onError={() => {
                    setImageError(true);
                    setImageLoaded(false);
                  }}
                />
              </div>
              {!imageLoaded && !imageError && (
                <p role="status">이미지를 불러오는 중...</p>
              )}
              {imageError && (
                <p role="alert" className="matrix-error">
                  이미지를 불러오지 못했습니다. 창을 닫고 다시 열어 주세요.
                </p>
              )}
              {error && (
                <p role="alert" className="matrix-error">
                  {error}
                </p>
              )}
              <footer className="matrix-image-actions matrix-image-footer">
                {canWrite && (
                  <button
                    type="button"
                    className="button"
                    disabled={busy}
                    onClick={() => void regenerate()}
                  >
                    다시 생성
                  </button>
                )}
                <button
                  type="button"
                  className="button primary"
                  disabled={busy}
                  onClick={() => void download()}
                >
                  {busy ? "다운로드 준비 중..." : "다운로드"}
                </button>
              </footer>
            </div>
          )
        )}
      </dialog>
    </>
  );
}
