"use client";
/* eslint-disable @next/next/no-img-element -- Saved images use authenticated private routes. */
import { useEffect, useState, type ReactNode } from "react";
import type { Artifact } from "@/lib/artifact-types";
import type { GeneratedImageInfo } from "@/lib/generated-image-types";

export function ArchitectureImageSurface({
  artifact,
  revision,
  children,
  onAvailability,
}: {
  artifact: Artifact;
  revision: number;
  children: ReactNode;
  onAvailability: (
    artifactId: string,
    version: number,
    available: boolean,
  ) => void;
}) {
  const [attempt, setAttempt] = useState(0);
  const key = `${artifact.projectId}:${artifact.id}:${artifact.version}:${revision}:${attempt}`;
  const [result, setResult] = useState<{
    key: string;
    image: GeneratedImageInfo | null;
    error: string;
  } | null>(null);
  const [failedImage, setFailedImage] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void fetch(
      `/api/projects/${encodeURIComponent(artifact.projectId)}/artifacts/${encodeURIComponent(artifact.id)}/image`,
      { cache: "no-store", signal: controller.signal },
    )
      .then(async (response) => {
        if (!response.ok)
          throw new Error("저장된 이미지를 확인하지 못했습니다.");
        return response.json();
      })
      .then((value) => {
        if (!controller.signal.aborted) {
          setResult({ key, image: value.image, error: "" });
          onAvailability(artifact.id, artifact.version, !!value.image);
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setResult({
            key,
            image: null,
            error: error instanceof Error ? error.message : "이미지 조회 실패",
          });
          onAvailability(artifact.id, artifact.version, false);
        }
      });
    return () => controller.abort();
  }, [artifact.projectId, artifact.id, artifact.version, key, onAvailability]);
  if (result?.key !== key)
    return <p role="status">저장된 구성도 이미지를 확인하는 중입니다.</p>;
  if (result.error || failedImage === key)
    return (
      <p role="alert">
        {result.error || "구성도 이미지를 불러오지 못했습니다."}{" "}
        <button
          type="button"
          className="button"
          onClick={() => setAttempt((value) => value + 1)}
        >
          다시 조회
        </button>
      </p>
    );
  if (!result.image) return <>{children}</>;
  return (
    <div className="matrix-architecture-saved-image">
      {result.image.artifactVersion !== artifact.version && (
        <p className="matrix-architecture-hint">
          이전 아키텍처 버전으로 생성된 이미지입니다. 최신 구성을 반영하려면
          다시 생성해 주세요.
        </p>
      )}
      <img
        key={key}
        src={result.image.url}
        alt={`${artifact.title} AI 생성 아키텍처 구성도`}
        onError={() => setFailedImage(key)}
      />
    </div>
  );
}
