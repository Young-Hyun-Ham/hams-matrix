"use client";
import { useRef, useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWorkspaceMutation } from "@/components/query/use-workspace-mutation";
import { useAiModels } from "@/components/query/use-ai-models";
import { useWorkspaceQueryPolicy } from "@/components/query/workspace-query-runtime";
import { RequestError } from "@/lib/query/error-messages";
import { requestJson } from "@/lib/query/browser-fetch";
import { matrixKeys } from "@/lib/query/keys";
import { definitions, type ArtifactKind } from "@/lib/artifact-types";
import { useProjectPage } from "./project-page-context";
import { DocumentFilePicker } from "./document-file-picker";
const kinds: ArtifactKind[] = [
  "wbs",
  "requirement",
  "screen",
  "function",
  "database",
  "program",
];
const statusLabels: Record<string, string> = {
  running: "생성 중",
  validating: "전체 검증 대기",
  finalizing: "저장 중",
  completed: "초안 저장 완료",
  review_required: "중복 후보 검토 필요",
  stop_requested: "중지 요청 중",
  cancelled: "중지됨",
  failed: "생성 실패",
};
type State = {
  requestId: string;
  status: string;
  stage: number;
  busy: boolean;
  error: string | null;
  result: { id: string; code: string; title: string; reused: boolean }[] | null;
  coverage: { kind: ArtifactKind; reason: string }[];
  rfpResult?: {
    id: string;
    version: number;
    snapshotId: string;
    title: string;
  } | null;
  evidenceWarnings?: { clientRef: string; message: string }[];
  duplicates: {
    clientRef: string;
    title: string;
    candidates: { id: string; code: string; title: string }[];
  }[];
};
export function DeliverableGenerationDialog() {
  const { data, can, selectTab } = useProjectPage(),
    { scope, policy } = useWorkspaceQueryPolicy(),
    client = useQueryClient();
  const base = "/api/projects/" + data.project.id + "/deliverable-generations";
  const storage =
    "matrix-deliverables:" +
    scope.userId +
    ":" +
    scope.workspaceId +
    ":" +
    data.project.id;
  const [open, setOpen] = useState(false),
    [rfp, setRfp] = useState(false),
    [includeRfp, setIncludeRfp] = useState(true),
    [files, setFiles] = useState<{ id: string; name: string }[]>([]),
    [targets, setTargets] = useState(kinds),
    [model, setModel] = useState(""),
    [prompt, setPrompt] = useState(""),
    [state, setState] = useState<State | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [choices, setChoices] = useState<Record<string, string>>({});
  const dialog = useRef<HTMLDialogElement>(null),
    active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);
  const models = useAiModels(open),
    config = useQuery({
      queryKey: [
        ...matrixKeys.artifacts(scope, data.project.id),
        "generation-policy",
      ],
      queryFn: ({ signal }) =>
        requestJson<{
          maxChanges: number;
          rfpAvailable: boolean;
          latest: State | null;
        }>(base, { signal }),
      ...policy,
      staleTime: 0,
      enabled: open,
    });
  const jobId = state?.requestId ?? config.data?.latest?.requestId;
  const progress = useQuery({
    queryKey: [
      ...matrixKeys.artifacts(scope, data.project.id),
      "generation-status",
      jobId,
    ],
    queryFn: ({ signal }) => requestJson<State>(base + "/" + jobId, { signal }),
    ...policy,
    staleTime: 0,
    enabled: open && !!jobId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status &&
        !["completed", "failed", "cancelled", "review_required"].includes(
          status,
        )
        ? 3000
        : false;
    },
  });
  const displayed = progress.data ?? state ?? config.data?.latest;
  const jobRunning =
    !!displayed &&
    !["completed", "failed", "cancelled"].includes(displayed.status);
  const completedId = useRef<string | null>(null);
  useEffect(() => {
    if (
      displayed?.status !== "completed" ||
      completedId.current === displayed.requestId
    )
      return;
    completedId.current = displayed.requestId;
    void Promise.all([
      client.invalidateQueries({
        queryKey: matrixKeys.artifacts(scope, data.project.id),
      }),
      client.invalidateQueries({
        queryKey: [
          ...matrixKeys.scope(scope),
          "project",
          data.project.id,
          "rfp",
        ],
      }),
      client.invalidateQueries({ queryKey: matrixKeys.projects(scope) }),
      client.invalidateQueries({ queryKey: matrixKeys.dashboards(scope) }),
    ]);
  }, [displayed?.status, displayed?.requestId, client, scope, data.project.id]);
  function updateState(next: State) {
    client.setQueryData(
      [
        ...matrixKeys.artifacts(scope, data.project.id),
        "generation-status",
        next.requestId,
      ],
      next,
    );
    setState(next);
  }
  const command = useWorkspaceMutation({
    mutationFn: ({ url, body }: { url: string; body?: object }) =>
      requestJson<State>(
        url,
        body
          ? {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            }
          : undefined,
      ),
    retry: false,
  });
  async function run(resume = false) {
    setBusy(true);
    setError("");
    let startingId: string | undefined;
    try {
      let id = displayed?.requestId;
      if (resume && !id) id = sessionStorage.getItem(storage) ?? undefined;
      let next: State;
      const resolutions = resume ? choices : {};
      if (resume) {
        if (!id) throw Error("이어갈 생성 요청이 없습니다.");
        next = await command.mutateAsync({ url: base + "/" + id });
      } else {
        const previousId = sessionStorage.getItem(storage);
        if (previousId) {
          try {
            const previous = await command.mutateAsync({
              url: base + "/" + previousId,
            });
            if (
              [
                "running",
                "validating",
                "review_required",
                "stop_requested",
                "finalizing",
              ].includes(previous.status)
            ) {
              updateState(previous);
              setError("진행 중인 이전 요청을 먼저 이어가거나 중지해 주세요.");
              return;
            }
          } catch (e) {
            if (!(e instanceof RequestError) || e.status !== 404) throw e;
            if (sessionStorage.getItem(storage) === previousId)
              sessionStorage.removeItem(storage);
          }
        }
        setChoices({});
        setState(null);
        id = crypto.randomUUID();
        startingId = id;
        sessionStorage.setItem(storage, id);
        next = await command.mutateAsync({
          url: base,
          body: {
            requestId: id,
            createRfp:
              !config.data?.rfpAvailable && includeRfp && can("rfp", "CREATE"),
            sources: [
              ...(rfp && config.data?.rfpAvailable ? [{ type: "rfp" }] : []),
              ...files.map((f) => ({ type: "file", id: f.id })),
            ],
            targets,
            model: model || models.data?.defaultModel || models.data?.models[0],
            prompt,
          },
        });
      }
      startingId = undefined;
      if (resume && next.status === "review_required") {
        if (next.duplicates.some((d) => !resolutions[d.clientRef]))
          throw Error("중복 후보별로 재사용 또는 신규 생성을 선택해 주세요.");
        next = await command.mutateAsync({
          url: base + "/" + id + "/continue",
          body: { resolutions },
        });
      }
      if (active.current) updateState(next);
    } catch (e) {
      // Keep uncertain network failures recoverable; rejected starts have no job.
      if (
        startingId &&
        e instanceof RequestError &&
        e.status !== null &&
        e.status >= 400 &&
        e.status < 500 &&
        sessionStorage.getItem(storage) === startingId
      )
        sessionStorage.removeItem(storage);
      if (resume && e instanceof RequestError && e.status === 404) {
        sessionStorage.removeItem(storage);
        setState(null);
      }
      if (active.current) {
        const detail =
          e instanceof RequestError &&
          e.payload &&
          typeof e.payload === "object" &&
          "error" in e.payload
            ? e.payload.error
            : undefined;
        setError(
          typeof detail === "string"
            ? detail
            : e instanceof Error
              ? e.message
              : "생성에 실패했습니다.",
        );
      }
    } finally {
      if (active.current) setBusy(false);
    }
  }
  return (
    <>
      <button className="button primary" onClick={() => setOpen(true)}>
        연계 문서 일괄 생성
      </button>
      <dialog
        ref={dialog}
        className="matrix-dialog workspace-dialog admin-detail-dialog project-registration-dialog"
        onCancel={(e) => {
          e.preventDefault();
          setOpen(false);
        }}
      >
        <div className="dialog-header admin-detail-header">
          <h2>연계 문서 일괄 생성</h2>
          <button
            className="button admin-detail-close"
            onClick={() => setOpen(false)}
          >
            닫기
          </button>
        </div>
        <div className="admin-detail-body project-registration-body">
          {busy && !displayed && (
            <p role="status">원본 확인 및 생성 작업 등록 중…</p>
          )}
          <p>
            목적과 개요 중심의 초기 초안을 생성하여 저장합니다. 기존 문서는
            보존됩니다. 한 번의 실행에서 최대{" "}
            {config.data?.maxChanges ?? "정책 확인 중"}개 항목을 생성할 수
            있습니다.
          </p>
          <p>
            생성은 서버에서 계속 진행됩니다. 창을 닫거나 새로고침해도 작업은
            유지되며, 다시 열면 진행 상태를 확인할 수 있습니다.
          </p>
          {progress.error instanceof Error && (
            <p role="alert">
              진행 상태를 확인하지 못했습니다. 이전 요청 조회를 눌러 주세요.
            </p>
          )}
          <fieldset disabled={busy || jobRunning}>
            <label>
              <input
                type="checkbox"
                checked={rfp && !!config.data?.rfpAvailable}
                disabled={!config.data?.rfpAvailable}
                onChange={(e) => setRfp(e.target.checked)}
              />
              저장된 RFP 사용 (미저장 편집 내용은 포함되지 않음)
            </label>
            {config.data && !config.data.rfpAvailable && (
              <p>
                저장된 RFP가 없습니다. 등록한 사업계획서 등 첨부 문서를 아래에서
                선택해 주세요.
              </p>
            )}
            {config.data && !config.data.rfpAvailable && (
              <label>
                <input
                  type="checkbox"
                  checked={includeRfp && can("rfp", "CREATE")}
                  disabled={!can("rfp", "CREATE")}
                  onChange={(e) => setIncludeRfp(e.target.checked)}
                />
                제안요청서 초안도 함께 생성{" "}
                {can("rfp", "CREATE")
                  ? "(기본 선택 · 변경 한도 1건 포함)"
                  : "(제안요청서 생성 권한 없음)"}
              </label>
            )}
            <DocumentFilePicker
              projectId={data.project.id}
              onSelect={(f) =>
                setFiles((s) =>
                  s.some((x) => x.id === f.id)
                    ? s
                    : s.length < 3
                      ? [...s, { id: f.id, name: f.name }]
                      : s,
                )
              }
            />
            {files.map((f) => (
              <div key={f.id}>
                {f.name}
                <button
                  className="button"
                  onClick={() =>
                    setFiles((s) => s.filter((x) => x.id !== f.id))
                  }
                >
                  제외
                </button>
              </div>
            ))}
            <p>첨부 최대 3개 · PDF/DOCX/TXT/MD · 합산 추출 본문 100,000자</p>
            {kinds.map((k) => (
              <label key={k}>
                <input
                  type="checkbox"
                  checked={targets.includes(k)}
                  onChange={(e) =>
                    setTargets((s) =>
                      e.target.checked ? [...s, k] : s.filter((x) => x !== k),
                    )
                  }
                />
                {definitions[k].document}
                {!can(k, "CREATE") ? " (생성 권한 없음)" : ""}
              </label>
            ))}
            <label>
              AI 모델
              <select
                value={
                  model ||
                  models.data?.defaultModel ||
                  models.data?.models[0] ||
                  ""
                }
                onChange={(e) => setModel(e.target.value)}
              >
                {models.data?.models.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </label>
            <label>
              생성 요청 범위
              <textarea
                value={prompt}
                maxLength={2000}
                onChange={(e) => setPrompt(e.target.value)}
              />
            </label>
          </fieldset>
          {models.error instanceof Error && (
            <p role="alert">{models.error.message}</p>
          )}
          {config.error instanceof Error && (
            <p role="alert">{config.error.message}</p>
          )}
          {displayed && (
            <div role="status">
              <p>
                {statusLabels[displayed.status] ?? displayed.status} ·{" "}
                {displayed.stage === 0
                  ? "원본 확인 / 설계 생성"
                  : "전체 검증 / 저장"}
              </p>
              {displayed.coverage.map((c) => (
                <p key={c.kind}>
                  {definitions[c.kind]?.document}: {c.reason}
                </p>
              ))}
              {displayed.result?.map((a) => (
                <p key={a.id}>
                  {a.code} · {a.title}
                  {a.reused ? " (기존 항목 재사용)" : ""}
                </p>
              ))}
            </div>
          )}
          {!!displayed?.evidenceWarnings?.length && (
            <div role="status">
              <p>생성 근거 검토 필요: {displayed.evidenceWarnings.length}건</p>
              <ul>
                {displayed.evidenceWarnings.map((warning) => (
                  <li key={warning.clientRef}>{warning.message}</li>
                ))}
              </ul>
            </div>
          )}
          {displayed?.duplicates.map((d) => (
            <label key={d.clientRef}>
              중복 후보: {d.title}
              <select
                value={choices[d.clientRef] ?? ""}
                onChange={(e) =>
                  setChoices((s) => ({ ...s, [d.clientRef]: e.target.value }))
                }
              >
                <option value="">선택</option>
                {d.candidates.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} 재사용
                  </option>
                ))}
                <option value="new">별도 항목으로 신규 생성</option>
              </select>
            </label>
          ))}
          {(error || displayed?.error) && (
            <p role="alert" className="matrix-error">
              {error || displayed?.error}
            </p>
          )}
        </div>
        <div className="matrix-toolbar project-registration-footer">
          <button
            className="button primary"
            disabled={
              busy ||
              jobRunning ||
              !models.data?.models.length ||
              !targets.length ||
              targets.some((k) => !can(k, "CREATE")) ||
              !config.data ||
              (!(rfp && config.data.rfpAvailable) && !files.length)
            }
            onClick={() => void run()}
          >
            생성하여 초안 저장
          </button>
          <button
            className="button"
            disabled={busy}
            onClick={() => void run(true)}
          >
            이전 요청 조회 / 이어가기
          </button>
          {displayed &&
            !["completed", "failed", "cancelled"].includes(
              displayed.status,
            ) && (
              <button
                className="button"
                onClick={() =>
                  void command
                    .mutateAsync({
                      url: base + "/" + displayed.requestId + "/stop",
                      body: {},
                    })
                    .then(updateState)
                    .catch((e) => setError(e.message))
                }
              >
                생성 중지
              </button>
            )}
          {displayed?.rfpResult && (
            <button
              className="button"
              onClick={() => {
                setOpen(false);
                selectTab("rfp");
              }}
            >
              생성된 제안요청서 보기 · v{displayed.rfpResult.version}
            </button>
          )}
          {displayed?.status === "completed" && (
            <button
              className="button"
              onClick={() => {
                setOpen(false);
                selectTab("overview");
              }}
            >
              전체 흐름 보기
            </button>
          )}
        </div>
      </dialog>
    </>
  );
}
