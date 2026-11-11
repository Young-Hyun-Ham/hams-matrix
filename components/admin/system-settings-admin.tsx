"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWorkspaceMutation as useMutation } from "@/components/query/use-workspace-mutation";
import { useWorkspaceQueryPolicy } from "@/components/query/workspace-query-runtime";
import { matrixKeys } from "@/lib/query/keys";
import { requestJson } from "@/lib/query/browser-fetch";
import { resolveWorkspaceError } from "@/lib/query/error-messages";
import {
  defaultErrorMessages,
  defaultErrorDescriptions,
  defaultSettings,
  validateSettings,
} from "@/lib/system-settings/defaults";
import type {
  SettingsInput,
  SystemSettings,
} from "@/lib/system-settings/types";
export function SystemSettingsAdmin({
  workspaceName,
}: {
  workspaceName: string;
}) {
  const { scope, settings } = useWorkspaceQueryPolicy();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: [...matrixKeys.systemSettings(scope), "admin"],
    queryFn: ({ signal }) =>
      requestJson<SystemSettings>("/api/admin/settings/system", { signal }),
    staleTime: 0,
    retry: false,
  });
  const [draft, setDraft] = useState<SystemSettings | null>(null);
  const [message, setMessage] = useState("");
  const [newCode, setNewCode] = useState("");
  const value = draft ?? query.data;
  const mutation = useMutation({
    mutationFn: (input: SettingsInput) =>
      requestJson<SystemSettings>("/api/admin/settings/system", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }),
    retry: false,
    onSuccess: (data) => {
      client.setQueryData(matrixKeys.systemSettings(scope), data);
      client.setQueryData([...matrixKeys.systemSettings(scope), "admin"], data);
      setDraft(null);
      setMessage("저장했습니다.");
      if (typeof BroadcastChannel !== "undefined") {
        const channel = new BroadcastChannel(
          `matrix-system-settings:${scope.workspaceId}`,
        );
        channel.postMessage({ version: data.version });
        channel.close();
      }
    },
  });
  if (!value)
    return (
      <p role="status">
        시스템설정을 불러오는 중입니다.
        {query.error &&
          resolveWorkspaceError(query.error, settings.errorMessages)}
      </p>
    );
  const change = (patch: Partial<SystemSettings>) => {
    setDraft({ ...value, ...patch });
    setMessage("");
  };
  return (
    <form
      className="system-settings-form"
      onSubmit={(e) => {
        e.preventDefault();
        setMessage("");
        try {
          mutation.mutate(
            validateSettings({
              staleTimeMs: value.staleTimeMs,
              retryCount: value.retryCount,
              errorMessages: value.errorMessages,
              expectedVersion: value.version,
            }),
          );
        } catch (error) {
          setMessage(
            error instanceof Error ? error.message : "입력을 확인하세요.",
          );
        }
      }}
    >
      <h2>시스템설정</h2>
      <p>{workspaceName} 워크스페이스에 적용됩니다.</p>
      {value.source === "unavailable" && (
        <p role="alert">최신 설정을 확인할 수 없어 저장할 수 없습니다.</p>
      )}
      <label>
        조회 데이터 유지 시간(초)
        <input
          type="number"
          min="0"
          max="86400"
          step="1"
          required
          value={
            Number.isFinite(value.staleTimeMs) ? value.staleTimeMs / 1000 : ""
          }
          onChange={(e) =>
            change({
              staleTimeMs:
                e.target.value === "" ? NaN : Number(e.target.value) * 1000,
            })
          }
        />
      </label>
      <label>
        조회 실패 시 재시도 횟수
        <input
          type="number"
          min="0"
          max="10"
          step="1"
          required
          value={Number.isFinite(value.retryCount) ? value.retryCount : ""}
          onChange={(e) =>
            change({
              retryCount: e.target.value === "" ? NaN : Number(e.target.value),
            })
          }
        />
      </label>
      <p>
        재시도는 일시적인 조회 실패에만 적용됩니다. 저장·생성 요청은 자동
        재시도하지 않습니다.
      </p>
      <table>
        <thead>
          <tr>
            <th>코드</th>
            <th>설명</th>
            <th>메시지</th>
            <th>관리</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(value.errorMessages).map(([code, text]) => (
            <tr key={code}>
              <th scope="row">{code}</th>
              <td>{defaultErrorDescriptions[code] ?? `HTTP ${code}`}</td>
              <td>
                <input
                  aria-label={`${code} 오류 메시지`}
                  required
                  maxLength={500}
                  value={text}
                  onChange={(e) =>
                    change({
                      errorMessages: {
                        ...value.errorMessages,
                        [code]: e.target.value,
                      },
                    })
                  }
                />
              </td>
              <td>
                {!Object.hasOwn(defaultErrorMessages, code) && (
                  <button
                    type="button"
                    onClick={() =>
                      change({
                        errorMessages: Object.fromEntries(
                          Object.entries(value.errorMessages).filter(
                            ([k]) => k !== code,
                          ),
                        ),
                      })
                    }
                  >
                    삭제
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <label>
        추가 HTTP 오류 코드
        <input value={newCode} onChange={(e) => setNewCode(e.target.value)} />
      </label>
      <button
        type="button"
        onClick={() => {
          if (
            !/^[45]\d{2}$/.test(newCode) ||
            Object.hasOwn(value.errorMessages, newCode) ||
            Object.keys(value.errorMessages).length >= 64
          ) {
            setMessage(
              "중복되지 않은 400~599 코드를 입력하세요. 최대 64개입니다.",
            );
            return;
          }
          change({
            errorMessages: {
              ...value.errorMessages,
              [newCode]: defaultErrorMessages.UNKNOWN_ERROR,
            },
          });
          setNewCode("");
        }}
      >
        코드 추가
      </button>
      <div className="system-settings-actions">
        <button
          type="button"
          onClick={() =>
            change({
              ...defaultSettings(scope.workspaceId),
              version: value.version,
              source: value.source,
            })
          }
        >
          기본값 불러오기
        </button>
        <button
          type="button"
          onClick={async () => {
            const result = await query.refetch();
            if (result.data?.source !== "unavailable") {
              setDraft(null);
              setMessage("최신 설정을 불러왔습니다.");
            }
          }}
        >
          최신 설정 다시 불러오기
        </button>
        <button
          type="submit"
          disabled={
            mutation.isPending ||
            query.isFetching ||
            value.version === null ||
            query.isError
          }
        >
          저장
        </button>
      </div>
      {(message || mutation.error) && (
        <p role="status">
          {message ||
            resolveWorkspaceError(mutation.error, settings.errorMessages)}
          {mutation.error && " 최신 설정을 다시 불러와 비교해 주세요."}
        </p>
      )}
    </form>
  );
}
