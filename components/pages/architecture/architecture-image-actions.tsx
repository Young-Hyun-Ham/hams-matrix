"use client";
import type { Artifact } from "@/lib/artifact-types";
import { AiImageActions } from "@/components/shared/ai-image-actions";
import type { GeneratedImageInfo } from "@/lib/generated-image-types";
import type { ProjectData } from "@/lib/artifact-types";

export function ArchitectureImageActions({
  artifact,
  canWrite,
  onBusyChange,
  onGenerated,
  disabled,
  hasSavedImage,
}: {
  artifact: Artifact;
  canWrite: boolean;
  onBusyChange: (busy: boolean) => void;
  onGenerated?: (result: {
    image: GeneratedImageInfo;
    data?: ProjectData;
  }) => void;
  disabled?: boolean;
  hasSavedImage: boolean;
}) {
  return (
    <AiImageActions
      endpoint={`/api/projects/${encodeURIComponent(artifact.projectId)}/artifacts/${encodeURIComponent(artifact.id)}/image`}
      label="아키텍처"
      subject={`${artifact.code} · ${artifact.title}`}
      description="등록된 아키텍처 데이터와 구성요소·연결 관계를 바탕으로 AI가 계층형 구성도를 생성합니다."
      promptPlaceholder="예: 인프라 경계와 API 통신 흐름을 강조해 주세요"
      filename={`아키텍처구성도-${artifact.code}`}
      artifactVersion={artifact.version}
      canWrite={canWrite}
      onBusyChange={onBusyChange}
      onGenerated={onGenerated}
      disabled={disabled}
      explicitGeneration
      hasSavedImage={hasSavedImage}
    />
  );
}
