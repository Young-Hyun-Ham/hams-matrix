// app/(content-header)/chatbot/components/emulator/ScenarioEmulator.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useBuilderRuntime as useStore } from "@/app/(builder)/providers/runtime";
import ScenarioNodeControls from "./ScenarioNodeControls";
import useChatbotStore from "./store";
import type { AnyNode, ChatStep } from "./types";
import { makeStepId, resolveTemplate } from "./utils";
import { useEngineLogger } from "./logging";
import { RotateCw } from "lucide-react";
import { IconButton } from "@mui/material";

import {
  useScenarioDefinition,
  type ScenarioDefinitionOverride,
} from "./hooks/useScenarioDefinition";
import { useScenarioHydration } from "./hooks/useScenarioHydration";
import { useScenarioProgress } from "./hooks/useScenarioProgress";
import { useScenarioHistoryAppend } from "./hooks/useScenarioHistoryAppend";
import { useScenarioReset } from "./hooks/useScenarioReset";
import { useScenarioAutoRunner } from "./hooks/useScenarioAutoRunner";

import { findRootNode, resolveExecutableNode } from "./core/graph";

import { runSetSlotNode as runSetSlotNodeImpl } from "./runners/runSetSlotNode";
import { runApiNode as runApiNodeImpl } from "./runners/runApiNode";
import { runLlmNode as runLlmNodeImpl } from "./runners/runLlmNode";

import { createUiHandlers } from "./handlers/createUiHandlers";

export type ScenarioEmulatorProps = {
  headerActions?: ReactNode;
  scenarioKey: string;
  scenarioTitle?: string;

  scenarioRunId: string;

  onHistoryAppend?: (payload: {
    scenarioKey: string;
    scenarioTitle?: string;
    steps: ChatStep[];
    runId?: string;
  }) => void;

  onProgress?: (payload: {
    runId: string;
    steps: ChatStep[];
    finished: boolean;
    currentNodeId: string | null;
    slotValues: Record<string, any>;
    formValues: Record<string, any>;
    deployedVersionId?: string | null;
    resetting?: boolean;
  }) => void;

  onResetRun?: (runId: string) => void;

  initialSteps?: ChatStep[];
  initialFinished?: boolean;
  initialCurrentNodeId?: string | null;
  initialSlotValues?: Record<string, any>;
  initialFormValues?: Record<string, any>;
  initialDeployedVersionId?: string | null;
  /** Builder preview can execute the current, possibly unsaved graph. */
  definitionOverride?: ScenarioDefinitionOverride;
};

export default function ScenarioEmulator({
  headerActions,
  scenarioKey,
  scenarioTitle,
  scenarioRunId,
  onHistoryAppend,
  onProgress,
  onResetRun,
  initialSteps,
  initialFinished,
  initialCurrentNodeId,
  initialSlotValues,
  initialFormValues,
  initialDeployedVersionId,
  definitionOverride,
}: ScenarioEmulatorProps) {
  const abortRef = useRef(new AbortController());
  const cancelPreview = useCallback(() => {
    abortRef.current.abort();
    abortRef.current = new AbortController();
  }, []);
  useEffect(() => {
    abortRef.current = new AbortController();
    return () => {
      abortRef.current.abort();
      useChatbotStore.getState().clearScenarioRun(scenarioRunId);
    };
  }, [scenarioRunId]);

  // =============================================================================
  // 1) 시나리오 데이터 로드
  // =============================================================================
  const { nodes, edges, startNodeId, deployedVersionId } =
    useScenarioDefinition(
      scenarioKey,
      initialDeployedVersionId,
      definitionOverride,
    );

  // =============================================================================
  // 2) store persistence
  // =============================================================================
  const persistedRun = useChatbotStore((s) =>
    scenarioRunId ? s.scenarioRuns[scenarioRunId] : undefined,
  );
  const saveScenarioRun = useChatbotStore((s) => s.saveScenarioRun);
  const clearScenarioRun = useChatbotStore((s) => s.clearScenarioRun);

  // =============================================================================
  // 3) 로컬 상태
  // =============================================================================
  const rootNode = useMemo(() => {
    const configuredStartNode = startNodeId
      ? (nodes.find((node) => node.id === startNodeId) ?? null)
      : null;
    return (
      resolveExecutableNode(nodes, edges, configuredStartNode) ??
      findRootNode(nodes, edges)
    );
  }, [nodes, edges, startNodeId]);

  const [currentNodeId, setCurrentNodeId] = useState<string | null>(
    initialCurrentNodeId ?? null,
  );
  const [steps, setSteps] = useState<ChatStep[]>(initialSteps ?? []);
  const [formValues, setFormValues] = useState<Record<string, any>>(
    initialFormValues ?? {},
  );
  const [slotValues, setSlotValues] = useState<Record<string, any>>(
    initialSlotValues ?? {},
  );
  const [finished, setFinished] = useState<boolean>(initialFinished ?? false);
  const [llmDone, setLlmDone] = useState(false);

  // const currentNode = useMemo(
  //   () => nodes.find((n) => n.id === currentNodeId) ?? null,
  //   [nodes, currentNodeId],
  // );
  const currentNode = nodes.find((n) => n.id === currentNodeId) ?? null;

  // =============================================================================
  // 4) hydration (persisted > initial > root) - 1회만
  // =============================================================================
  const { didHydrate } = useScenarioHydration({
    nodesReady: nodes.length > 0,
    rootNode,
    persistedRun,
    initialSteps,
    initialFinished,
    initialCurrentNodeId,
    initialSlotValues,
    initialFormValues,
    setCurrentNodeId,
    setSteps,
    setSlotValues,
    setFormValues,
    setFinished,
  });

  // =============================================================================
  // 5) 엔진 로깅
  // =============================================================================
  const { logToEngine } = useEngineLogger();
  const { user } = useStore();
  const engineProps = useMemo(
    () => ({
      nodes,
      edges,
      scenarioKey,
      scenarioRunId,
      deployedVersionId,
      userId: user?.id ?? "guest-preview",
    }),
    [nodes, edges, scenarioKey, scenarioRunId, deployedVersionId],
  );

  // =============================================================================
  // 6) step push 유틸
  // text에 {{key}} 그래도 디비에 저장 하고 싶으면?
  // - resolveTemplate(text, slotValues) 제거
  // - display에서 치환 - ChatMessageItem.tsx에서 detailText를 resolveTemplate() 함수를 사용해서 치환 처리
  // =============================================================================
  const pushBotStep = useCallback((id: string, text: string) => {
    setSteps((prev) => [
      ...prev,
      { id, role: "bot", text: resolveTemplate(text, slotValues) },
    ]);
  }, []);

  const pushBotStepOnce = useCallback((id: string, text: string) => {
    setSteps((prev) => {
      if (prev.some((s) => s.id === id)) return prev;
      return [
        ...prev,
        { id, role: "bot", text: resolveTemplate(text, slotValues) },
      ];
    });
  }, []);

  const pushUserStep = useCallback((id: string, text: string) => {
    setSteps((prev) => [...prev, { id, role: "user", text }]);
  }, []);

  // =============================================================================
  // 7) runners (useCallback로 기존 동작 유지)
  // =============================================================================
  const systemPrompt = useChatbotStore((s: any) => s.systemPrompt);

  const runSetSlotNode = useCallback(
    (node: AnyNode) => runSetSlotNodeImpl(node, { formValues, setSlotValues }),
    [formValues],
  );

  const runApiNode = useCallback(
    async (node: AnyNode) =>
      runApiNodeImpl(node, {
        slotValues,
        formValues,
        setSlotValues,
        signal: abortRef.current.signal,
      }),
    [slotValues, formValues],
  );

  const runLlmNode = useCallback(
    async (node: AnyNode, slotSnapshot: Record<string, any>) =>
      runLlmNodeImpl(node, slotSnapshot, {
        systemPrompt,
        model: user?.chatModel ?? null,
        pushBotStep,
        setSteps,
        setSlotValues,
      }),
    [systemPrompt, user?.chatModel, pushBotStep],
  );

  // =============================================================================
  // 8) progress emit + persist
  // =============================================================================
  const resetInFlightRef = useRef(false);
  const { lastProgressSigRef } = useScenarioProgress({
    scenarioRunId,
    scenarioKey,
    scenarioTitle,
    didHydrate,
    resetInFlightRef,
    persistedRun,
    currentNodeId,
    finished,
    steps,
    slotValues,
    formValues,
    deployedVersionId,
    onProgress,
    saveScenarioRun,
  });

  // =============================================================================
  // 9) history append (finished 시 1회)
  // =============================================================================
  const { historyPushedRef } = useScenarioHistoryAppend({
    finished,
    steps,
    slotValues,
    scenarioKey,
    scenarioTitle,
    scenarioRunId,
    onHistoryAppend,
  });

  // =============================================================================
  // 10) reset
  // =============================================================================
  const resetScenario = useScenarioReset({
    cancelPreview,
    rootNodeId: rootNode?.id ?? null,
    scenarioRunId,
    clearScenarioRun,

    resetInFlightRef,
    historyPushedRef,
    lastProgressSigRef,

    setCurrentNodeId,
    setSteps,
    setFormValues,
    setSlotValues,
    setFinished,
    setLlmDone,

    onResetRun,
  });

  // =============================================================================
  // 11) auto runner (노드 자동 실행)
  // =============================================================================
  useScenarioAutoRunner({
    signal: abortRef.current.signal,
    currentNode,
    rootNodeId: rootNode?.id ?? null,
    finished,
    nodes,
    edges,
    slotValues,

    runApiNode,
    runSetSlotNode,
    runLlmNode,

    pushBotStep,
    pushBotStepOnce,

    setCurrentNodeId,
    setFinished,
    setLlmDone,

    logToEngine,
    engineProps,
  });

  // =============================================================================
  // 12) UI handlers (ScenarioNodeControls 연동)
  // =============================================================================
  const {
    handleContinueFromLlm,
    handleBranchClick,
    handleSubmitForm,
    handleNextFromLink,
    handleContinueFromIframe,
    handleSlotFillingClick,
  } = useMemo(
    () =>
      createUiHandlers({
        nodes,
        edges,
        currentNode,
        setCurrentNodeId,
        setFinished,
        formValues,
        setSlotValues,
        pushUserStep,
        logToEngine,
        engineProps,
      }),
    [
      nodes,
      edges,
      currentNode,
      formValues,
      setSlotValues,
      pushUserStep,
      logToEngine,
      engineProps,
    ],
  );

  // =============================================================================
  // 13) render
  // =============================================================================
  return (
    <div className="builder-emulator flex h-full flex-col rounded-xl border border-emerald-100 bg-white/80 p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-emerald-700">
          시나리오 애뮬레이터
        </span>
        <div className="flex items-center gap-1">
          <IconButton
            size="small"
            aria-label="시나리오 초기화"
            title="시나리오 초기화"
            onClick={resetScenario}
            sx={{ p: 0.25 }}
          >
            <RotateCw size={16} />
          </IconButton>
          {headerActions}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden rounded-md bg-emerald-50/40 p-2 text-xs">
        {steps.length === 0 && !currentNode ? (
          <div className="flex h-full items-center justify-center text-[11px] text-gray-500">
            시나리오를 시작하려면 초기화를 눌러주세요.
          </div>
        ) : (
          <div className="space-y-2">
            {steps.map((s) => {
              // UI에서만 치환(현 동작 유지)
              const renderedText = resolveTemplate(s.text, slotValues);
              return (
                <div
                  key={s.id}
                  className={
                    s.role === "bot" ? "flex justify-start" : "flex justify-end"
                  }
                >
                  <div
                    className={
                      s.role === "bot"
                        ? "max-w-[80%] whitespace-pre-wrap break-words rounded-lg bg-white px-2 py-1 text-gray-800 shadow-sm"
                        : "max-w-[80%] whitespace-pre-wrap break-words rounded-lg bg-emerald-600 px-2 py-1 text-white shadow-sm"
                    }
                  >
                    {renderedText}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ScenarioNodeControls
        currentNode={currentNode}
        finished={finished}
        formValues={formValues}
        setFormValues={setFormValues}
        slotValues={slotValues}
        onReset={resetScenario}
        onBranchClick={handleBranchClick}
        onSubmitForm={handleSubmitForm}
        onNextFromLink={handleNextFromLink}
        llmDone={llmDone}
        onContinueFromLlm={handleContinueFromLlm}
        onContinueFromIframe={handleContinueFromIframe}
        onSlotFillingClick={handleSlotFillingClick}
      />
    </div>
  );
}
