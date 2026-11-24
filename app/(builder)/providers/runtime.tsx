"use client";
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import type { User } from "@/lib/types";
import { useTheme } from "@/stores/theme";
import { useWorkspaceQueryPolicy } from "@/components/query/workspace-query-runtime";
import {
  bindBuilderTransport,
  builderRequest,
  updateBuilderPolicy,
} from "../services/transport";
import { useBuilderStore } from "../store";
import history from "../store/historyStore";
import { builderExecutionStore } from "../store/builderExecutionStore";
import { builderClipboardStore } from "../store/builderClipboardStore";
import { useFormEditorStore } from "../form-builder/stores/useFormEditorStore";
import { BuilderAppearanceContext } from "../components/BuilderAppearance";
import ModalProvider, { useModal } from "./ModalProvider";
import { hasBuilderDraft } from "../services/draftGuard";
import usePreviewStore from "../components/emulator/store";
type Runtime = {
  user: User & { chatModel?: string };
  theme: "light" | "dark";
  backend: "turso";
};
const Context = createContext<Runtime | null>(null);
export function useBuilderRuntime<T = Runtime>(
  select?: (value: Runtime) => T,
): T {
  const value = useContext(Context);
  if (!value) throw new Error("Builder runtime is missing");
  return select ? select(value) : (value as T);
}
function BuilderNavigation({ name }: { name: string }) {
  const router = useRouter(),
    { showConfirm } = useModal();
  return (
    <nav className="builder-nav" aria-label="빌더 이동">
      {[
        ["/dashboard", "Matrix"],
        ["/react-flow/scenario-list", "시나리오"],
        ["/form-builder", "폼 편집"],
      ].map(([href, label]) => (
        <Link
          key={href}
          href={href}
          onClick={(event) => {
            if (
              event.ctrlKey ||
              event.metaKey ||
              event.shiftKey ||
              !hasBuilderDraft()
            )
              return;
            event.preventDefault();
            void showConfirm("저장하지 않은 변경을 버리고 이동할까요?").then(
              (ok) => {
                if (ok) {
                  const initial = useBuilderStore.getInitialState();
                  useBuilderStore.setState({
                    scenario: initial.scenario,
                    nodes: [],
                    edges: [],
                    startNodeId: null,
                  });
                  router.push(href);
                }
              },
            );
          }}
        >
          {label}
        </Link>
      ))}
      <span>{name}</span>
      <ThemeToggle />
    </nav>
  );
}
function reset() {
  usePreviewStore.getState().clear();
  useBuilderStore.setState(useBuilderStore.getInitialState(), true);
  history.getState().clear();
  builderExecutionStore.getState().resetExecution();
  builderClipboardStore.getState().clearClipboard();
  useFormEditorStore.setState(useFormEditorStore.getInitialState(), true);
}
function Entry({ children }: { children: ReactNode }) {
  const path = usePathname(),
    query = useSearchParams(),
    id = query.get("scenarioId"),
    versionId = query.get("versionId");
  const [loading, setLoading] = useState(!!id),
    [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    setError("");
    if (!id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void (async () => {
      const data = await builderRequest("/scenarios/" + encodeURIComponent(id));
      if (!alive) return;
      const state = useBuilderStore.getState();
      if (state.scenario?.id !== id) {
        state.setScenario(data.scenario);
        state.setNodes(data.scenario.nodes);
        state.setEdges(data.scenario.edges);
        state.setStartNodeId(data.scenario.startNodeId);
      }
      useBuilderStore.setState({ selectedVersionId: versionId ?? null });
      await builderRequest(
        "/scenarios/" + encodeURIComponent(id) + "/last-used",
        "POST",
      );
    })()
      .catch((e) => {
        if (alive) setError(e.message ?? "시나리오를 불러오지 못했습니다.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [id, path, versionId]);
  const scenario = useBuilderStore((s) => s.scenario);
  if (error)
    return (
      <div role="alert">
        {error} <Link href="/react-flow/scenario-list">목록으로</Link>
      </div>
    );
  if (loading) return <p role="status">시나리오를 불러오는 중입니다…</p>;
  if (
    !path.endsWith("scenario-list") &&
    path.startsWith("/react-flow/") &&
    !scenario?.id
  )
    return (
      <p>
        시나리오를 먼저 선택해 주세요.{" "}
        <Link href="/react-flow/scenario-list">목록 열기</Link>
      </p>
    );
  return children;
}
export default function BuilderRuntime({
  user,
  children,
}: {
  user: User;
  children: ReactNode;
}) {
  const theme = useTheme((s) => s.theme),
    client = useQueryClient(),
    { scope, policy, settings } = useWorkspaceQueryPolicy();
  const [ready, setReady] = useState(false),
    [error, setError] = useState("");
  const mui = useMemo(
    () =>
      createTheme({
        palette: { mode: theme },
        components: {
          MuiPaper: { styleOverrides: { root: { backgroundImage: "none" } } },
          MuiDialog: {
            defaultProps: {
              slotProps: { paper: { "data-builder-theme": theme } as object },
            },
          },
          MuiMenu: {
            defaultProps: {
              slotProps: { paper: { "data-builder-theme": theme } as object },
            },
          },
        },
      }),
    [theme],
  );
  useLayoutEffect(() => {
    reset();
    const controller = new AbortController();
    const release = bindBuilderTransport({ client, scope, policy, controller });
    let alive = true;
    void builderRequest("/settings")
      .then((data) => {
        if (!alive) return;
        useBuilderStore.getState().setUserInfoJson({
          id: user.id,
          email: user.email,
          username: user.name,
          ...data.settings,
        });
        useBuilderStore.setState({ settingsRevision: data.revision });
        setReady(true);
      })
      .catch((e) => {
        if (alive) setError(e.message ?? "빌더 설정을 불러오지 못했습니다.");
      });
    return () => {
      alive = false;
      release();
      reset();
    };
    // Policy changes must not reset an open editor. The binding's policy is updated separately below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, user.id, user.workspaceId]);
  useEffect(
    () => updateBuilderPolicy(policy, settings.errorMessages),
    [policy, settings.errorMessages],
  );
  const runtime = useMemo<Runtime>(
    () => ({ user, theme, backend: "turso" }),
    [user, theme],
  );
  return (
    <Context.Provider value={runtime}>
      <ThemeProvider theme={mui}>
        <BuilderAppearanceContext.Provider value={theme}>
          <ModalProvider>
            <div className="builder-root" data-builder-theme={theme}>
              <BuilderNavigation name={user.name} />
              <main className="builder-content">
                {error ? (
                  <p role="alert">{error}</p>
                ) : ready ? (
                  <Entry>{children}</Entry>
                ) : (
                  <p role="status">빌더를 준비하는 중입니다…</p>
                )}
              </main>
            </div>
          </ModalProvider>
        </BuilderAppearanceContext.Provider>
      </ThemeProvider>
    </Context.Provider>
  );
}
