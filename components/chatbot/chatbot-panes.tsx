/* eslint-disable @next/next/no-img-element -- Private authenticated previews must bypass the public image optimizer. */
"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { formGrid, formOptions } from "@/lib/chatbot/form-fields";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { DocumentFormat } from "@/lib/chatbot/document-formats";
import { ChatbotMermaid } from "./chatbot-mermaid";
import { ClarificationCard } from "./clarification-card";
import type {
  Artifact,
  Approval,
  Message,
  ModelList,
  Mode,
  Review,
  Run,
  Settings,
} from "@/lib/chatbot/types";
import {
  useChatbot,
  useChatbotClient,
  useChatbotQuery,
  errorMessage,
  type Draft,
} from "./runtime";
import { Icon } from "../icon";

function ReviewCard({
  value,
  refresh,
  image,
}: {
  value: Review;
  refresh: () => Promise<unknown>;
  image?: boolean;
}) {
  const api = useChatbotClient(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function decide(decision: string) {
    setBusy(true);
    try {
      await api.send(`reviews/${value.id}/decision`, "POST", {
        decision,
        expectedVersion: value.version,
      });
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="chatbot-review">
      <strong>{value.summary}</strong>
      {value.before && (
        <details>
          <summary>변경 전</summary>
          {value.kind === "artifact" && !image ? (
            <DocumentBody content={value.before} />
          ) : (
            <pre>{value.before}</pre>
          )}
        </details>
      )}
      {value.after && (
        <details open>
          <summary>변경 후</summary>
          {value.kind === "artifact" && !image ? (
            <DocumentBody content={value.after} />
          ) : (
            <pre>{value.after}</pre>
          )}
        </details>
      )}
      {image && value.status === "pending" && (
        <div className="chatbot-image-compare">
          <figure>
            <figcaption>변경 전</figcaption>
            <img
              src={`/api/chatbot/reviews/${value.id}/preview?before=1`}
              alt="수정 전 이미지"
            />
          </figure>
          <figure>
            <figcaption>수정안</figcaption>
            <img
              src={`/api/chatbot/reviews/${value.id}/preview`}
              alt="수정 이미지 후보"
            />
          </figure>
        </div>
      )}
      {value.status === "pending" ? (
        <div className="chatbot-actions">
          <button
            disabled={busy}
            className="chatbot-primary"
            onClick={() => void decide("approve")}
          >
            승인
          </button>
          <button disabled={busy} onClick={() => void decide("reject")}>
            거절
          </button>
        </div>
      ) : (
        <small>검토 상태: {value.status}</small>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
function PolicyCard({
  value,
  refresh,
}: {
  value: Approval;
  refresh: () => Promise<unknown>;
}) {
  const api = useChatbotClient(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function act(action: string) {
    setBusy(true);
    try {
      await api.send(`policy-approvals/${value.id}/${action}`, "POST", {
        expectedVersion: value.version,
      });
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="chatbot-review">
      <strong>정책 승인 · {value.status}</strong>
      <p>{value.rules.join(", ")}</p>
      <div className="chatbot-actions">
        {value.status === "awaiting_choice" && (
          <button disabled={busy} onClick={() => void act("request")}>
            관리자 승인 요청
          </button>
        )}
        {value.status === "approved" && (
          <button disabled={busy} onClick={() => void act("resume")}>
            이어서 진행
          </button>
        )}
        {["awaiting_choice", "pending", "approved"].includes(value.status) && (
          <button disabled={busy} onClick={() => void act("cancel")}>
            취소
          </button>
        )}
        <button disabled={busy} onClick={() => void refresh()}>
          상태 새로고침
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
function DocumentBody({
  content,
  format,
}: {
  content: string;
  format?: string;
}) {
  return format === "mermaid" || format === "mmd" ? (
    <ChatbotMermaid code={content} />
  ) : format === "txt" ? (
    <pre>{content}</pre>
  ) : (
    <div className="chatbot-document-preview">
      <ReactMarkdown
        skipHtml
        remarkPlugins={[remarkGfm]}
        urlTransform={(url) =>
          /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+=*$/.test(url)
            ? url
            : defaultUrlTransform(url)
        }
        components={{
          img: ({ src, alt }) =>
            typeof src === "string" &&
            /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+=*$/.test(src) ? (
              <img src={src} alt={alt ?? "문서 이미지"} />
            ) : null,
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
function DocumentPreview({ value, en }: { value: Artifact; en: boolean }) {
  const [open, setOpen] = useState(false);
  const query = useChatbotQuery<{ content: string; format: string }>(
    `artifacts/${value.id}/versions/${value.versionId}`,
    open,
  );
  return (
    <details onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>{en ? "Document preview" : "문서 미리보기"}</summary>
      {query.isFetching && <p>{en ? "Loading…" : "불러오는 중…"}</p>}
      {query.error && <p role="alert">{errorMessage(query.error)}</p>}
      {open && query.data && !query.error && (
        <DocumentBody content={query.data.content} format={query.data.format} />
      )}
    </details>
  );
}
function ArtifactCard({
  value,
  edit,
  en,
}: {
  value: Artifact;
  edit: () => void;
  en: boolean;
}) {
  return (
    <section className="chatbot-artifact">
      <strong>
        {value.title} · v{value.version}
      </strong>
      {value.kind === "image" && <img src={value.url} alt={value.title} />}
      {value.kind === "file" && <DocumentPreview value={value} en={en} />}
      <div className="chatbot-actions">
        <a href={value.url} download>
          {en ? "Download" : "다운로드"}
        </a>
        <button onClick={edit}>{en ? "Edit" : "수정"}</button>
      </div>
    </section>
  );
}
function MessageBody({ text, collapse }: { text: string; collapse: boolean }) {
  return collapse && text.length > 1200 ? (
    <details>
      <summary>{text.slice(0, 100)}…</summary>
      <ReactMarkdown
        skipHtml
        components={{
          img: () => null,
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </details>
  ) : (
    <pre>{text}</pre>
  );
}
export function ConversationPane({
  id,
  settings,
  onScenario,
  onRunning,
}: {
  id: string;
  settings: Settings;
  onScenario: (id: string, name: string) => void;
  onRunning: (value: boolean) => void;
}) {
  const { drafts, saveDraft } = useChatbot(),
    initial = drafts[id] ?? {
      prompt: "",
      mode: "chat" as Mode,
      modelId: "",
      attachments: [],
    },
    [draft, setDraft] = useState<Draft>(initial);
  const [command, setCommand] = useState(false),
    [commandSlash, setCommandSlash] = useState<number | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [before, setBefore] = useState<number | null>(null),
    [older, setOlder] = useState<Message[]>([]);
  const commands = useChatbotQuery<{
    scenarios: { id: string; name: string }[];
  }>(
    "scenarios?scope=command",
    command && commandSlash !== null,
    undefined,
    true,
  );
  const input = useRef<HTMLTextAreaElement>(null),
    bottom = useRef<HTMLDivElement>(null),
    sendKey = useRef<{ payload: string; key: string } | null>(null);
  useEffect(() => {
    const element = input.current;
    if (!element) return;
    const resize = () => {
      element.style.height = "auto";
      const maxHeight = parseFloat(getComputedStyle(element).maxHeight);
      element.style.height = Math.min(element.scrollHeight, maxHeight) + "px";
    };
    resize();
    let width = element.clientWidth;
    const observer = new ResizeObserver(() => {
      if (element.clientWidth === width) return;
      width = element.clientWidth;
      resize();
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [draft.prompt]);
  const api = useChatbotClient(),
    en = settings.language === "en";
  const query = useChatbotQuery<{
    messages: Message[];
    nextCursor: number | null;
  }>(
    `conversations/${id}/messages${before ? `?beforeSeq=${before}` : ""}`,
    true,
    (data) =>
      data.messages.some((v) => ["queued", "running"].includes(v.status)),
  );
  const available = useChatbotQuery<ModelList>(
    `models?mode=${draft.mode}`,
    draft.mode === "chat",
  );
  const list = available.data?.models ?? [],
    model = list.some((m) => m.id === draft.modelId)
      ? draft.modelId
      : (available.data?.defaultModel ?? "");
  const rows = before
      ? [...(query.data?.messages ?? []), ...older]
      : (query.data?.messages ?? []),
    running = rows.some(
      (v) => v.role === "status" && ["queued", "running"].includes(v.status),
    );
  useEffect(() => {
    onRunning(running);
  }, [onRunning, running]);
  useEffect(() => {
    saveDraft(id, draft);
  }, [saveDraft, draft, id]);
  useEffect(() => {
    if (!before) bottom.current?.scrollIntoView({ block: "nearest" });
  }, [query.data, before]);
  function switchMode(mode: Mode, artifact?: Artifact) {
    setDraft((d) => ({
      ...d,
      mode,
      modelId: "",
      artifact,
      format: artifact?.format ?? d.format,
      prompt:
        commandSlash !== null && d.prompt[commandSlash] === "/"
          ? d.prompt.slice(0, commandSlash) + d.prompt.slice(commandSlash + 1)
          : d.prompt,
    }));
    setCommand(false);
    setCommandSlash(null);
    input.current?.focus();
  }
  async function send(event: FormEvent) {
    event.preventDefault();
    if (
      !draft.prompt.trim() ||
      (draft.mode === "chat" && !model) ||
      busy ||
      running
    )
      return;
    const body = {
      prompt: draft.prompt,
      mode: draft.mode,
      ...(draft.mode === "chat" ? { modelId: model } : {}),
      attachmentIds: draft.attachments.map((a) => a.id),
      format: draft.format ?? "md",
      ...(draft.artifact
        ? { artifactId: draft.artifact.id, baseVersion: draft.artifact.version }
        : {}),
    };
    const payload = JSON.stringify(body);
    if (sendKey.current?.payload !== payload)
      sendKey.current = { payload, key: crypto.randomUUID() };
    setBusy(true);
    setError("");
    try {
      await api.send(`conversations/${id}/messages`, "POST", {
        ...body,
        clientRequestId: sendKey.current.key,
      });
      sendKey.current = null;
      setDraft((d) => ({
        ...d,
        prompt: "",
        attachments: [],
        artifact: undefined,
      }));
      setBefore(null);
      setOlder([]);
      await api.refresh();
    } catch (e) {
      setError(errorMessage(e));
      await query.refetch();
    } finally {
      setBusy(false);
    }
  }
  async function upload(file: File) {
    setBusy(true);
    setError("");
    try {
      if (file.size > 8388608 || draft.attachments.length >= 3)
        throw Error("첨부는 최대 3개, 파일당 8MB입니다.");
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const mime = file.name.endsWith(".md")
        ? "text/markdown"
        : file.name.endsWith(".txt")
          ? "text/plain"
          : file.type;
      const result = await api.send<{ id: string; name: string; mime: string }>(
        "attachments",
        "POST",
        { conversationId: id, name: file.name, mime, base64 },
      );
      setDraft((d) => ({ ...d, attachments: [...d.attachments, result] }));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="chatbot-messages" aria-live="polite">
        {query.data?.nextCursor && (
          <button
            onClick={() => {
              setOlder([...query.data!.messages, ...older]);
              setBefore(query.data!.nextCursor);
            }}
          >
            {en ? "Earlier messages" : "이전 대화"}
          </button>
        )}
        {query.isLoading && (
          <p role="status">{en ? "Loading…" : "불러오는 중…"}</p>
        )}
        {query.error && (
          <p role="alert">
            {errorMessage(query.error)}{" "}
            <button onClick={() => void query.refetch()}>다시 조회</button>
          </p>
        )}
        {!rows.length && !query.isLoading && (
          <div className="chatbot-welcome">
            <span>✦</span>
            <h2>
              {en
                ? "A new answer for your workspace"
                : "업무에 새로운 답을 더하세요"}
            </h2>
            <p>
              {en
                ? "Ask a question or create an image or document."
                : "궁금한 점을 물어보거나 이미지와 문서를 만들어 보세요."}
            </p>
          </div>
        )}
        {rows.map((m) => (
          <article
            key={m.id}
            className={`chatbot-message chatbot-message-${m.role}`}
          >
            {m.text && (
              <MessageBody
                text={m.text}
                collapse={settings.truncateLongResponses}
              />
            )}{" "}
            {m.artifact && (
              <ArtifactCard
                value={m.artifact}
                en={en}
                edit={() => switchMode(m.artifact!.kind as Mode, m.artifact)}
              />
            )}
            {m.review && (
              <ReviewCard
                value={m.review}
                image={m.review.after === "이미지 수정 후보"}
                refresh={() => api.refresh()}
              />
            )}{" "}
            {m.approval && (
              <PolicyCard value={m.approval} refresh={() => api.refresh()} />
            )}
            {m.clarifications?.map((card) => (
              <ClarificationCard
                key={card.id}
                value={card}
                refresh={() => api.refresh()}
                en={en}
              />
            ))}
            {m.role === "status" &&
              ["queued", "running"].includes(m.status) && (
                <div role="status">
                  {en ? "Working…" : "처리 중…"}{" "}
                  <button
                    onClick={async () => {
                      try {
                        await api.send(`requests/${m.requestId}/stop`);
                        await api.refresh();
                      } catch (e) {
                        setError(errorMessage(e));
                      }
                    }}
                  >
                    {en ? "Stop" : "중단"}
                  </button>
                </div>
              )}
            {m.status === "unknown" && (
              <p role="alert">
                처리 결과를 확인하지 못했습니다. 자동으로 재실행하지 않습니다.
              </p>
            )}
          </article>
        ))}
        <div ref={bottom} />
      </div>
      <form className="chatbot-composer" onSubmit={send}>
        {error && <p role="alert">{error}</p>}
        {draft.mode === "chat" && available.error && (
          <p role="alert">
            {errorMessage(available.error)}{" "}
            <button type="button" onClick={() => void available.refetch()}>
              모델 다시 조회
            </button>
          </p>
        )}
        {draft.artifact && (
          <div className="chatbot-edit-target">
            {en ? "Editing" : "수정 대상"}: {draft.artifact.title} · v
            {draft.artifact.version}
            <button
              type="button"
              onClick={() => setDraft((d) => ({ ...d, artifact: undefined }))}
              aria-label="수정 대상 해제"
            >
              ×
            </button>
          </div>
        )}
        {draft.attachments.length > 0 && (
          <div className="chatbot-attachments">
            {draft.attachments.map((a) => (
              <span key={a.id}>
                {a.name}
                <button
                  type="button"
                  aria-label={`${a.name} 첨부 해제`}
                  onClick={() =>
                    setDraft((d) => ({
                      ...d,
                      attachments: d.attachments.filter((v) => v.id !== a.id),
                    }))
                  }
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        {command && (
          <>
            <button
              type="button"
              className="chatbot-command-dismiss"
              aria-label="명령 메뉴 닫기"
              onClick={() => {
                setCommand(false);
                setCommandSlash(null);
              }}
            />
            <div
              className="chatbot-command-menu chatbot-sub-layer"
              role="menu"
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.stopPropagation();
                  setCommand(false);
                  setCommandSlash(null);
                  input.current?.focus();
                }
              }}
            >
              {commandSlash === null ? (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    title="시각화 및 수정"
                    onClick={() => switchMode("image")}
                  >
                    ▧ {en ? "Create image" : "이미지 생성"}
                    <small>
                      {en ? "Visualize and edit" : "시각화 및 수정"}
                    </small>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    title="문서 및 수정"
                    onClick={() => switchMode("file")}
                  >
                    ▤ {en ? "Create document" : "문서 생성"}
                    <small>{en ? "Document and edit" : "문서 및 수정"}</small>
                  </button>
                </>
              ) : commands.isFetching ? (
                <p role="status">
                  {en ? "Loading scenarios…" : "시나리오 불러오는 중…"}
                </p>
              ) : commands.error ? (
                <p role="alert">
                  {errorMessage(commands.error)}{" "}
                  <button type="button" onClick={() => void commands.refetch()}>
                    {en ? "Retry" : "다시 조회"}
                  </button>
                </p>
              ) : commands.data?.scenarios.length ? (
                commands.data.scenarios.map((scenario) => (
                  <button
                    key={scenario.id}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onScenario(scenario.id, scenario.name);
                      setDraft((value) =>
                        value.prompt[commandSlash] === "/"
                          ? {
                              ...value,
                              prompt:
                                value.prompt.slice(0, commandSlash) +
                                value.prompt.slice(commandSlash + 1),
                            }
                          : value,
                      );
                      setCommand(false);
                      setCommandSlash(null);
                    }}
                  >
                    {scenario.name}
                  </button>
                ))
              ) : (
                <p role="status">
                  {en
                    ? "No registered deployed scenarios."
                    : "등록된 배포 시나리오가 없습니다."}
                </p>
              )}
            </div>
          </>
        )}
        <div className="chatbot-input-row">
          <button
            type="button"
            className="chatbot-command-toggle"
            aria-label={en ? "Creation menu" : "생성 메뉴"}
            aria-expanded={command}
            onClick={() => {
              setCommandSlash(null);
              setCommand(!command);
            }}
          >
            ☰
          </button>
          <div className="chatbot-input-container">
            {draft.mode !== "chat" && (
              <span className={`chatbot-mode-${draft.mode}`}>
                {draft.mode === "image" ? "이미지 생성" : "문서 생성"}
                <button
                  type="button"
                  aria-label="기본 채팅으로 전환"
                  onClick={() => switchMode("chat")}
                >
                  ×
                </button>
              </span>
            )}
            <label
              className="chatbot-upload"
              title={en ? "Attach file" : "파일 첨부"}
            >
              <Icon name="file" size={19} />
              <input
                type="file"
                accept=".png,.jpg,.jpeg,.md,.txt"
                aria-label={en ? "Attach file" : "파일 첨부"}
                disabled={busy}
                onChange={(e) => {
                  if (e.target.files?.[0]) void upload(e.target.files[0]);
                  e.target.value = "";
                }}
              />
            </label>
            <textarea
              ref={input}
              rows={1}
              aria-label={en ? "Chatbot message" : "챗봇 메시지"}
              maxLength={12000}
              placeholder={settings.inputPlaceholder}
              value={draft.prompt}
              onChange={(e) => {
                const prompt = e.target.value;
                const cursor = e.target.selectionStart;
                const slash =
                  prompt.length > draft.prompt.length &&
                  prompt[cursor - 1] === "/";
                setDraft((d) => ({ ...d, prompt }));
                if (slash) {
                  setCommandSlash(cursor - 1);
                  setCommand(true);
                } else if (commandSlash !== null) {
                  setCommandSlash(null);
                  setCommand(false);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape" && command) {
                  e.stopPropagation();
                  setCommand(false);
                  setCommandSlash(null);
                } else if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing
                ) {
                  e.preventDefault();
                  if (command && commandSlash !== null) {
                    e.currentTarget.form
                      ?.querySelector<HTMLButtonElement>('[role="menuitem"]')
                      ?.focus();
                  } else void send(e);
                }
              }}
            />
            <button
              type="submit"
              disabled={
                busy ||
                running ||
                (draft.mode === "chat" && !model) ||
                !draft.prompt.trim() ||
                (draft.mode === "chat" && available.isFetching)
              }
              aria-label={en ? "Send" : "메시지 전송"}
            >
              ➜
            </button>
          </div>
        </div>
        <div className="chatbot-composer-options">
          {draft.mode === "file" && (
            <label className="chatbot-model">
              {en ? "Document format" : "문서 형식"}
              <select
                aria-label="문서 형식"
                value={draft.format ?? "md"}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    format: e.target.value as DocumentFormat,
                  }))
                }
              >
                <option value="md">Markdown (.md)</option>
                <option value="txt">Text (.txt)</option>
                <option value="docx">Word (DOCX)</option>
                <option value="pptx">
                  {en ? "Slides (PPTX)" : "슬라이드 (PPTX)"}
                </option>
                <option value="pdf">PDF (PDF)</option>
                <option value="mermaid">Mermaid (.mmd)</option>
              </select>
            </label>
          )}
          {draft.mode === "chat" && (
            <label className="chatbot-model">
              {en ? "Model" : "모델"}
              <select
                value={model}
                data-chatbot-model="true"
                aria-label={en ? "Chatbot model" : "챗봇 모델"}
                disabled={available.isFetching || busy}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, modelId: e.target.value }))
                }
              >
                {!model && (
                  <option value="">{en ? "Select model" : "모델 선택"}</option>
                )}
                {list.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.id}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </form>
    </>
  );
}

type Field = {
  type?: string;
  name?: string;
  id?: string;
  label?: string;
  required?: boolean;
  defaultValue?: unknown;
  options?: unknown[];
  optionsSlot?: string;
  columns?: { name?: string; field?: string; label?: string }[];
  rows?: unknown[];
  inputType?: string;
  hasTime?: boolean;
  hasFromTo?: boolean;
  defaultFromValue?: string;
  defaultToValue?: string;
};
function FormFields({
  run,
  values,
  setValues,
}: {
  run: Run;
  values: Record<string, unknown>;
  setValues: (v: Record<string, unknown>) => void;
}) {
  const elements = (run.currentNode?.data.elements ?? []) as Field[];
  return (
    <>
      {elements.map((f, i) => {
        const key = String(f.name || f.id || `${f.type}-${i}`),
          value = values[key] ?? f.defaultValue ?? "",
          label = f.label || f.name || key;
        const options = formOptions(f as Record<string, unknown>, run.slots);
        const update = (v: unknown) => setValues({ ...values, [key]: v });
        if (f.type === "label") return <p key={key}>{label}</p>;
        if (f.type === "date" && f.hasFromTo)
          return (
            <fieldset key={key}>
              <legend>{label}</legend>
              {["from", "to"].map((part) => (
                <label key={part}>
                  {part === "from" ? "시작" : "종료"}
                  <input
                    type={f.hasTime ? "datetime-local" : "date"}
                    required={f.required}
                    value={String(
                      values[key + "." + part] ??
                        (part === "from"
                          ? f.defaultFromValue
                          : f.defaultToValue) ??
                        "",
                    )}
                    onChange={(e) =>
                      setValues({
                        ...values,
                        [key + "." + part]: e.target.value,
                      })
                    }
                  />
                </label>
              ))}
            </fieldset>
          );

        if (f.type === "grid") {
          const { rows, columns } = formGrid(
            f as Record<string, unknown>,
            run.slots,
          );
          return (
            <fieldset key={key}>
              <legend>{label}</legend>
              <div className="chatbot-grid">
                <table>
                  <thead>
                    <tr>
                      <th>선택</th>
                      {columns.map((c, j) => (
                        <th key={j}>{c.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, j) => (
                      <tr key={j}>
                        <td>
                          <input
                            type="checkbox"
                            aria-label={`${label} ${j + 1}`}
                            checked={Array.isArray(value) && value.includes(j)}
                            onChange={(e) =>
                              update(
                                e.target.checked
                                  ? [...(Array.isArray(value) ? value : []), j]
                                  : (Array.isArray(value) ? value : []).filter(
                                      (n) => n !== j,
                                    ),
                              )
                            }
                          />
                        </td>
                        {columns.map((c, k) => (
                          <td key={k}>{String(r[c.key] ?? "")}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </fieldset>
          );
        }
        if (["radio", "checkbox"].includes(f.type ?? "") && options.length)
          return (
            <fieldset key={key}>
              <legend>{label}</legend>
              {options.map((o) => (
                <label key={o.value} className="chatbot-check">
                  <input
                    type={f.type}
                    name={key}
                    value={o.value}
                    checked={
                      f.type === "radio"
                        ? value === o.value
                        : Array.isArray(value) && value.includes(o.value)
                    }
                    onChange={(e) =>
                      update(
                        f.type === "radio"
                          ? o.value
                          : e.target.checked
                            ? [...(Array.isArray(value) ? value : []), o.value]
                            : (Array.isArray(value) ? value : []).filter(
                                (v) => v !== o.value,
                              ),
                      )
                    }
                  />
                  {o.label}
                </label>
              ))}
            </fieldset>
          );
        return (
          <label key={key}>
            {label}
            {f.required ? " *" : ""}
            {["dropbox", "select"].includes(f.type ?? "") ? (
              <select
                required={f.required}
                value={String(value)}
                onChange={(e) => update(e.target.value)}
              >
                <option value="">선택</option>
                {options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : f.type === "textarea" ? (
              <textarea
                value={String(value)}
                onChange={(e) => update(e.target.value)}
                required={f.required}
              />
            ) : (
              <input
                type={
                  f.type === "checkbox"
                    ? "checkbox"
                    : f.type === "date" && f.hasTime
                      ? "datetime-local"
                      : ["number", "date", "time"].includes(f.type ?? "")
                        ? f.type
                        : f.inputType === "number"
                          ? "number"
                          : "text"
                }
                required={f.required}
                value={String(value)}
                checked={f.type === "checkbox" ? Boolean(value) : undefined}
                onChange={(e) =>
                  update(
                    f.type === "checkbox" ? e.target.checked : e.target.value,
                  )
                }
              />
            )}
          </label>
        );
      })}
    </>
  );
}
function ScenarioEmbeddedContent({
  node,
}: {
  node: NonNullable<Run["currentNode"]>;
}) {
  const [loaded, setLoaded] = useState(false);
  const raw = String(
    node.data.resolvedUrl || node.data.url || node.data.content || "",
  );
  let url: URL | undefined;
  try {
    url = new URL(raw);
  } catch {}
  if (!url || url.protocol !== "https:" || url.username || url.password)
    return <p role="alert">유효한 HTTPS 주소가 필요합니다.</p>;
  return (
    <div>
      <a href={url.href} target="_blank" rel="noopener noreferrer">
        {String(node.data.display || "새 창에서 열기")}
      </a>
      {node.type === "iframe" && (
        <>
          {!loaded ? (
            <button type="button" onClick={() => setLoaded(true)}>
              내용 표시
            </button>
          ) : (
            <iframe
              className="chatbot-embedded-frame"
              src={url.href}
              title={String(node.data.display || "시나리오 내용")}
              sandbox=""
              referrerPolicy="no-referrer"
            />
          )}
          <small>
            외부 내용은 스크립트·폼 실행을 차단한 상태로 표시합니다.
          </small>
        </>
      )}
    </div>
  );
}
export function ScenarioPane({
  id,
  settings,
  readOnly = false,
  visible = true,
  onStatus,
}: {
  id: string;
  settings: Settings;
  readOnly?: boolean;
  visible?: boolean;
  onStatus?: (status: string) => void;
}) {
  const [eventCursor, setEventCursor] = useState(0),
    [earlierEvents, setEarlierEvents] = useState<Run["events"]>([]);
  const api = useChatbotClient(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [values, setValues] = useState<Record<string, unknown>>({}),
    [answer, setAnswer] = useState(""),
    [diagnostics, setDiagnostics] = useState(false),
    key = useRef<{ payload: string; key: string } | null>(null);
  const query = useChatbotQuery<Run>(
      eventCursor
        ? `scenario-runs/${id}/events?after=${eventCursor}`
        : `scenario-runs/${id}`,
      true,
      (data) => ["queued", "running"].includes(data.status),
    ),
    run = query.error ? undefined : query.data,
    en = settings.language === "en";
  const refetch = query.refetch;
  const inputVersion = useRef("");
  useEffect(() => {
    if (visible) void refetch();
  }, [visible, refetch]);
  useEffect(() => {
    if (!run) return;
    onStatus?.(run.status);
    const version =
      run.status === "waiting_input"
        ? run.currentNode?.id + ":" + run.version
        : "";
    if (inputVersion.current === version) return;
    inputVersion.current = version;
    setValues({});
    setAnswer("");
    key.current = null;
  }, [onStatus, run]);
  async function send(value?: string) {
    if (!run || busy) return;
    setBusy(true);
    setError("");
    const payload = {
        expectedRunVersion: run.version,
        nodeId: run.currentNode?.id,
        values,
        value: value ?? answer,
      },
      encoded = JSON.stringify(payload);
    if (key.current?.payload !== encoded)
      key.current = { payload: encoded, key: crypto.randomUUID() };
    try {
      await api.send(`scenario-runs/${id}/inputs`, "POST", {
        ...payload,
        clientRequestId: key.current.key,
      });
      key.current = null;
      setValues({});
      setAnswer("");
      await api.refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const node = run?.currentNode,
    replies = Array.isArray(node?.data.replies)
      ? (node.data.replies as { value: string; display?: string }[])
      : [];
  return (
    <>
      <div className="chatbot-messages" aria-live="polite">
        {!run && query.isPending && (
          <p role="status">{en ? "Loading run…" : "실행 정보 불러오는 중…"}</p>
        )}
        {query.error && (
          <p role="alert">
            {errorMessage(query.error)}{" "}
            <button onClick={() => void query.refetch()}>다시 조회</button>
          </p>
        )}
        {run && (
          <>
            <div className="chatbot-run-status">
              <strong>{run.title}</strong>
              <span>{run.status}</span>
              <button onClick={() => setDiagnostics(!diagnostics)}>
                {en ? "Run details" : "실행 정보"}
              </button>
              {!readOnly &&
                [
                  "queued",
                  "running",
                  "waiting_input",
                  "waiting_review",
                  "waiting_policy_approval",
                ].includes(run.status) && (
                  <button
                    onClick={async () => {
                      try {
                        await api.send(`scenario-runs/${id}/stop`);
                        await query.refetch();
                      } catch (e) {
                        setError(errorMessage(e));
                      }
                    }}
                  >
                    {en ? "Stop" : "중단"}
                  </button>
                )}
            </div>
            {diagnostics && (
              <pre>
                {JSON.stringify(
                  {
                    currentNodeId: node?.id,
                    slots: run.slots,
                    events: [...earlierEvents, ...run.events].map((e) => ({
                      seq: e.seq,
                      type: e.type,
                      nodeId: e.nodeId,
                    })),
                  },
                  null,
                  2,
                )}
              </pre>
            )}
            {[...earlierEvents, ...run.events]
              .filter((e) => e.text || e.review || e.approval)
              .map((e) => (
                <article
                  className={`chatbot-message chatbot-message-${e.type === "user" ? "user" : "assistant"}`}
                  key={e.seq}
                >
                  {e.text && (
                    <MessageBody
                      text={e.text}
                      collapse={settings.truncateLongResponses}
                    />
                  )}{" "}
                  {e.review && !readOnly && (
                    <ReviewCard
                      value={e.review}
                      refresh={() => api.refresh()}
                    />
                  )}{" "}
                  {e.approval && !readOnly && (
                    <PolicyCard
                      value={e.approval}
                      refresh={() => api.refresh()}
                    />
                  )}
                </article>
              ))}
            {run.nextCursor && (
              <button
                onClick={() => {
                  setEarlierEvents([
                    ...earlierEvents,
                    ...run.events.filter((e) => e.type !== "approval"),
                  ]);
                  setEventCursor(run.nextCursor!);
                }}
              >
                이후 실행 기록 더 보기
              </button>
            )}
            {run.errorCode && (
              <p role="alert">
                {run.errorCode} ·{" "}
                {en
                  ? "Run did not finish. It will not be retried automatically."
                  : "실행을 완료하지 못했습니다. 자동으로 재실행하지 않습니다."}
              </p>
            )}
          </>
        )}
        {error && <p role="alert">{error}</p>}
      </div>
      {run?.status === "waiting_input" && node && !readOnly && (
        <form
          className="chatbot-scenario-input"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          {node.type === "form" ? (
            <FormFields run={run} values={values} setValues={setValues} />
          ) : replies.length ? (
            <div className="chatbot-actions">
              {replies.map((r) => (
                <button
                  type="button"
                  key={r.value}
                  disabled={busy}
                  onClick={() => void send(String(r.value))}
                >
                  {r.display || r.value}
                </button>
              ))}
            </div>
          ) : ["link", "iframe"].includes(node.type) ? (
            <ScenarioEmbeddedContent key={node.id} node={node} />
          ) : (
            <input
              aria-label={en ? "Scenario input" : "시나리오 입력"}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
            />
          )}{" "}
          {!replies.length && (
            <button className="chatbot-primary" disabled={busy} type="submit">
              {en ? "Submit" : "제출"}
            </button>
          )}
        </form>
      )}
      {readOnly && (
        <p className="chatbot-readonly">
          {en
            ? "Run history is read only."
            : "과거 실행 이력은 읽기 전용입니다."}
        </p>
      )}
    </>
  );
}
