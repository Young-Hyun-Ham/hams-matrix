"use client";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWorkspaceMutation } from "@/components/query/use-workspace-mutation";
import { useWorkspaceQueryPolicy } from "@/components/query/workspace-query-runtime";
import { requestJson } from "@/lib/query/browser-fetch";
import { matrixKeys } from "@/lib/query/keys";
import { resolveWorkspaceError } from "@/lib/query/error-messages";
import type { AiChat } from "@/lib/ai-context";
import type { SharedAnswer } from "@/lib/ai/shared-answer-types";

const labels: Record<string, string> = {
  pending_review: "검토 대기",
  active: "공유 중",
  needs_review: "근거 변경 · 새 답변으로 재검토 필요",
  rejected: "반려",
  revoked: "철회",
};
export function SharedAnswerControls({
  projectId,
  chat,
  disabled = false,
}: {
  projectId: string;
  chat?: AiChat;
  disabled?: boolean;
}) {
  if (!projectId || (chat && !chat.shareEligibility?.eligible)) return null;
  if (disabled)
    return (
      <button type="button" disabled>
        {chat ? "공유 답변으로 등록" : "공유 답변 관리"}
      </button>
    );
  return (
    <ActiveSharedAnswerControls
      key={`${projectId}:${chat?.id ?? "manage"}`}
      projectId={projectId}
      chat={chat}
    />
  );
}
function ActiveSharedAnswerControls({
  projectId,
  chat,
}: {
  projectId: string;
  chat?: AiChat;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        {chat ? "공유 답변으로 등록" : "공유 답변 관리"}
      </button>
      {open && (
        <SharedAnswerDialog
          key={chat?.id ?? projectId}
          projectId={projectId}
          chat={chat}
          close={() => setOpen(false)}
        />
      )}
    </>
  );
}
function SharedAnswerDialog({
  projectId,
  chat,
  close,
}: {
  projectId: string;
  chat?: AiChat;
  close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    { scope, policy, settings } = useWorkspaceQueryPolicy(),
    client = useQueryClient();
  const base = `/api/projects/${encodeURIComponent(projectId)}/shared-answers`;
  const key = matrixKeys.sharedAnswers(scope, projectId);
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) =>
      requestJson<{
        answers: SharedAnswer[];
        canReview: boolean;
        canRegister: boolean;
      }>(base, { signal }),
    ...policy,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  const [conditions, setConditions] = useState(""),
    [aliases, setAliases] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [notice, setNotice] = useState("");
  const [reviewed, setReviewed] = useState<string | null>(null);
  const [replacement, setReplacement] = useState("");
  const idempotency = useRef(crypto.randomUUID());
  const command = useWorkspaceMutation({
    mutationFn: (input: { path: string; body: object }) =>
      requestJson(input.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input.body),
      }),
    retry: false,
    onSuccess: () => {
      setNotice(
        chat
          ? "등록 요청 완료 · owner/admin 승인 후 공유됩니다."
          : "처리했습니다.",
      );
      setReviewed(null);
      void client.invalidateQueries({ queryKey: key });
    },
    onError: () => {
      void query.refetch();
    },
  });
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const error = resolveWorkspaceError(
    command.error ?? query.error,
    settings.errorMessages,
  );
  return (
    <dialog
      ref={dialog}
      className="workspace-dialog matrix-shared-dialog"
      onCancel={close}
      aria-labelledby="shared-dialog-title"
    >
      <header>
        <h2 id="shared-dialog-title">
          {chat ? "공유 답변으로 등록" : "프로젝트 공유 답변"}
        </h2>
        <button type="button" onClick={close}>
          닫기
        </button>
      </header>
      <p>
        같은 프로젝트의 권한 있는 사용자에게만 제공합니다. 대화 삭제와 공유
        철회는 별개입니다.
      </p>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {chat ? (
        <section>
          <h3>{chat.prompt}</h3>
          <pre>{chat.result}</pre>
          {query.data?.canReview && (
            <label>
              재검토할 공유 답변
              <select
                value={replacement}
                onChange={(e) => {
                  setReplacement(e.target.value);
                  idempotency.current = crypto.randomUUID();
                }}
              >
                <option value="">새 공유 답변으로 등록</option>
                {query.data.answers
                  .filter((a) => a.status === "needs_review")
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.question} · 새 버전으로 교체
                    </option>
                  ))}
              </select>
            </label>
          )}
          <label>
            적용 조건 · 대상·문서 판·제외 범위 등
            <textarea
              value={conditions}
              maxLength={2000}
              onChange={(e) => {
                setConditions(e.target.value);
                idempotency.current = crypto.randomUUID();
              }}
            />
          </label>
          <label>
            같은 의미와 조건인 질문 표현 · 한 줄에 하나, 최대 10개
            <textarea
              value={aliases}
              maxLength={20000}
              onChange={(e) => {
                setAliases(e.target.value);
                idempotency.current = crypto.randomUUID();
              }}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            개인 정보·개인 문맥이 없고 표시된 원문과 조건을 공용으로 등록함을
            확인했습니다.
          </label>
          <button
            type="button"
            disabled={
              command.isPending ||
              !!notice ||
              !confirmed ||
              !conditions.trim() ||
              query.data?.canRegister !== true
            }
            onClick={() =>
              command.mutate({
                path: base,
                body: {
                  chatId: chat.id,
                  conditions,
                  aliases: aliases
                    .split("\n")
                    .map((s) => s.trim())
                    .filter(Boolean),
                  confirmPublic: confirmed,
                  idempotencyKey: idempotency.current,
                  ...(replacement
                    ? {
                        replaceAnswerId: replacement,
                        expectedVersion: query.data?.answers.find(
                          (a) => a.id === replacement,
                        )?.version,
                      }
                    : {}),
                },
              })
            }
          >
            등록 요청
          </button>
        </section>
      ) : (
        <section>
          {query.isPending && <p role="status">불러오는 중입니다.</p>}
          {!query.isPending && !query.data?.answers.length && (
            <p>등록된 공유 답변이 없습니다.</p>
          )}
          {!query.isFetching &&
            !query.error &&
            query.data?.answers.map((answer) => (
              <article key={`${answer.id}:${answer.version}`}>
                <h3>{answer.question}</h3>
                <p>
                  {labels[answer.status] ?? answer.status} · 버전{" "}
                  {answer.answerVersion}
                </p>
                <p>적용 조건: {answer.contract.conditions}</p>
                <details>
                  <summary>답변·질문 표현·근거 검토</summary>
                  <pre>{answer.result}</pre>
                  <ul>
                    {answer.aliases.map((a) => (
                      <li key={a}>{a}</li>
                    ))}
                  </ul>
                  <ul>
                    {answer.evidence.map((s) => (
                      <li key={`${s.type}:${s.id}`}>
                        <a
                          href={s.href}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {s.title}
                        </a>{" "}
                        · 버전 {s.version}
                      </li>
                    ))}
                  </ul>
                  {answer.canReview && answer.status === "pending_review" && (
                    <label>
                      <input
                        type="checkbox"
                        checked={reviewed === answer.id}
                        onChange={(e) =>
                          setReviewed(e.target.checked ? answer.id : null)
                        }
                      />
                      현재 근거 전체·원문·별칭·적용 조건을 확인했고 개인정보
                      없이 공용으로 적합합니다.
                    </label>
                  )}
                </details>
                {answer.canReview && answer.status === "pending_review" && (
                  <>
                    <button
                      type="button"
                      disabled={
                        command.isPending ||
                        reviewed !== answer.id ||
                        answer.stale
                      }
                      onClick={() =>
                        command.mutate({
                          path: `${base}/${encodeURIComponent(answer.id)}/review`,
                          body: {
                            expectedVersion: answer.version,
                            decision: "approve",
                            confirmPublic: true,
                            confirmConditions: true,
                          },
                        })
                      }
                    >
                      승인
                    </button>
                    <button
                      type="button"
                      disabled={command.isPending}
                      onClick={() =>
                        command.mutate({
                          path: `${base}/${encodeURIComponent(answer.id)}/review`,
                          body: {
                            expectedVersion: answer.version,
                            decision: "reject",
                          },
                        })
                      }
                    >
                      반려
                    </button>
                  </>
                )}
                {answer.stale && (
                  <p>
                    최신 자료로 새 채팅에서 답변을 생성한 뒤 다시 등록해 주세요.
                  </p>
                )}
                {answer.canRevoke && answer.status !== "revoked" && (
                  <button
                    type="button"
                    disabled={command.isPending}
                    onClick={() =>
                      command.mutate({
                        path: `${base}/${encodeURIComponent(answer.id)}/revoke`,
                        body: { expectedVersion: answer.version },
                      })
                    }
                  >
                    공유 철회
                  </button>
                )}
              </article>
            ))}
        </section>
      )}
    </dialog>
  );
}

export function SharedAnswerPreview({
  projectId,
  id,
  close,
}: {
  projectId: string;
  id: string;
  close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    { scope, policy, settings } = useWorkspaceQueryPolicy();
  const query = useQuery({
    queryKey: [...matrixKeys.sharedAnswers(scope, projectId), id],
    queryFn: ({ signal }) =>
      requestJson<SharedAnswer>(
        `/api/projects/${encodeURIComponent(projectId)}/shared-answers/${encodeURIComponent(id)}`,
        { signal },
      ),
    ...policy,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="workspace-dialog matrix-shared-dialog"
      onCancel={close}
      aria-label="공유 답변 원문 열람"
    >
      <button type="button" onClick={close}>
        닫기
      </button>
      {query.isPending && (
        <p role="status">현재 근거와 권한을 확인하고 있습니다.</p>
      )}
      {!!query.error && (
        <p role="alert">
          {resolveWorkspaceError(query.error, settings.errorMessages)}
        </p>
      )}
      {!query.isFetching && !query.error && query.data && (
        <>
          <h2>{query.data.question}</h2>
          <p>적용 조건: {query.data.contract.conditions}</p>
          <p>
            이 질문에 자동 적용된 답변이 아닙니다. 조건이 다르면 새 답변을
            생성해 주세요.
          </p>
          <pre>{query.data.result}</pre>
          <ul>
            {query.data.evidence.map((s) => (
              <li key={`${s.type}:${s.id}`}>
                <a href={s.href}>{s.title}</a> · 버전 {s.version}
              </li>
            ))}
          </ul>
        </>
      )}
    </dialog>
  );
}
