"use client";
import { AiProjectPicker } from "./ai-project-picker";

import { useWorkspaceErrorState } from "@/components/query/use-workspace-error-state";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useWorkspace } from "@/stores/workspace";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWorkspaceMutation as useMutation } from "@/components/query/use-workspace-mutation";
import { useWorkspaceQueryPolicy } from "@/components/query/workspace-query-runtime";
import { matrixKeys } from "@/lib/query/keys";
import { requestJson } from "@/lib/query/browser-fetch";
import { resolveWorkspaceError } from "@/lib/query/error-messages";
import type { SetStateAction } from "react";
import type { AiConversation } from "@/lib/ai-context";
import { Icon } from "@/components/icon";
import { AiConversationRoom } from "./ai-conversation-room";
import { AiConversationDialog } from "./ai-conversation-dialog";
import "@/styles/ai-chatbot.css";
import { NavigationTooltip } from "@/components/shared/navigation-tooltip";
import { toast } from "@/stores/toast";
import { targetFromLocation } from "@/lib/ai-target-pages";

export function AiChatbotToggle({
  collapsed = false,
  tooltipResetKey = "",
  label = "AI Chatbot",
}: {
  collapsed?: boolean;
  tooltipResetKey?: string;
  label?: string;
}) {
  const { aiMenuOpen, setAiMenuOpen, aiContext, user, aiConversationVersion } =
    useWorkspace();
  return (
    <ConversationList
      key={`${user?.id}:${user?.workspaceId}:${aiContext.projectId}:${aiContext.pathname}`}
      version={aiConversationVersion}
      visible={aiMenuOpen && !collapsed}
      Toggle={({ create, creating, ready }) => (
        <div>
          <NavigationTooltip label={label} resetKey={tooltipResetKey}>
            <button
              type="button"
              className={`nav-item ${aiMenuOpen ? "active" : ""}`}
              aria-label={label}
              aria-expanded={aiMenuOpen && !collapsed}
              aria-controls="matrix-ai-conversations"
              disabled={collapsed && (!ready || creating)}
              onClick={() => {
                if (collapsed) void create();
                else setAiMenuOpen(!aiMenuOpen);
              }}
            >
              <Icon name="chatbot" size={19} />
              <span className="nav-label">{label}</span>
              <Icon
                name={aiMenuOpen ? "down" : "chevron"}
                size={14}
                className="matrix-ai-chevron"
              />
            </button>
          </NavigationTooltip>
        </div>
      )}
    />
  );
}
function ConversationList({
  version,
  visible,
  Toggle,
}: {
  version: number;
  visible: boolean;
  Toggle: React.ComponentType<{
    create: () => Promise<void>;
    creating: boolean;
    ready: boolean;
  }>;
}) {
  const { aiContext, aiProject, aiConversation, selectAiConversation, user } =
    useWorkspace();
  const projectId = aiContext.projectId || aiProject.id;
  const pathname = usePathname();
  const requiresProject =
    pathname.startsWith("/projects/") ||
    [
      "/requirements",
      "/screens",
      "/specifications",
      "/history",
      "/deliverables",
    ].includes(pathname);
  const ready =
    !!user &&
    aiContext.pathname === pathname &&
    !!targetFromLocation(
      aiContext.projectId,
      aiContext.pathname,
      aiContext.tab,
    ) &&
    (!requiresProject || !!aiContext.projectId);
  const { scope, policy, settings } = useWorkspaceQueryPolicy();
  const client = useQueryClient();
  const queryKey = [
    ...matrixKeys.scope(scope),
    "project",
    projectId,
    "conversations",
  ];
  const listing = useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      requestJson<{ conversations: AiConversation[] }>(
        `/api/ai/conversations?projectId=${encodeURIComponent(projectId)}`,
        { signal },
      ),
    ...policy,
    enabled: ready && visible,
  });
  const rooms = listing.data?.conversations ?? [];
  const setRooms = (action: SetStateAction<AiConversation[]>) =>
    client.setQueryData<{ conversations: AiConversation[] }>(
      queryKey,
      (current) => ({
        conversations:
          typeof action === "function"
            ? action(current?.conversations ?? [])
            : action,
      }),
    );
  const command = useMutation({
    mutationFn: (input: object) =>
      requestJson<{ conversation: AiConversation }>("/api/ai/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }),
    retry: false,
  });
  const [expanded, setExpanded] = useState(false);
  const [action, setAction] = useState<{
    room: AiConversation;
    kind: "rename" | "delete";
  } | null>(null);
  const [creating, setCreating] = useState(false);
  const loading = listing.isLoading;
  const [localError, setError] = useWorkspaceErrorState(""),
    [retry, setRetry] = useState(0);
  const active = useRef(true),
    creatingRef = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const error =
    localError || resolveWorkspaceError(listing.error, settings.errorMessages);
  useEffect(() => {
    if (ready && visible)
      void client.invalidateQueries({
        queryKey: [
          ...matrixKeys.scope(scope),
          "project",
          projectId,
          "conversations",
        ],
      });
  }, [client, scope, ready, projectId, version, retry, visible]);
  async function create() {
    if (!ready || creatingRef.current) return;
    creatingRef.current = true;
    setCreating(true);
    setError("");
    if (!projectId) {
      const now = new Date().toISOString();
      selectAiConversation({
        convId: `draft-${crypto.randomUUID()}`,
        projectId: "",
        title: "새 채팅",
        isPinned: false,
        createdAt: now,
        updatedAt: now,
        targetPage: null,
        targetVersion: 0,
      });
      creatingRef.current = false;
      setCreating(false);
      return;
    }
    try {
      const data = await command.mutateAsync({
        projectId,
        targetPage: aiContext.projectId
          ? targetFromLocation(projectId, aiContext.pathname, aiContext.tab)
          : "project-analysis",
        sourceContext: { pathname: aiContext.pathname, tab: aiContext.tab },
      });
      void client.invalidateQueries({ queryKey });
      // Do not open a response for a previous user, project, or page.
      if (
        active.current &&
        useWorkspace.getState().aiContext.pathname === aiContext.pathname &&
        useWorkspace.getState().aiContext.tab === aiContext.tab &&
        (useWorkspace.getState().aiContext.projectId ||
          useWorkspace.getState().aiProject.id) === projectId &&
        useWorkspace.getState().user?.id === scope.userId &&
        useWorkspace.getState().user?.workspaceId === scope.workspaceId
      ) {
        selectAiConversation(data.conversation);
        useWorkspace.getState().refreshAiConversations();
      }
    } catch (error) {
      if (active.current) {
        setError(error);
        if (!visible)
          toast(resolveWorkspaceError(error, settings.errorMessages), true);
      }
    } finally {
      creatingRef.current = false;
      if (active.current) setCreating(false);
    }
  }
  function updateRoom(room: AiConversation) {
    setRooms((current) =>
      current
        .map((item) => (item.convId === room.convId ? room : item))
        .sort(
          (a, b) =>
            Number(b.isPinned) - Number(a.isPinned) ||
            b.updatedAt.localeCompare(a.updatedAt) ||
            b.convId.localeCompare(a.convId),
        ),
    );
  }
  function closeAction() {
    const id = action?.room.convId;
    setAction(null);
    requestAnimationFrame(() => {
      const button = Array.from(
        document.querySelectorAll<HTMLButtonElement>("[data-room-options]"),
      ).find((item) => item.dataset.roomOptions === id);
      (
        button ??
        document.querySelector<HTMLButtonElement>(".matrix-ai-project-toggle")
      )?.focus();
    });
  }
  return (
    <div className="matrix-ai-navigation">
      <Toggle create={create} creating={creating} ready={ready} />
      {visible && (
        <div id="matrix-ai-conversations" className="matrix-ai-conversations">
          <AiProjectPicker />
          <button
            type="button"
            className="matrix-ai-project-toggle"
            aria-expanded={expanded}
            aria-controls="matrix-ai-project-chats"
            onClick={() => setExpanded(!expanded)}
          >
            <span
              title={
                aiContext.projectName || aiProject.name || "공통 작업 공간"
              }
            >
              {aiContext.projectName ||
                aiProject.name ||
                (requiresProject ? "프로젝트 선택" : "공통 작업 공간")}
            </span>
            <Icon name={expanded ? "down" : "chevron"} size={15} />
          </button>
          {expanded && (
            <div id="matrix-ai-project-chats">
              <button
                type="button"
                className="matrix-ai-new-chat"
                disabled={!ready || creating}
                onClick={() => void create()}
              >
                {creating ? "생성 중…" : "+ 새 채팅"}
              </button>
              {error && (
                <p role="alert">
                  {error}
                  <button type="button" onClick={() => setRetry((v) => v + 1)}>
                    다시 시도
                  </button>
                </p>
              )}
              {!ready ? (
                <p>
                  프로젝트를 선택하거나 불러오기가 끝난 뒤 채팅을 시작해 주세요.
                </p>
              ) : loading ? (
                <p role="status">채팅방을 불러오는 중입니다.</p>
              ) : !rooms.length ? (
                <p style={{ marginTop: 5, textAlign: "center" }}>
                  새 채팅을 만들어 대화를 시작하세요.
                </p>
              ) : (
                <ul aria-label="채팅방 목록">
                  {rooms.map((room) => (
                    <AiConversationRoom
                      key={room.convId}
                      room={room}
                      selected={aiConversation?.convId === room.convId}
                      onSelect={() => selectAiConversation(room)}
                      onEdit={(kind) => setAction({ room, kind })}
                      onUpdate={(changed) => {
                        updateRoom(changed);
                        useWorkspace.getState().updateAiConversation(changed);
                      }}
                      onError={setError}
                    />
                  ))}
                </ul>
              )}
            </div>
          )}
          {action && (
            <AiConversationDialog
              key={`${action.kind}:${action.room.convId}`}
              room={action.room}
              kind={action.kind}
              onClose={closeAction}
              onUpdate={updateRoom}
              onRemove={(id) =>
                setRooms((current) =>
                  current.filter((room) => room.convId !== id),
                )
              }
            />
          )}
        </div>
      )}
    </div>
  );
}
