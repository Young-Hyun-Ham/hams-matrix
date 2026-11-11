"use client";
/* eslint-disable @next/next/no-img-element -- Saved images use authenticated private routes. */
import { useEffect, useState, type ReactNode } from "react";
import type { Artifact } from "@/lib/artifact-types";
import type { GeneratedImageInfo } from "@/lib/generated-image-types";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWorkspaceQueryPolicy } from "@/components/query/workspace-query-runtime";
import { matrixKeys } from "@/lib/query/keys";
import { requestJson } from "@/lib/query/browser-fetch";
import { resolveWorkspaceError } from "@/lib/query/error-messages";
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
  const { scope, policy, settings } = useWorkspaceQueryPolicy();
  const client = useQueryClient();
  const endpoint = `/api/projects/${encodeURIComponent(artifact.projectId)}/artifacts/${encodeURIComponent(artifact.id)}/image`;
  const queryKey = matrixKeys.image(scope, endpoint, artifact.version);
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      requestJson<{ image: GeneratedImageInfo | null }>(
        `/api/projects/${encodeURIComponent(artifact.projectId)}/artifacts/${encodeURIComponent(artifact.id)}/image`,
        { signal },
      ),
    ...policy,
  });
  const result = {
    key,
    image: query.data?.image ?? null,
    error: resolveWorkspaceError(query.error, settings.errorMessages),
  };
  const [failedImage, setFailedImage] = useState("");
  useEffect(() => {
    if (query.data || query.isError)
      onAvailability(
        artifact.id,
        artifact.version,
        !query.isError && Boolean(query.data?.image),
      );
  }, [
    query.data,
    query.isError,
    artifact.id,
    artifact.version,
    onAvailability,
  ]);
  useEffect(() => {
    if (revision || attempt)
      void client.invalidateQueries({
        queryKey: [...matrixKeys.scope(scope), "image", endpoint],
      });
  }, [client, scope, endpoint, revision, attempt]);
  if (query.isLoading)
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
