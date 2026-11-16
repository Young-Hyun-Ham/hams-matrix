"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWorkspaceMutation } from "@/components/query/use-workspace-mutation";
import { useWorkspaceQueryPolicy } from "@/components/query/workspace-query-runtime";
import { matrixKeys } from "@/lib/query/keys";
import { requestJson } from "@/lib/query/browser-fetch";
import { resolveWorkspaceError } from "@/lib/query/error-messages";
type Data = {
  settings: { hitlEnabled: boolean; tokenLimit: number; version: number };
  budget: { knownTotal: number; unknownCalls: number; exceeded: boolean };
};
export function AiSettings() {
  const { scope, policy, settings } = useWorkspaceQueryPolicy(),
    client = useQueryClient();
  const key = [...matrixKeys.scope(scope), "ai", "settings"];
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) =>
      requestJson<Data>("/api/me/ai-settings", { signal }),
    ...policy,
  });
  const [draft, setDraft] = useState<Data["settings"] | null>(null);
  const value = draft ?? query.data?.settings;
  const command = useWorkspaceMutation({
    mutationFn: (v: NonNullable<typeof value>) =>
      requestJson<Data>("/api/me/ai-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hitlEnabled: v.hitlEnabled,
          tokenLimit: v.tokenLimit,
          expectedVersion: v.version,
        }),
      }),
    retry: false,
    onSuccess: (data) => {
      client.setQueryData(key, data);
      setDraft(null);
      void client.invalidateQueries({
        queryKey: [...matrixKeys.scope(scope), "team", "notification-count"],
      });
      void client.invalidateQueries({
        queryKey: [...matrixKeys.scope(scope), "ai", "notifications"],
      });
    },
  });
  if (!value)
    return (
      <p role="status">
        {query.error
          ? resolveWorkspaceError(query.error, settings.errorMessages)
          : "AI 설정을 불러오는 중입니다."}
        <button onClick={() => void query.refetch()}>다시 불러오기</button>
      </p>
    );
  return (
    <form
      className="panel settings-form"
      onSubmit={(e) => {
        e.preventDefault();
        void command.mutateAsync(value).catch(() => undefined);
      }}
    >
      <h2>AI 설정</h2>
      <label>
        <input
          type="checkbox"
          checked={value.hitlEnabled}
          onChange={(e) =>
            setDraft({ ...value, hitlEnabled: e.target.checked })
          }
        />
        Human in the Loop
      </label>
      <p>
        AI가 제안한 등록·수정·삭제 내용을 검토한 뒤 적용합니다. 이력 미저장
        대화에서는 조회와 초안 작성만 지원합니다.
      </p>
      <label>
        토큰 사용량 제한
        <input
          type="number"
          min={1}
          max={Number.MAX_SAFE_INTEGER}
          step={1}
          required
          value={Number.isNaN(value.tokenLimit) ? "" : value.tokenLimit}
          onChange={(e) =>
            setDraft({ ...value, tokenLimit: e.target.valueAsNumber })
          }
        />
      </label>
      <p>
        현재 워크스페이스의 내 누적 사용량을 기준으로 알립니다. 월별 초기화와
        추가 사용 차단은 하지 않으며 요금제 한도는 계속 적용됩니다.
      </p>
      <p>
        확인된 사용량: {query.data?.budget.knownTotal.toLocaleString()} 토큰
        {Boolean(query.data?.budget.unknownCalls) &&
          " · 사용량 미확인 호출 포함"}
      </p>
      {query.data?.budget.exceeded && (
        <p role="alert">설정한 토큰 사용량 제한을 초과했습니다.</p>
      )}
      <Link href="/settings?tab=usage">토큰 사용량 보기</Link>
      {command.error && (
        <p role="alert">
          {resolveWorkspaceError(command.error, settings.errorMessages)}
          <button
            type="button"
            onClick={() => {
              setDraft(null);
              void query.refetch();
            }}
          >
            최신 설정 불러오기
          </button>
        </p>
      )}
      <button
        className="button primary"
        disabled={
          command.isPending ||
          !Number.isSafeInteger(value.tokenLimit) ||
          value.tokenLimit < 1
        }
      >
        저장
      </button>
    </form>
  );
}
