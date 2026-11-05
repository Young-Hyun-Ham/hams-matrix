"use client";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  type SetStateAction,
  type Dispatch,
  type ReactNode,
} from "react";
import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import type { User } from "@/lib/types";
import { useSearchParams } from "next/navigation";
import { useWorkspace } from "@/stores/workspace";
import { boardBase, setPlanningAccess } from "../lib/client-api";
type State = {
  aiEnabled: boolean;
  isLoading: boolean;
  canUpdate: boolean;
  canCreateTemplate: boolean;
  status: string;
  members: { id: string; name: string; canReview?: boolean }[];
};
type EditorValues = Record<string, unknown>;
const createEditorStore = () =>
  createStore<{ values: EditorValues }>(() => ({ values: {} }));
const StoreContext = createContext<ReturnType<typeof createEditorStore> | null>(
  null,
);
export function useEditorState<T>(
  key: string,
  initial: T | (() => T) = undefined as T,
): [T, Dispatch<SetStateAction<T>>] {
  const store = useContext(StoreContext);
  if (!store) throw new Error("EditorProvider is required");
  const [fallback] = useState(initial);
  const value = useStore(store, (state) =>
    Object.hasOwn(state.values, key) ? (state.values[key] as T) : fallback,
  );
  const set: Dispatch<SetStateAction<T>> = useCallback(
    (update) =>
      store.setState((state) => {
        const previous = Object.hasOwn(state.values, key)
          ? (state.values[key] as T)
          : fallback;
        return {
          values: {
            ...state.values,
            [key]:
              typeof update === "function"
                ? (update as (previous: T) => T)(previous)
                : update,
          },
        };
      }),
    [store, key, fallback],
  );
  return [value, set];
}
const Context = createContext<State>({
  aiEnabled: false,
  isLoading: true,
  canUpdate: false,
  canCreateTemplate: false,
  status: "draft",
  members: [],
});
export function usePlanningAccess<T>(selector: (state: State) => T) {
  return selector(useContext(Context));
}
export function EditorProvider({
  children,
  initialUser,
}: {
  children: ReactNode;
  initialUser: User;
}) {
  const [ready, setReady] = useState(false);
  const initialized = useRef(false);
  const query = useSearchParams();
  const scopeKey = JSON.stringify([
    query.get("projectId"),
    query.get("screenId"),
  ]);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    useWorkspace.getState().setUser(initialUser);
    setReady(true);
  }, [initialUser]);
  if (!ready) return <p role="status">로그인 확인 중...</p>;
  return (
    <ScopedEditorProvider
      key={scopeKey}
      initialIdentity={`${initialUser.id}:${initialUser.workspaceId}`}
    >
      {children}
    </ScopedEditorProvider>
  );
}

function ScopedEditorProvider({
  children,
  initialIdentity,
}: {
  children: ReactNode;
  initialIdentity: string;
}) {
  const [editorStore] = useState(createEditorStore);
  const [state, setState] = useState<State>({
    aiEnabled: false,
    isLoading: true,
    canUpdate: false,
    canCreateTemplate: false,
    status: "draft",
    members: [],
  });
  const [error, setError] = useState<{
    status: number;
    message: string;
  } | null>(null);
  const [opened, setOpened] = useState(false);
  const retry = useRef<() => void>(() => {});
  useEffect(() => {
    let controller: AbortController | undefined;
    let serial = 0,
      disposed = false,
      updatingUser = false,
      switched = false;
    const identity = (user: User | null) =>
      user ? `${user.id}:${user.workspaceId}` : "";
    const base = boardBase();
    const deny = (status: number, message: string) => {
      setPlanningAccess(false, false);
      // Native dialogs render in the top layer, outside their hidden ancestor.
      document
        .querySelectorAll<HTMLDialogElement>(".planning-root dialog[open]")
        .forEach((dialog) => {
          dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
          dialog.close();
        });
      setState((s) => ({
        ...s,
        aiEnabled: false,
        canUpdate: false,
        canCreateTemplate: false,
        isLoading: false,
      }));
      setError({ status, message });
    };
    const updateUser = (user: User | null) => {
      updatingUser = true;
      useWorkspace.getState().setUser(user);
      updatingUser = false;
    };
    const unsubscribe = useWorkspace.subscribe((next, previous) => {
      if (updatingUser || identity(next.user) === identity(previous.user))
        return;
      switched = true;
      controller?.abort();
      deny(
        409,
        "사용자 또는 워크스페이스가 변경되었습니다. 화면을 다시 열어 주세요.",
      );
    });
    const refresh = async () => {
      if (switched || disposed) return;
      const current = useWorkspace.getState().user;
      if (current && identity(current) !== initialIdentity) {
        switched = true;
        deny(
          409,
          "사용자 또는 워크스페이스가 변경되었습니다. 화면을 다시 열어 주세요.",
        );
        return;
      }
      controller?.abort();
      controller = new AbortController();
      const request = ++serial;
      try {
        const response = await fetch(`${base}/access`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const result = await response.json().catch(() => null);
        if (disposed || switched || request !== serial) return;
        if (!response.ok) {
          if (response.status === 401) updateUser(null);
          deny(
            response.status,
            response.status === 401
              ? "로그인이 만료되었습니다. 다시 로그인해 주세요."
              : response.status === 403
                ? "이 화면에 접근할 권한이 없습니다."
                : response.status === 404
                  ? "화면을 찾을 수 없습니다."
                  : "화면 권한을 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.",
          );
          return;
        }
        if (
          !result ||
          typeof result.user?.id !== "string" ||
          typeof result.user?.workspaceId !== "string"
        )
          throw new Error("Invalid access response");
        if (identity(result.user) !== initialIdentity) {
          switched = true;
          deny(
            409,
            "사용자 또는 워크스페이스가 변경되었습니다. 화면을 다시 열어 주세요.",
          );
          return;
        }
        if (
          typeof result.canUpdate !== "boolean" ||
          typeof result.aiEnabled !== "boolean" ||
          !Array.isArray(result.members)
        )
          throw new Error("Invalid access response");
        updateUser(result.user);
        setState({
          canUpdate: result.canUpdate,
          canCreateTemplate: result.canCreateTemplate === true,
          aiEnabled: result.aiEnabled,
          status: result.status,
          members: result.members,
          isLoading: false,
        });
        setPlanningAccess(true, result.canUpdate);
        setOpened(true);
        setError(null);
      } catch {
        if (
          !disposed &&
          !switched &&
          request === serial &&
          !controller.signal.aborted
        )
          deny(
            503,
            "화면 권한을 확인할 수 없습니다. 연결 상태를 확인하고 다시 시도해 주세요.",
          );
      }
    };
    const onApiError = (event: Event) => {
      const status = (event as CustomEvent<number>).detail;
      if (status === 401) {
        ++serial;
        controller?.abort();
        updateUser(null);
        deny(401, "로그인이 만료되었습니다. 다시 로그인해 주세요.");
      } else void refresh();
    };
    setPlanningAccess(false, false);
    retry.current = () => {
      void refresh();
    };
    void refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("planning:access-error", onApiError);
    const timer = window.setInterval(refresh, 15000);
    return () => {
      disposed = true;
      ++serial;
      controller?.abort();
      unsubscribe();
      setPlanningAccess(false, false);
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("planning:access-error", onApiError);
    };
  }, [initialIdentity]);
  return (
    <Context.Provider value={state}>
      <StoreContext.Provider value={editorStore}>
        {state.isLoading && <p role="status">화면 권한 확인 중...</p>}
        {error && (
          <div role="alert" className="planning-access-error">
            <p>{error.message}</p>
            {error.status === 401 && (
              <a href="/login" target="_blank" rel="noopener noreferrer">
                다시 로그인
              </a>
            )}
            {error.status !== 409 && (
              <button type="button" onClick={() => retry.current()}>
                다시 확인
              </button>
            )}
            {error.status === 409 && (
              <button type="button" onClick={() => window.location.reload()}>
                화면 다시 열기
              </button>
            )}
            {opened && <p>미저장 편집 내용은 이 창에 보관되어 있습니다.</p>}
          </div>
        )}
        {opened && (
          <div hidden={!!error} inert={!!error} className="planning-content">
            {children}
          </div>
        )}
      </StoreContext.Provider>
    </Context.Provider>
  );
}
