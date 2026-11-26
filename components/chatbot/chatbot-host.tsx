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
import { Minimize2Icon } from "lucide-react";
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
  return (
    <Runtime.Provider
      value={{
        user,
        drafts,
        saveDraft,
        openSimulation,
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
  const roomId = session?.type === "chat" ? session.id : null;
  const [panelRoom, setPanelRoom] = useState<string | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [selectedScenario, setSelectedScenario] = useState("");
  const [commandScenario, setCommandScenario] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [run, setRun] = useState<{ id: string; roomId: string } | null>(null);
  const [runStatus, setRunStatus] = useState("");
  const [chatRunning, setChatRunning] = useState(false);
  const [starting, setStarting] = useState(false);
  const startingRef = useRef(false);
  const startKey = useRef<{
    roomId: string;
    scenarioId: string;
    key: string;
  } | null>(null);
  const [panelError, setPanelError] = useState("");
  const panelToggle = useRef<HTMLButtonElement>(null);
  const panelHeading = useRef<HTMLHeadingElement>(null);
  const panelOpen = roomId !== null && panelRoom === roomId;
  const currentRun = run !== null && run.roomId === roomId;
  const liveRun =
    run !== null &&
    !["completed", "failed", "cancelled", "interrupted", "unknown"].includes(
      runStatus,
    );
  const deployments = useChatbotQuery<{
    scenarios: { id: string; name: string }[];
  }>("scenarios", panelOpen && !historyId);
  useEffect(() => {
    if (panelOpen) panelHeading.current?.focus();
  }, [panelOpen]);

  function selectRoom(id: string) {
    if (id !== roomId) {
      setPanelRoom(null);
      setHistoryId(null);
      setSelectedScenario("");
      setCommandScenario(null);
      setPanelError("");
    }
    setSession({ type: "chat", id });
  }
  function hidePanel() {
    setPanelRoom(null);
    panelToggle.current?.focus();
  }
  function openPanel(scenarioId?: string, name?: string) {
    if (!roomId) return;
    setHistoryId(null);
    if (scenarioId && name && !liveRun && !startingRef.current) {
      if (currentRun) setRun(null);
      setSelectedScenario(scenarioId);
      setCommandScenario({ id: scenarioId, name });
    }
    setPanelRoom(roomId);
  }
  async function startScenario() {
    if (
      !roomId ||
      !selectedScenario ||
      startingRef.current ||
      busy ||
      liveRun ||
      chatRunning
    )
      return;
    startingRef.current = true;
    setStarting(true);
    setPanelError("");
    if (
      startKey.current?.roomId !== roomId ||
      startKey.current.scenarioId !== selectedScenario
    )
      startKey.current = {
        roomId,
        scenarioId: selectedScenario,
        key: crypto.randomUUID(),
      };
    try {
      const result = await api.send<{ id: string }>("scenario-runs", "POST", {
        source: "chatbot",
        scenarioId: selectedScenario,
        conversationId: roomId,
        clientRequestId: startKey.current.key,
      });
      startKey.current = null;
      setRunStatus("");
      setRun({ id: result.id, roomId });
      void runs.refetch();
    } catch (e) {
      setPanelError(errorMessage(e));
    } finally {
      startingRef.current = false;
      setStarting(false);
    }
  }
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
    if (startingRef.current || busy) return;
    await task(async () => {
      const result = await api.send<{ conversation: Conversation }>(
        "conversations",
        "POST",
        { clientRequestId: createKey.current },
      );
      createKey.current = crypto.randomUUID();
      setRoomCursor("");
      setOlderRooms([]);
      selectRoom(result.conversation.id);
      setMenu(false);
      await api.refresh();
    });
  }
  async function close() {
    if (startingRef.current || busy) return;
    setBusy(true);
    setError("");
    try {
      if (session?.type === "chat")
        await api.send("conversations/" + session.id + "/stop");
      const activeRunId = session?.type === "simulation" ? session.id : run?.id;
      if (activeRunId && (session?.type === "simulation" || liveRun))
        await api.send("scenario-runs/" + activeRunId + "/stop");
    } catch (e) {
      setError(errorMessage(e));
      return;
    } finally {
      setBusy(false);
    }
    setRun(null);
    setPanelRoom(null);
    setHistoryId(null);
    setSelectedScenario("");
    setCommandScenario(null);
    setPanelError("");
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
        else if (panelOpen) hidePanel();
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
                  if (startingRef.current || busy) return;
                  if (last.type === "chat") selectRoom(last.id);
                  else setSession(last);
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
                    onClick={() => {
                      setHistoryId(r.id);
                      setPanelRoom(roomId);
                    }}
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
                            disabled={starting || busy}
                            onClick={() => {
                              if (!startingRef.current) selectRoom(r.id);
                            }}
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
                            disabled={
                              starting ||
                              busy ||
                              (liveRun && run?.roomId === r.id)
                            }
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
              {roomId && (
                <button
                  type="button"
                  ref={panelToggle}
                  aria-expanded={panelOpen}
                  aria-controls="chatbot-scenario-panel"
                  aria-label={
                    panelOpen
                      ? en
                        ? "Hide scenario panel"
                        : "시나리오 패널 닫기"
                      : en
                        ? "Open scenario panel"
                        : "시나리오 패널 열기"
                  }
                  onClick={() => (panelOpen ? hidePanel() : openPanel())}
                >
                  ▤
                </button>
              )}
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
              <div className="chatbot-workspace" data-panel-open={panelOpen}>
                <div className="chatbot-chat-column">
                  <ConversationPane
                    key={session.id}
                    id={session.id}
                    settings={theme}
                    onScenario={openPanel}
                    onRunning={setChatRunning}
                  />
                </div>
                <aside
                  id="chatbot-scenario-panel"
                  className="chatbot-scenario-panel"
                  aria-labelledby="chatbot-scenario-title"
                  hidden={!panelOpen}
                >
                  <header className="chatbot-scenario-header">
                    <h2
                      id="chatbot-scenario-title"
                      tabIndex={-1}
                      ref={panelHeading}
                    >
                      {en ? "Scenario" : "시나리오 실행"}
                    </h2>
                    <button
                      type="button"
                      aria-expanded={panelOpen}
                      aria-controls="chatbot-scenario-panel"
                      aria-label={
                        en ? "Hide scenario panel" : "시나리오 패널 숨기기"
                      }
                      onClick={hidePanel}
                    >
                      <Minimize2Icon size={14} />
                    </button>
                  </header>
                  {historyId && currentRun && (
                    <button type="button" onClick={() => setHistoryId(null)}>
                      {en ? "Current run" : "현재 실행"}
                    </button>
                  )}
                  {run && (
                    <div
                      className="chatbot-scenario-content"
                      hidden={!currentRun || !!historyId}
                    >
                      <ScenarioPane
                        key={run.id}
                        id={run.id}
                        settings={theme}
                        visible={panelOpen && currentRun && !historyId}
                        onStatus={setRunStatus}
                      />
                      {currentRun && !liveRun && (
                        <button type="button" onClick={() => setRun(null)}>
                          {en ? "New run" : "새 실행"}
                        </button>
                      )}
                    </div>
                  )}
                  {historyId ? (
                    <div className="chatbot-scenario-content">
                      <ScenarioPane
                        key={historyId}
                        id={historyId}
                        settings={theme}
                        visible={panelOpen}
                        readOnly
                      />
                    </div>
                  ) : (
                    !currentRun && (
                      <div className="chatbot-scenario-picker">
                        {deployments.isFetching && (
                          <p role="status">
                            {en
                              ? "Loading scenarios…"
                              : "시나리오 불러오는 중…"}
                          </p>
                        )}
                        {deployments.error && (
                          <p role="alert">
                            {errorMessage(deployments.error)}{" "}
                            <button
                              type="button"
                              onClick={() => void deployments.refetch()}
                            >
                              {en ? "Retry" : "다시 조회"}
                            </button>
                          </p>
                        )}
                        {deployments.data?.scenarios.length === 0 &&
                          !commandScenario && (
                            <p>
                              {en
                                ? "No deployed scenarios."
                                : "배포된 시나리오가 없습니다."}
                            </p>
                          )}
                        <select
                          aria-label={
                            en ? "Deployed scenarios" : "배포 시나리오"
                          }
                          value={selectedScenario}
                          disabled={starting || liveRun}
                          onChange={(e) => setSelectedScenario(e.target.value)}
                        >
                          <option value="">
                            {en ? "Select scenario" : "시나리오 선택"}
                          </option>
                          {commandScenario &&
                            !deployments.data?.scenarios.some(
                              (item) => item.id === commandScenario.id,
                            ) && (
                              <option value={commandScenario.id}>
                                {commandScenario.name}
                              </option>
                            )}
                          {deployments.data?.scenarios.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name}
                            </option>
                          ))}
                        </select>
                        <button
                          className="chatbot-primary"
                          type="button"
                          disabled={
                            !selectedScenario ||
                            starting ||
                            busy ||
                            liveRun ||
                            chatRunning
                          }
                          onClick={() => void startScenario()}
                        >
                          {en ? "Run" : "실행"}
                        </button>
                        {liveRun && run && (
                          <p>
                            {en
                              ? "A scenario is running in another chat."
                              : "다른 채팅방에 진행 중인 시나리오가 있습니다."}{" "}
                            <button
                              type="button"
                              onClick={() => {
                                selectRoom(run.roomId);
                                setPanelRoom(run.roomId);
                              }}
                            >
                              {en ? "Open run" : "실행으로 이동"}
                            </button>
                          </p>
                        )}
                        {panelError && <p role="alert">{panelError}</p>}
                      </div>
                    )
                  )}
                </aside>
              </div>
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
