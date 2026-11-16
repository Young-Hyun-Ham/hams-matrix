"use client";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWorkspaceQueryPolicy } from "@/components/query/workspace-query-runtime";
import { matrixKeys } from "@/lib/query/keys";
import { requestJson } from "@/lib/query/browser-fetch";
import { resolveWorkspaceError } from "@/lib/query/error-messages";
import type { RagSummary } from "@/lib/ai/rag-types";
import "@/styles/ai-project-rag.css";
const active = (status?: string) =>
  !!status &&
  ["queued", "running", "publishing", "stop_requested"].includes(status);
const statusLabel: Record<string, string> = {
  queued: "대기 중",
  running: "벡터화 중",
  publishing: "검색본 발행 중",
  stop_requested: "중지 요청 중",
  completed: "완료",
  failed: "실패",
  cancelled: "취소됨",
};
export function ProjectRagControl(props: {
  projectId: string;
  projectName: string;
  initial?: RagSummary;
}) {
  const { scope } = useWorkspaceQueryPolicy();
  return (
    <RagControl
      key={`${scope.userId}:${scope.workspaceId}:${props.projectId}`}
      {...props}
    />
  );
}
function RagControl({
  projectId,
  projectName,
  initial,
}: {
  projectId: string;
  projectName: string;
  initial?: RagSummary;
}) {
  const { scope, policy, settings } = useWorkspaceQueryPolicy(),
    client = useQueryClient();
  const [open, setOpen] = useState(false);
  const query = useQuery({
    queryKey: matrixKeys.projectRag(scope, projectId),
    queryFn: ({ signal }) =>
      requestJson<RagSummary>(
        `/api/projects/${encodeURIComponent(projectId)}/rag`,
        { signal },
      ),
    ...policy,
    enabled:
      !!projectId && (!initial || open || active(initial.latestJob?.status)),
    initialData: initial,
    refetchInterval: (q) =>
      active(q.state.data?.latestJob?.status) ? 2500 : false,
  });
  const summary = query.data ?? initial,
    job = summary?.latestJob;
  const previous = useRef(job?.status);
  useEffect(() => {
    if (
      previous.current &&
      active(previous.current) &&
      job?.status &&
      !active(job.status)
    )
      void client.invalidateQueries({ queryKey: matrixKeys.dashboards(scope) });
    previous.current = job?.status;
  }, [job?.status, client, scope]);
  const complete = summary?.activeGeneration;
  const formatted = complete
    ? new Intl.DateTimeFormat("sv-SE", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      }).format(new Date(complete.publishedAt))
    : "";
  return (
    <div className="project-rag-control">
      <button
        type="button"
        disabled={!projectId}
        onClick={() => {
          setOpen(true);
          void query.refetch();
        }}
      >
        의도분류
      </button>
      <span className="project-rag-summary" role="status">
        {complete
          ? `${complete.model} · ${formatted} (KST)`
          : "벡터화 이력 없음"}
        {!!complete?.coverage.unsupported &&
          ` · 제외 ${complete.coverage.unsupported}건`}
        {summary?.stale && " · 자료 변경: 재벡터화 필요"}
        {job &&
          job.status !== "completed" &&
          ` · ${statusLabel[job.status] ?? job.status}${active(job.status) ? ` ${job.processedSources}/${job.totalSources}` : ""}`}
      </span>
      {open && (
        <RagDialog
          projectId={projectId}
          projectName={projectName}
          summary={summary}
          error={
            query.error
              ? resolveWorkspaceError(query.error, settings.errorMessages)
              : ""
          }
          close={() => setOpen(false)}
          saved={() => {
            void query.refetch();
            void client.invalidateQueries({
              queryKey: matrixKeys.dashboards(scope),
            });
          }}
        />
      )}
    </div>
  );
}
function RagDialog({
  projectId,
  projectName,
  summary,
  error,
  close,
  saved,
}: {
  projectId: string;
  projectName: string;
  summary?: RagSummary;
  error: string;
  close: () => void;
  saved: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    alive = useRef(true),
    controller = useRef<AbortController | null>(null);
  const { settings } = useWorkspaceQueryPolicy();
  const [apiKey, setApiKey] = useState(""),
    [models, setModels] = useState<string[]>([]),
    [model, setModel] = useState("");
  const [pending, setPending] = useState(false),
    [message, setMessage] = useState(""),
    [errors, setErrors] = useState<{ title: string; code: string }[]>([]);
  const idempotency = useRef("");
  const [restartMode, setRestartMode] = useState<"new" | "resume">("resume");
  const failed = summary?.latestJob?.status === "failed";
  const resume = failed && restartMode === "resume";
  useEffect(() => {
    alive.current = true;
    idempotency.current = crypto.randomUUID();
    dialog.current?.showModal();
    return () => {
      alive.current = false;
      controller.current?.abort();
    };
  }, []);
  async function call(action: "models" | "start" | "stop" | "details") {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setPending(true);
    setMessage("");
    try {
      const base = `/api/projects/${encodeURIComponent(projectId)}/rag`;
      const post = (body: unknown) => ({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: abort.signal,
      });
      if (action === "models") {
        const result = await requestJson<{ models: string[] }>(
          `${base}/models`,
          post(apiKey ? { apiKey } : {}),
        );
        if (!alive.current || abort.signal.aborted) return;
        setModels(result.models);
        setModel(
          result.models.includes(model) ? model : (result.models[0] ?? ""),
        );
      } else if (action === "start") {
        await requestJson(
          resume
            ? `${base}/jobs/${encodeURIComponent(summary!.latestJob!.id)}/resume`
            : `${base}/jobs`,
          post({
            ...(!resume ? { model } : {}),
            ...(apiKey ? { apiKey } : {}),
            expectedConfigVersion: summary?.configVersion ?? 0,
            idempotencyKey: idempotency.current,
          }),
        );
        if (!alive.current || abort.signal.aborted) return;
        setApiKey("");
        idempotency.current = crypto.randomUUID();
        setMessage(
          resume
            ? "저장된 청크를 유지하고 벡터화를 이어서 시작했습니다."
            : "새 벡터화 작업을 시작했습니다.",
        );
        saved();
      } else if (action === "stop") {
        await requestJson(
          `${base}/jobs/${encodeURIComponent(summary!.latestJob!.id)}/stop`,
          post({}),
        );
        if (alive.current && !abort.signal.aborted) {
          setMessage("중지를 요청했습니다.");
          saved();
        }
      } else {
        const result = await requestJson<{
          job: { errors: { title: string; code: string }[] };
        }>(`${base}/jobs/${encodeURIComponent(summary!.latestJob!.id)}`, {
          signal: abort.signal,
        });
        if (alive.current && !abort.signal.aborted)
          setErrors(result.job.errors);
      }
    } catch (failure) {
      if (alive.current && !abort.signal.aborted)
        setMessage(resolveWorkspaceError(failure, settings.errorMessages));
    } finally {
      if (alive.current && !abort.signal.aborted) setPending(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="workspace-dialog project-rag-dialog"
      aria-labelledby="rag-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <header>
        <h2 id="rag-dialog-title">
          의도분류 · {projectName || "선택 프로젝트"}
        </h2>
        <button type="button" onClick={close} aria-label="닫기">
          닫기
        </button>
      </header>
      <p>
        프로젝트 데이터를 벡터화하여 AI 답변 근거로 사용합니다. 현재
        제안요청서·산출물·연결·문서함·화면설계·DB 도메인과 연결된 출처를
        검사합니다.
      </p>
      <p>
        과거 전체 이력·개인 채팅은 제외합니다. PDF·DOCX·UTF-8 TXT/MD를 지원하며,
        스캔 PDF·추출 한도 초과·손상 파일은 원인과 함께 표시합니다.
      </p>
      <p>
        입력한 OpenAI API 키는 암호화 저장되며 프로젝트 참여자의 벡터화·질문
        검색에 사용됩니다. API 비용은 해당 키 계정에 발생합니다.
      </p>
      {summary && !summary.canManage && (
        <p>프로젝트 owner/admin만 키와 벡터화를 관리할 수 있습니다.</p>
      )}
      {failed && (
        <fieldset disabled={pending || !summary?.canManage}>
          <legend>실패 후 재시작 방식</legend>
          <label>
            <input
              type="radio"
              name="rag-restart-mode"
              value="resume"
              checked={restartMode === "resume"}
              onChange={() => {
                setRestartMode("resume");
                idempotency.current = crypto.randomUUID();
              }}
            />
            실패 지점부터 이어서 시작
          </label>
          <label>
            <input
              type="radio"
              name="rag-restart-mode"
              value="new"
              checked={restartMode === "new"}
              onChange={() => {
                setRestartMode("new");
                idempotency.current = crypto.randomUUID();
              }}
            />
            새로 시작
          </label>
          <p>
            {resume
              ? `기존 모델 ${summary.latestJob!.model}과 저장된 청크 ${summary.latestJob!.completedChunks}개를 유지합니다. 모델·원본이 변경되었다면 새로 시작을 선택해 주세요. 저장 전 실패한 요청은 다시 호출될 수 있습니다.`
              : "새 검색본을 생성합니다. 실패 작업의 중간 결과를 이어서 사용하지 않습니다. 모델을 조회하고 선택해 주세요."}
          </p>
        </fieldset>
      )}
      <label>
        OpenAI API 키
        <input
          type="password"
          autoComplete="off"
          value={apiKey}
          disabled={pending || !summary?.canManage}
          placeholder={
            summary?.hasCredential ? "비워 두면 기존 키 사용" : "API 키 입력"
          }
          onChange={(e) => {
            controller.current?.abort();
            setApiKey(e.target.value);
            setModels([]);
            setModel("");
            setPending(false);
            idempotency.current = crypto.randomUUID();
          }}
        />
      </label>
      <button
        type="button"
        disabled={
          pending ||
          resume ||
          !summary?.canManage ||
          (!apiKey && !summary?.hasCredential)
        }
        onClick={() => void call("models")}
      >
        임베딩 모델 조회
      </button>
      <label>
        임베딩 모델
        <select
          value={resume ? summary.latestJob!.model : model}
          disabled={pending || resume || !models.length}
          onChange={(e) => {
            setModel(e.target.value);
            idempotency.current = crypto.randomUUID();
          }}
        >
          {resume ? (
            <option value={summary.latestJob!.model}>
              {summary.latestJob!.model}
            </option>
          ) : (
            <option value="">모델 선택</option>
          )}
          {!resume &&
            models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
        </select>
      </label>
      <button
        type="button"
        disabled={
          pending ||
          !summary?.canManage ||
          (!resume && !model) ||
          active(summary?.latestJob?.status)
        }
        onClick={() => void call("start")}
      >
        {pending
          ? "처리 중…"
          : resume
            ? "실패 지점부터 이어서 시작"
            : failed
              ? "새로 벡터화 시작"
              : "전체 자료 벡터화 시작"}
      </button>
      {summary?.latestJob && (
        <div role="status">
          <p>
            {statusLabel[summary.latestJob.status]} · 원본{" "}
            {summary.latestJob.processedSources}/
            {summary.latestJob.totalSources} · 청크{" "}
            {summary.latestJob.completedChunks}/{summary.latestJob.totalChunks}{" "}
            · 제외 {summary.latestJob.skippedSources}건 · 실패{" "}
            {summary.latestJob.failedSources}건
          </p>
          {active(summary.latestJob.status) && summary.canManage && (
            <button
              type="button"
              disabled={pending}
              onClick={() => void call("stop")}
            >
              중지 요청
            </button>
          )}
          <button
            type="button"
            disabled={pending}
            onClick={() => void call("details")}
          >
            제외·실패 원본 확인
          </button>
        </div>
      )}
      {(error || message) && <p role="alert">{message || error}</p>}
      {!!errors.length && (
        <ul>
          {errors.map((item, i) => (
            <li key={i}>
              {item.title} · {item.code}
            </li>
          ))}
        </ul>
      )}
      <p>창을 닫아도 시작한 작업은 계속 진행됩니다.</p>
    </dialog>
  );
}
