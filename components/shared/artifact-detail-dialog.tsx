"use client";
import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWorkspaceQueryPolicy } from "@/components/query/workspace-query-runtime";
import { requestJson } from "@/lib/query/browser-fetch";
import { matrixKeys } from "@/lib/query/keys";
import { definitions, type Artifact } from "@/lib/artifact-types";
import { useProjectPage } from "./project-page-context";
import type { useDocumentNavigation } from "./use-document-navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
type Detail = {
  document?: {
    version: number;
    draft: { title?: string; [key: string]: unknown };
  } | null;
  artifact?: Artifact;
  incoming?: Artifact[];
  snapshot?: {
    name: string;
    content: string;
    version: number | null;
    changed?: boolean;
    available?: boolean;
    sourceId: string;
    type: string;
  };
};
export function ArtifactDetailDialog({
  navigation: n,
  hidden,
}: {
  navigation: ReturnType<typeof useDocumentNavigation>;
  hidden: boolean;
}) {
  const { data, artifacts, can, openEdit } = useProjectPage();
  const { scope, policy } = useWorkspaceQueryPolicy();
  const ref = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const target = n.target;
  const query = useQuery({
    queryKey: [
      ...matrixKeys.artifacts(scope, data.project.id),
      "detail",
      target?.type,
      target?.id,
    ],
    queryFn: ({ signal }) =>
      requestJson<Detail>(
        "/api/projects/" +
          data.project.id +
          "/" +
          (target?.type === "rfp"
            ? "rfp"
            : (target?.type === "artifact" ? "artifacts" : "source-snapshots") +
              "/" +
              target?.id),
        { signal },
      ),
    ...policy,
    staleTime: 0,
    enabled: !!target && !hidden,
  });
  useEffect(() => {
    const d = ref.current;
    if (target && !hidden) {
      d?.showModal();
      heading.current?.focus();
    } else d?.close();
    return () => {
      d?.close();
    };
  }, [target, hidden]);
  if (!target) return null;
  const a = query.error || query.isFetching ? undefined : query.data?.artifact,
    s = query.error || query.isFetching ? undefined : query.data?.snapshot;
  const currentRfp =
    query.error || query.isFetching ? undefined : query.data?.document;
  const button = (item: Artifact) => (
    <button
      type="button"
      className="text-button"
      key={item.id}
      onClick={() => n.visit({ type: "artifact", id: item.id })}
    >
      {item.code} · {item.title}
    </button>
  );
  return (
    <dialog
      ref={ref}
      className="matrix-dialog workspace-dialog admin-detail-dialog project-registration-dialog"
      onCancel={(e) => {
        e.preventDefault();
        n.close();
      }}
    >
      <div className="dialog-header admin-detail-header artifact-detail-header">
        <button
          className="button"
          aria-label="이전 문서"
          title="이전 문서"
          disabled={!n.canBack}
          onClick={n.back}
        >
          <ArrowLeft size={16} />
        </button>
        <button
          className="button"
          aria-label="다음 문서"
          title="다음 문서"
          disabled={!n.canForward}
          onClick={n.forward}
        >
          <ArrowRight size={16} />
        </button>
        <h2 ref={heading} tabIndex={-1}>
          {a
            ? a.code + " · " + a.title
            : (s?.name ?? currentRfp?.draft.title ?? "문서 상세")}
        </h2>
        <div className="artifact-detail-actions">
          {a && can(a.kind, "UPDATE") && (
            <button className="button" onClick={() => openEdit(a)}>
              수정
            </button>
          )}
          <button className="button admin-detail-close" onClick={n.close}>
            닫기
          </button>
        </div>
      </div>
      <div
        className="admin-detail-body project-registration-body"
        aria-live="polite"
      >
        {query.isFetching && <p role="status">불러오는 중…</p>}
        {query.error instanceof Error && (
          <p role="alert">{query.error.message}</p>
        )}
        {a && (
          <>
            <p>
              {definitions[a.kind].document} ·{" "}
              {a.detailLevel === "skeleton" ? "초기 초안" : "상세 설계"} ·{" "}
              {a.status} · v{a.version}
            </p>
            <dl>
              {definitions[a.kind].fields.map((f) => (
                <div key={f.key}>
                  <dt>{f.label}</dt>
                  <dd style={{ whiteSpace: "pre-wrap" }}>
                    {a.fields[f.key] || "미작성"}
                  </dd>
                </div>
              ))}
            </dl>
            {a.structure && Object.keys(a.structure).length > 0 && (
              <details>
                <summary>구조화 상세</summary>
                <pre style={{ whiteSpace: "pre-wrap" }}>
                  {JSON.stringify(a.structure, null, 2)}
                </pre>
              </details>
            )}
            <h3>출처·근거</h3>
            {!a.sources?.length && <p>출처 연결 필요</p>}
            {a.sources?.map((r, i) => (
              <div key={i}>
                <button
                  className="text-button"
                  onClick={() =>
                    n.visit({ type: "snapshot", id: r.snapshotId })
                  }
                >
                  {r.locator || "근거 원문"}
                </button>
                <p>
                  {r.origin} · {r.rationale}
                </p>
                <blockquote>{r.excerpt}</blockquote>
              </div>
            ))}
            <h3>기준 문서</h3>
            {a.links
              .map((id) => artifacts.find((x) => x.id === id))
              .filter((x): x is Artifact => !!x)
              .map(button)}
            <h3>이 문서를 사용하는 문서</h3>
            {query.data?.incoming?.map(button)}
            {a.kind === "screen" && (
              <a
                className="button"
                target="_blank"
                rel="noopener noreferrer"
                href={
                  "/planning-board?projectId=" +
                  data.project.id +
                  "&screenId=" +
                  a.id
                }
              >
                플래닝보드 실행
              </a>
            )}
          </>
        )}
        {currentRfp && (
          <>
            <h3>현재 제안요청서 v{currentRfp.version}</h3>
            <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
              {JSON.stringify(currentRfp.draft, null, 2)}
            </pre>
          </>
        )}
        {target.type === "rfp" && query.data?.document === null && (
          <p>현재 저장된 제안요청서가 없습니다.</p>
        )}
        {s && (
          <>
            {s.changed && (
              <p role="status">생성 당시 근거와 현재 원본이 다릅니다.</p>
            )}
            <p>생성 당시 고정 원문 {s.version ? "v" + s.version : ""}</p>
            <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
              {s.content}
            </pre>
            {s.type === "rfp" && (
              <button
                className="button"
                onClick={() => n.visit({ type: "rfp", id: s.sourceId })}
              >
                현재 RFP 보기
              </button>
            )}
            {s.type === "file" && s.available !== false && (
              <a
                className="button"
                href={
                  "/api/projects/" +
                  data.project.id +
                  "/documents/files/" +
                  s.sourceId
                }
              >
                현재 파일 다운로드
              </a>
            )}
          </>
        )}
      </div>
    </dialog>
  );
}
