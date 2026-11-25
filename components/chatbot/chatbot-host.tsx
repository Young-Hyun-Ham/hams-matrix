"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import type { User } from "@/lib/types";
import type { Settings, Conversation } from "@/lib/chatbot/types";
import { chatbotThemes, defaultSettings } from "@/lib/chatbot/theme-presets";
import {
  Runtime,
  useChatbot,
  useChatbotClient,
  useChatbotQuery,
  errorMessage,
  type Draft,
  type Simulation,
} from "./runtime";
import { ChatbotApprovals } from "./chatbot-approvals";
import { ChatbotSettings } from "./chatbot-settings";
import { ConversationPane, ScenarioPane } from "./chatbot-panes";
import "@/styles/chatbot.css";
const subscribeMounted = () => () => {};
const clientMounted = () => true;
const serverMounted = () => false;
type Session = { type: "chat" | "simulation" | "run-history"; id: string };
export function ChatbotHost({
  user,
  children,
}: {
  user: User;
  children: ReactNode;
}) {
  return (
    <ChatbotRuntime key={`${user.id}:${user.workspaceId}`} user={user}>
      {children}
    </ChatbotRuntime>
  );
}
function ChatbotRuntime({
  user,
  children,
}: {
  user: User;
  children: ReactNode;
}) {
  const [session, setSession] = useState<Session | null>(null),
    [menu, setMenu] = useState(false),
    [history, setHistory] = useState(false),
    [error, setError] = useState("");
  const [drafts, setDrafts] = useState<Record<string, Draft>>({}),
    [last, setLast] = useState<Session | null>(null);
  const saveDraft = useCallback(
    (id: string, draft: Draft) =>
      setDrafts((previous) => ({ ...previous, [id]: draft })),
    [],
  );
  const callback = useRef<(() => void) | undefined>(undefined);
  const active = useRef(true),
    opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const openSimulation = useCallback(
    (config: Simulation, onClose?: () => void) => {
      opener.current = document.activeElement as HTMLElement;
      callback.current = onClose;
      const key = crypto.randomUUID();
      void import("@/lib/query/browser-fetch")
        .then(({ requestJson }) =>
          requestJson<{ id: string }>("/api/chatbot/scenario-runs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...config,
              source: "builder-simulation",
              clientRequestId: key,
            }),
          }),
        )
        .then((result) => {
          if (active.current) {
            setSession({ type: "simulation", id: result.id });
            setError("");
          }
        })
        .catch((e) => {
          if (active.current) {
            setError(errorMessage(e));
            onClose?.();
          }
        });
    },
    [],
  );
  const openScenario = useCallback(
    async (scenarioId: string, conversationId: string) => {
      const { requestJson } = await import("@/lib/query/browser-fetch");
      const result = await requestJson<{ id: string }>(
        "/api/chatbot/scenario-runs",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source: "chatbot",
            scenarioId,
            conversationId,
            clientRequestId: crypto.randomUUID(),
          }),
        },
      );
      callback.current = undefined;
      setSession({ type: "simulation", id: result.id });
    },
    [],
  );
  return (
    <Runtime.Provider
      value={{
        user,
        drafts,
        saveDraft,
        openSimulation,
        openScenario,
        showRunHistory: () => setHistory(true),
      }}
    >
      {children}
      <Layers
        session={session}
        setSession={(next) => {
          if (next) setLast(next);
          setSession(next);
        }}
        last={last}
        menu={menu}
        setMenu={setMenu}
        history={history}
        setHistory={setHistory}
        error={error}
        setError={setError}
        onClose={() => {
          callback.current?.();
          callback.current = undefined;
          opener.current?.focus();
        }}
      />
    </Runtime.Provider>
  );
}
function Layers({
  session,
  setSession,
  last,
  menu,
  setMenu,
  history,
  setHistory,
  error,
  setError,
  onClose,
}: {
  session: Session | null;
  setSession: (v: Session | null) => void;
  last: Session | null;
  menu: boolean;
  setMenu: (v: boolean) => void;
  history: boolean;
  setHistory: (v: boolean) => void;
  error: string;
  setError: (v: string) => void;
  onClose: () => void;
}) {
  const [approvalsOpen, setApprovalsOpen] = useState(false);
  const mounted = useSyncExternalStore(
    subscribeMounted,
    clientMounted,
    serverMounted,
  );
  const [settingsOpen, setSettingsOpen] = useState(false),
    [preview, setPreview] = useState<Settings | null>(null),
    [busy, setBusy] = useState(false),
    [collapsed, setCollapsed] = useState(false);
  const [roomCursor, setRoomCursor] = useState(""),
    [olderRooms, setOlderRooms] = useState<Conversation[]>([]);
  const [edit, setEdit] = useState<{
    id: string;
    title: string;
    version: number;
  } | null>(null);
  const { user } = useChatbot();
  const root = useRef<HTMLDivElement>(null),
    launcher = useRef<HTMLButtonElement>(null),
    api = useChatbotClient();
  const createKey = useRef(crypto.randomUUID());
  const saved = useChatbotQuery<Settings>(
      "settings",
      !!session || menu || history,
    ),
    theme = preview ?? saved.data ?? defaultSettings,
    en = theme.language === "en";
  const rooms = useChatbotQuery<{
    conversations: Conversation[];
    nextCursor: string | null;
  }>(
    `conversations${roomCursor ? `?cursor=${encodeURIComponent(roomCursor)}` : ""}`,
    session?.type === "chat",
  );
  const runs = useChatbotQuery<{
    runs: { id: string; title: string; status: string; createdAt: string }[];
  }>(
    `scenario-runs?source=${history ? "builder-simulation" : "chatbot"}`,
    history || session?.type === "chat",
  );
  async function task(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function newChat() {
    await task(async () => {
      const result = await api.send<{ conversation: Conversation }>(
        "conversations",
        "POST",
        { clientRequestId: createKey.current },
      );
      createKey.current = crypto.randomUUID();
      setRoomCursor("");
      setOlderRooms([]);
      setSession({ type: "chat", id: result.conversation.id });
      setMenu(false);
      await api.refresh();
    });
  }
  async function close() {
    if (session?.type === "chat")
      await task(async () => {
        await api.send("conversations/" + session.id + "/stop");
      });
    if (session?.type === "simulation")
      await task(async () => {
        await api.send(`scenario-runs/${session.id}/stop`);
      });
    setSession(null);
    setSettingsOpen(false);
    setPreview(null);
    onClose();
    launcher.current?.focus();
  }
  useEffect(() => {
    if (!session) return;
    const previous = document.activeElement as HTMLElement | null;
    root.current?.focus();
    return () => {
      if (previous?.isConnected) previous.focus();
    };
  }, [session]);
  const colors =
    chatbotThemes[theme.themePreset as keyof typeof chatbotThemes] ??
    chatbotThemes.orange;
  const style = {
    "--chatbot-accent": colors[0],
    "--chatbot-canvas": colors[1],
    "--chatbot-surface": colors[2],
    "--chatbot-ink": colors[3],
    colorScheme: ["slate", "forest", "charcoal"].includes(theme.themePreset)
      ? "dark"
      : "light",
  } as CSSProperties;
  if (!mounted) return null;
  return createPortal(
    <div
      className="chatbot-root"
      data-chatbot-theme={theme.themePreset}
      style={style}
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        e.stopPropagation();
        if (settingsOpen) {
          setSettingsOpen(false);
          setPreview(null);
        } else if (approvalsOpen) setApprovalsOpen(false);
        else if (history) setHistory(false);
        else if (menu) setMenu(false);
        else if (session) void close();
      }}
    >
      <button
        className="chatbot-launcher"
        ref={launcher}
        aria-label={en ? "Open chatbot menu" : "챗봇 메뉴 열기"}
        aria-expanded={menu}
        onClick={() => setMenu(!menu)}
      >
        ✦
      </button>
      {menu && (
        <>
          <button
            className="chatbot-dismiss"
            aria-label="메뉴 닫기"
            onClick={() => setMenu(false)}
          />
          <nav
            className="chatbot-launcher-menu chatbot-sub-layer"
            aria-label={en ? "Chatbot menu" : "챗봇 메뉴"}
          >
            <button disabled={busy} onClick={newChat}>
              ＋ {en ? "New Chat" : "새 채팅"}
            </button>
            {last && (
              <button
                onClick={() => {
                  setSession(last);
                  setMenu(false);
                }}
              >
                {en ? "Last conversation" : "최근 대화"}
              </button>
            )}
            {["master", "admin", "biz_admin", "team_admin"].includes(
              user.accountRole,
            ) &&
              ["owner", "admin"].includes(user.role) && (
                <button
                  onClick={() => {
                    setMenu(false);
                    setHistory(true);
                  }}
                >
                  {en ? "Simulation history" : "시뮬레이션 실행 이력"}
                </button>
              )}
            {["master", "biz_admin", "team_admin"].includes(
              user.accountRole,
            ) && (
              <button
                onClick={() => {
                  setMenu(false);
                  setApprovalsOpen(true);
                }}
              >
                정책 승인 관리
              </button>
            )}
          </nav>
        </>
      )}
      {error && !session && (
        <div className="chatbot-toast" role="alert">
          {error}
          <button aria-label="오류 닫기" onClick={() => setError("")}>
            ×
          </button>
        </div>
      )}
      {session && (
        <section
          className="chatbot-popup"
          role="dialog"
          aria-modal="false"
          aria-label={en ? "Independent chatbot" : "독립 챗봇"}
          tabIndex={-1}
          ref={root}
        >
          {session.type === "chat" && !collapsed && (
            <aside className="chatbot-history">
              <div className="chatbot-history-top">
                <button
                  onClick={() => setCollapsed(true)}
                  aria-label="이력 접기"
                >
                  ☰
                </button>
                <button onClick={newChat} disabled={busy}>
                  ＋ {en ? "New Chat" : "새 채팅"}
                </button>
              </div>
              <details open>
                <summary>Scenario</summary>
                {runs.data?.runs.map((r) => (
                  <button
                    key={r.id}
                    onClick={() =>
                      setSession({ type: "run-history", id: r.id })
                    }
                  >
                    {r.status === "completed" ? "✓" : "◷"} {r.title}
                  </button>
                ))}
              </details>
              <hr />
              <details open>
                <summary>Chat</summary>
                {[...olderRooms, ...(rooms.data?.conversations ?? [])].map(
                  (r) => (
                    <div
                      className={`chatbot-room ${r.id === session.id ? "selected" : ""}`}
                      key={r.id}
                    >
                      {edit?.id === r.id ? (
                        <>
                          <input
                            aria-label="채팅방 제목"
                            maxLength={100}
                            value={edit.title}
                            onChange={(e) =>
                              setEdit({ ...edit, title: e.target.value })
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Escape") {
                                e.stopPropagation();
                                setEdit(null);
                              }
                              if (e.key === "Enter")
                                void task(async () => {
                                  await api.send(
                                    `conversations/${r.id}`,
                                    "PATCH",
                                    {
                                      title: edit.title,
                                      expectedVersion: edit.version,
                                    },
                                  );
                                  setOlderRooms((previous) =>
                                    previous.map((item) =>
                                      item.id === r.id
                                        ? {
                                            ...item,
                                            title: edit.title,
                                            version: edit.version + 1,
                                          }
                                        : item,
                                    ),
                                  );
                                  setEdit(null);
                                  await api.refresh();
                                });
                            }}
                          />
                          <button
                            onClick={() => setEdit(null)}
                            aria-label="제목 수정 취소"
                          >
                            ×
                          </button>
                          <button
                            onClick={() =>
                              void task(async () => {
                                await api.send(
                                  `conversations/${r.id}`,
                                  "PATCH",
                                  {
                                    title: edit.title,
                                    expectedVersion: edit.version,
                                  },
                                );
                                setOlderRooms((previous) =>
                                  previous.map((item) =>
                                    item.id === r.id
                                      ? {
                                          ...item,
                                          title: edit.title,
                                          version: edit.version + 1,
                                        }
                                      : item,
                                  ),
                                );
                                setEdit(null);
                                await api.refresh();
                              })
                            }
                            aria-label="제목 저장"
                          >
                            ✓
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            className="chatbot-room-title"
                            onClick={() =>
                              setSession({ type: "chat", id: r.id })
                            }
                          >
                            {r.title}
                          </button>
                          <button
                            onClick={() => setEdit(r)}
                            aria-label="채팅방 제목 수정"
                          >
                            ✎
                          </button>
                          <button
                            aria-label="채팅방 삭제"
                            onClick={() => {
                              if (
                                confirm(
                                  en
                                    ? "Delete this chat?"
                                    : "이 채팅방을 삭제할까요?",
                                )
                              )
                                void task(async () => {
                                  await api.send(
                                    `conversations/${r.id}`,
                                    "DELETE",
                                    { expectedVersion: r.version },
                                  );
                                  if (r.id === session.id) setSession(null);
                                  setOlderRooms([]);
                                  setRoomCursor("");
                                  await api.refresh();
                                });
                            }}
                          >
                            ×
                          </button>
                        </>
                      )}
                    </div>
                  ),
                )}
                {rooms.data?.nextCursor && (
                  <button
                    onClick={() => {
                      setOlderRooms([
                        ...olderRooms,
                        ...(rooms.data?.conversations ?? []),
                      ]);
                      setRoomCursor(rooms.data!.nextCursor!);
                    }}
                  >
                    {en ? "Show more" : "더 보기"}
                  </button>
                )}
              </details>
              {rooms.error && (
                <button onClick={() => void rooms.refetch()}>
                  {en ? "Retry history" : "이력 다시 조회"}
                </button>
              )}
            </aside>
          )}
          <div className="chatbot-main">
            <header className="chatbot-header">
              {session.type === "chat" && collapsed && (
                <button
                  onClick={() => setCollapsed(false)}
                  aria-label="이력 펼치기"
                >
                  ☰
                </button>
              )}
              <strong>
                {session.type === "simulation"
                  ? en
                    ? "Scenario Simulator"
                    : "시나리오 시뮬레이터"
                  : "HAMS Chatbot"}
              </strong>
              <button
                onClick={() => {
                  if (saved.data) {
                    setPreview(null);
                    setSettingsOpen(!settingsOpen);
                  } else void saved.refetch();
                }}
                disabled={!saved.data}
                aria-label={en ? "Chatbot settings" : "챗봇 설정"}
              >
                ⚙
              </button>
              <button
                onClick={() => void close()}
                aria-label={en ? "Close chatbot" : "챗봇 닫기"}
              >
                ×
              </button>
            </header>
            {error && (
              <div className="chatbot-error" role="alert">
                {error}
                <button aria-label="오류 닫기" onClick={() => setError("")}>
                  ×
                </button>
              </div>
            )}
            {saved.error && <p role="alert">{errorMessage(saved.error)}</p>}
            {session.type === "chat" ? (
              <ConversationPane
                key={session.id}
                id={session.id}
                settings={theme}
              />
            ) : (
              <ScenarioPane
                key={session.id}
                id={session.id}
                readOnly={session.type === "run-history"}
                settings={theme}
              />
            )}
            {settingsOpen && saved.data && (
              <ChatbotSettings
                saved={saved.data}
                preview={setPreview}
                close={(value) => {
                  setPreview(value ?? null);
                  setSettingsOpen(false);
                }}
              />
            )}
          </div>
        </section>
      )}
      {approvalsOpen && (
        <ChatbotApprovals close={() => setApprovalsOpen(false)} />
      )}
      {history && (
        <section
          className="chatbot-run-history chatbot-sub-layer"
          role="dialog"
          aria-label="시뮬레이션 실행 이력"
        >
          <header>
            <h3>시뮬레이션 실행 이력</h3>
            <button
              onClick={() => setHistory(false)}
              aria-label="실행 이력 닫기"
            >
              ×
            </button>
          </header>
          {runs.error && <p role="alert">{errorMessage(runs.error)}</p>}
          {runs.data?.runs.length === 0 && <p>실행 이력이 없습니다.</p>}
          {runs.data?.runs.map((r) => (
            <button
              key={r.id}
              onClick={() => {
                setHistory(false);
                setSession({ type: "run-history", id: r.id });
              }}
            >
              {r.title} · {r.status} ·{" "}
              {new Date(r.createdAt).toLocaleString("ko-KR", {
                timeZone: "Asia/Seoul",
              })}
            </button>
          ))}
        </section>
      )}
    </div>,
    document.body,
  );
}
