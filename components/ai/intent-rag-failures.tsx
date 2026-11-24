"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWorkspaceQueryPolicy } from "@/components/query/workspace-query-runtime";
import { useConsoleGuard } from "@/components/shared/console-access";
import { requestJson } from "@/lib/query/browser-fetch";
import { matrixKeys } from "@/lib/query/keys";
import type { RagFailureList } from "@/lib/ai/intent-classification-types";

const time = (value: string) =>
  new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(value));

export function IntentRagFailures({
  projectId,
  initial,
}: {
  projectId: string;
  initial: Record<string, string>;
}) {
  const { scope, policy } = useWorkspaceQueryPolicy();
  const defaults = { from: initial.from ?? "", to: initial.to ?? "" };
  const [filters, setFilters] = useState(defaults);
  const [applied, setApplied] = useState(defaults);
  const [cursor, setCursor] = useState(initial.cursor ?? "");
  const [previous, setPrevious] = useState<string[]>([]);
  const params = new URLSearchParams({ ...applied, cursor });
  const list = useQuery({
    queryKey: [
      ...matrixKeys.intentClassifications(scope, projectId),
      "failures",
      params.toString(),
    ],
    queryFn: ({ signal }) =>
      requestJson<RagFailureList>(
        `/api/projects/${encodeURIComponent(projectId)}/intent-classifications/failures?${params}`,
        { signal },
      ),
    ...policy,
    refetchInterval: false,
  });
  useConsoleGuard(list.error);
  function update(next: typeof defaults, nextCursor: string) {
    setCursor(nextCursor);
    const url = new URL(window.location.href);
    url.search = new URLSearchParams({
      view: "failures",
      ...next,
      ...(nextCursor ? { cursor: nextCursor } : {}),
    }).toString();
    window.history.replaceState(null, "", url);
  }
  return (
    <>
      <p className="intent-help">
        벡터화 생성에 실패한 작업만 표시합니다. 이어서 생성에 성공해도 이전 실패
        이력은 유지됩니다. 버전은 작업 시작 당시 설정 버전입니다.
      </p>
      <form
        className="intent-filters"
        onSubmit={(event) => {
          event.preventDefault();
          setApplied(filters);
          setPrevious([]);
          update(filters, "");
        }}
      >
        <label>
          시작일 (KST)
          <input
            type="date"
            value={filters.from}
            onChange={(e) => setFilters({ ...filters, from: e.target.value })}
          />
        </label>
        <label>
          종료일 (KST)
          <input
            type="date"
            value={filters.to}
            onChange={(e) => setFilters({ ...filters, to: e.target.value })}
          />
        </label>
        <button className="button" type="submit">
          검색
        </button>
        <button
          className="button"
          type="button"
          onClick={() => void list.refetch()}
        >
          새로고침
        </button>
      </form>
      <section className="intent-card" aria-label="벡터화 실패 이력">
        <h2>실패 이력</h2>
        {list.isPending && <p role="status">실패 이력을 불러오고 있습니다.</p>}
        {list.isError && (
          <p role="alert">
            실패 이력을 조회하지 못했습니다. 검색 조건과 접근 권한을 확인해
            주세요.
          </p>
        )}
        {!list.isError &&
          list.data &&
          (list.data.failures.length ? (
            <div className="intent-table">
              <table>
                <thead>
                  <tr>
                    <th>생성 시각 (KST)</th>
                    <th>실패 시각 (KST)</th>
                    <th>생성 설정 버전</th>
                    <th>모델</th>
                    <th>오류 코드</th>
                    <th>처리 현황</th>
                    <th>검색본 / 작업 ID</th>
                  </tr>
                </thead>
                <tbody>
                  {list.data.failures.map((row) => (
                    <tr key={row.jobId}>
                      <td>{time(row.createdAt)}</td>
                      <td>
                        {row.finishedAt ? time(row.finishedAt) : "기록 없음"}
                      </td>
                      <td>v{row.configVersion}</td>
                      <td>{row.model}</td>
                      <td>{row.errorCode ?? "기록 없음"}</td>
                      <td>
                        자료 {row.processedSources}/{row.totalSources}
                        <br />
                        청크 {row.completedChunks}/{row.totalChunks}
                      </td>
                      <td>
                        {row.generationId}
                        <br />
                        {row.jobId}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p role="status">실패한 벡터화 생성 이력이 없습니다.</p>
          ))}
        <div className="intent-actions">
          <button
            className="button"
            disabled={!previous.length}
            onClick={() => {
              const next = previous.at(-1) ?? "";
              setPrevious(previous.slice(0, -1));
              update(applied, next);
            }}
          >
            이전
          </button>
          <button
            className="button"
            disabled={list.isError || !list.data?.nextCursor}
            onClick={() => {
              setPrevious([...previous, cursor]);
              update(applied, list.data?.nextCursor ?? "");
            }}
          >
            다음
          </button>
        </div>
      </section>
    </>
  );
}
