"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWorkspaceQueryPolicy } from "@/components/query/workspace-query-runtime";
import { ThemeToggle } from "@/components/theme-toggle";
import { IntentReferenceDialog } from "./intent-reference-dialog";
import { useConsoleGuard } from "@/components/shared/console-access";
import { requestJson } from "@/lib/query/browser-fetch";
import { matrixKeys } from "@/lib/query/keys";
import {
  intentNames,
  type IntentClassificationList,
  type IntentClassificationDetail,
} from "@/lib/ai/intent-classification-types";
import type { RagSummary } from "@/lib/ai/rag-types";
import "@/styles/pages/projects/intent-classifications/intent-classifications.css";

const day = (offset: number) =>
  new Date(Date.now() + 9 * 3600000 + offset * 86400000)
    .toISOString()
    .slice(0, 10);
const time = (value: string) =>
  new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(value));
const flag = (value: boolean | null) =>
  value === null ? "기록 없음" : value ? "필요" : "불필요";
type Filters = {
  from: string;
  to: string;
  intent: string;
  clarification: string;
  fallback: string;
};
type ReferenceSelection = { index: number; part: "source" | "chunk" };
export function IntentClassificationsPage({
  projectId,
  projectName,
  workspaceName,
  initial,
}: {
  projectId: string;
  projectName: string;
  workspaceName: string;
  initial: Record<string, string>;
}) {
  const { scope, policy } = useWorkspaceQueryPolicy();
  const defaults: Filters = {
    from: initial.from ?? day(-6),
    to: initial.to ?? day(0),
    intent: initial.intent ?? "",
    clarification: initial.clarification ?? "",
    fallback: initial.fallback ?? "",
  };
  const [filters, setFilters] = useState(defaults),
    [applied, setApplied] = useState(defaults);
  const [eventId, setEventId] = useState(initial.eventId ?? ""),
    [cursor, setCursor] = useState(initial.cursor ?? "");
  const [previous, setPrevious] = useState<string[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reference, setReference] = useState<ReferenceSelection | null>(
    initial.eventId && /^(0|[1-9]\d{0,5})$/.test(initial.reference ?? "")
      ? {
          index: Number(initial.reference),
          part: initial.referencePart === "chunk" ? "chunk" : "source",
        }
      : null,
  );
  const root =
    "/api/projects/" +
    encodeURIComponent(projectId) +
    "/intent-classifications";
  const params = new URLSearchParams({ ...applied, cursor });
  const list = useQuery({
    queryKey: [
      ...matrixKeys.intentClassifications(scope, projectId),
      "list",
      params.toString(),
    ],
    queryFn: ({ signal }) =>
      requestJson<IntentClassificationList>(root + "?" + params, { signal }),
    ...policy,
    refetchInterval: false,
  });
  const detail = useQuery({
    queryKey: [
      ...matrixKeys.intentClassifications(scope, projectId),
      "detail",
      eventId,
    ],
    queryFn: ({ signal }) =>
      requestJson<IntentClassificationDetail>(
        root + "/" + encodeURIComponent(eventId),
        { signal },
      ),
    ...policy,
    enabled: !!eventId,
    refetchInterval: false,
  });
  const rag = useQuery({
    queryKey: matrixKeys.projectRag(scope, projectId),
    queryFn: ({ signal }) =>
      requestJson<RagSummary>(
        "/api/projects/" + encodeURIComponent(projectId) + "/rag",
        { signal },
      ),
    ...policy,
    refetchInterval: false,
  });
  useConsoleGuard(list.error ?? detail.error ?? rag.error);
  function updateUrl(
    next: Filters,
    nextCursor: string,
    id: string,
    selectedReference: ReferenceSelection | null = null,
  ) {
    setReference(selectedReference);
    const url = new URL(window.location.href);
    url.search = new URLSearchParams({
      ...next,
      ...(nextCursor ? { cursor: nextCursor } : {}),
      ...(id ? { eventId: id } : {}),
      ...(selectedReference
        ? {
            reference: String(selectedReference.index),
            referencePart: selectedReference.part,
          }
        : {}),
    }).toString();
    window.history.replaceState(null, "", url);
  }
  const data = eventId && !detail.isError ? detail.data : undefined;
  function referenceLink(
    index: number,
    part: "source" | "chunk",
    label: string,
  ) {
    const selected = { index, part };
    const params = new URLSearchParams({
      ...applied,
      ...(cursor ? { cursor } : {}),
      eventId,
      reference: String(index),
      referencePart: part,
    });
    return (
      <a
        className="intent-reference-link"
        href={`?${params}`}
        onClick={(event) => {
          if (
            event.button !== 0 ||
            event.ctrlKey ||
            event.metaKey ||
            event.shiftKey ||
            event.altKey
          )
            return;
          event.preventDefault();
          updateUrl(applied, cursor, eventId, selected);
        }}
      >
        {label}
      </a>
    );
  }
  const metadata = data
    ? [
        ["이벤트 ID", data.eventId],
        ["분류기 버전", data.classifierVersion],
        ["주 의도", intentNames[data.primaryIntent] ?? data.primaryIntent],
        ["판정 사유", data.reasonCode || "기록 없음"],
        ["검색 대체 사유", data.fallbackCode ?? "없음"],
        ["검색본 ID", data.generationId ?? "없음"],
        ["RAG 검색", flag(data.flags.needsRag)],
        ["현재 조회", flag(data.flags.needsRealtime)],
        ["변경 실행", flag(data.flags.needsExecution)],
        ["확인 질문", flag(data.flags.needsClarification)],
      ]
    : [];
  return (
    <main className="intent-classifications">
      <aside className={`intent-console-nav${menuOpen ? " is-open" : ""}`}>
        <div className="intent-console-brand">
          Intent Console<span>CLASSIFICATION HISTORY</span>
        </div>
        <nav aria-label="의도분류 메뉴" id="intent-navigation">
          <a href="#intent-content" aria-current="page">
            분류 이력
          </a>
        </nav>
        <p className="intent-nav-scope">
          {workspaceName}
          <br />
          {projectName}
        </p>
      </aside>
      <div className="intent-console-workspace">
        <header className="intent-console-header">
          <button
            type="button"
            className="button intent-menu-toggle"
            aria-controls="intent-navigation"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(!menuOpen)}
          >
            메뉴
          </button>
          <div className="intent-header-title">
            <h1>의도분류 조회</h1>
            <span>{workspaceName}</span>
          </div>
          <div className="intent-header-actions">
            <button
              className="button"
              onClick={() => {
                void list.refetch();
                void rag.refetch();
                if (eventId) void detail.refetch();
              }}
            >
              새로고침
            </button>
            <ThemeToggle />
          </div>
        </header>
        <div id="intent-content" className="intent-console-content">
          <p className="intent-scope">
            워크스페이스: <strong>{workspaceName}</strong> · 조회 프로젝트:{" "}
            <strong>{projectName}</strong>
          </p>
          <p className="intent-help">
            질문 처리 계획을 조회합니다. 변경 실행 요청 분류는 실제 실행 완료를
            의미하지 않습니다.
          </p>
          {!rag.isError && rag.data && (
            <p className="intent-index-status">
              현재 검색본:{" "}
              {rag.data.activeGeneration
                ? rag.data.activeGeneration.model +
                  " · " +
                  time(rag.data.activeGeneration.publishedAt) +
                  " KST"
                : "벡터화 이력 없음"}
              {rag.data.stale && " · 자료 변경: 재벡터화 필요"}
            </p>
          )}
          <form
            className="intent-filters"
            onSubmit={(event) => {
              event.preventDefault();
              setApplied(filters);
              setCursor("");
              setPrevious([]);
              setEventId("");
              updateUrl(filters, "", "");
            }}
          >
            <label>
              시작일 (KST)
              <input
                type="date"
                value={filters.from}
                onChange={(e) =>
                  setFilters({ ...filters, from: e.target.value })
                }
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
            <label>
              주 의도
              <select
                value={filters.intent}
                onChange={(e) =>
                  setFilters({ ...filters, intent: e.target.value })
                }
              >
                <option value="">전체</option>
                {Object.entries(intentNames).map(([code, name]) => (
                  <option key={code} value={code}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              확인 질문
              <select
                value={filters.clarification}
                onChange={(e) =>
                  setFilters({ ...filters, clarification: e.target.value })
                }
              >
                <option value="">전체</option>
                <option value="true">필요</option>
                <option value="false">불필요</option>
              </select>
            </label>
            <label>
              검색 대체 처리
              <select
                value={filters.fallback}
                onChange={(e) =>
                  setFilters({ ...filters, fallback: e.target.value })
                }
              >
                <option value="">전체</option>
                <option value="true">있음</option>
                <option value="false">없음</option>
              </select>
            </label>
            <button className="button" type="submit">
              검색
            </button>
          </form>
          <div className="intent-columns">
            <section
              aria-label="분류 이력 목록"
              className="intent-card intent-list"
            >
              <h2>분류 이력</h2>
              {list.isPending && (
                <p role="status">분류 이력을 불러오고 있습니다.</p>
              )}
              {list.isError && (
                <p role="alert">
                  분류 이력을 조회하지 못했습니다. 검색 조건과 접근 권한을
                  확인해 주세요.
                </p>
              )}
              {!list.isError &&
                list.data &&
                (list.data.events.length ? (
                  <div className="intent-table">
                    <table>
                      <thead>
                        <tr>
                          <th>기록 시각 (KST)</th>
                          <th>주 의도</th>
                          <th>확인 질문</th>
                          <th>판정 사유</th>
                          <th>분류·검색 시간</th>
                          <th>참조 수</th>
                        </tr>
                      </thead>
                      <tbody>
                        {list.data.events.map((row) => (
                          <tr
                            key={row.eventId}
                            aria-selected={eventId === row.eventId}
                          >
                            <td>
                              <button
                                className="button"
                                onClick={() => {
                                  setEventId(row.eventId);
                                  updateUrl(applied, cursor, row.eventId);
                                }}
                              >
                                {time(row.createdAt)}
                              </button>
                            </td>
                            <td>
                              {intentNames[row.primaryIntent] ??
                                row.primaryIntent}
                            </td>
                            <td>{flag(row.flags.needsClarification)}</td>
                            <td>{row.reasonCode || "기록 없음"}</td>
                            <td>{row.durationMs.toLocaleString()} ms</td>
                            <td>{row.referenceCount}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p role="status">
                    분류 이력이 없습니다. 검색 기간과 조건을 확인해 주세요.
                  </p>
                ))}
              <div className="intent-actions">
                <button
                  className="button"
                  disabled={!previous.length}
                  onClick={() => {
                    const next = previous.at(-1) ?? "";
                    setCursor(next);
                    setPrevious(previous.slice(0, -1));
                    setEventId("");
                    updateUrl(applied, next, "");
                  }}
                >
                  이전
                </button>
                <button
                  className="button"
                  disabled={list.isError || !list.data?.nextCursor}
                  onClick={() => {
                    const next = list.data?.nextCursor ?? "";
                    setPrevious([...previous, cursor]);
                    setCursor(next);
                    setEventId("");
                    updateUrl(applied, next, "");
                  }}
                >
                  다음
                </button>
              </div>
            </section>
            <section
              aria-label="분류 이력 상세"
              className="intent-card intent-detail"
            >
              <h2>분류 상세</h2>
              {!eventId && <p>목록에서 기록 시각을 선택해 주세요.</p>}
              {eventId && detail.isPending && (
                <p role="status">상세를 불러오고 있습니다.</p>
              )}
              {eventId && detail.isError && (
                <p role="alert">
                  상세를 확인할 수 없습니다. 권한과 이력 ID를 확인해 주세요.
                </p>
              )}
              {data && (
                <>
                  <dl>
                    {metadata.map(([label, value]) => (
                      <div key={label}>
                        <dt>{label}</dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                  </dl>
                  <h3>검색 참조</h3>
                  <p>
                    기록 당시 식별자와 버전입니다. 현재 원본의 존재·변경 상태나
                    열람 권한을 보장하지 않습니다.
                  </p>
                  {data.references.length ? (
                    <ul>
                      {data.references.map((ref, i) => (
                        <li key={i}>
                          {ref.sourceType} ·{" "}
                          {ref.sourceId
                            ? referenceLink(i, "source", ref.sourceId)
                            : "기록 없음"}
                          <br />
                          버전: {ref.version || "기록 없음"}
                          <br />
                          청크:{" "}
                          {ref.chunkId
                            ? referenceLink(i, "chunk", ref.chunkId)
                            : "기록 없음"}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>검색 참조 없음</p>
                  )}
                </>
              )}
            </section>
          </div>
        </div>
      </div>
      {reference && data?.references[reference.index] && (
        <IntentReferenceDialog
          key={`${eventId}:${reference.index}:${reference.part}`}
          projectId={projectId}
          eventId={eventId}
          index={reference.index}
          part={reference.part}
          onClose={() => updateUrl(applied, cursor, eventId)}
        />
      )}
    </main>
  );
}
