import { useCallback, useRef, useEffect } from "react";
import { resolveGroupApiNextNode } from "@/app/(builder)/core/scenario-core/src/engine/groupApiRouting";
import { useTranslation } from "@/app/(builder)/hooks/useTranslation";

import { useBuilderStore } from "../../../store/index";
import {
  builderExecutionStore,
  type ExecutionLog,
  type ExecutionPhase,
} from "../../../store/builderExecutionStore";
import {
  evaluateCondition,
  getNestedValue,
  interpolateMessage,
} from "../../../utils/simulatorUtils";

type BuilderNode = {
  id: string;
  type: string;
  data?: any;
  parentNode?: string;
};

type BuilderEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
};

type UseBuilderExecutionArgs = {
  nodes: BuilderNode[];
  edges: BuilderEdge[];
};

type RunNodeResult = {
  slots: Record<string, unknown>;
  nextNode: BuilderNode | null;
  payload?: any;
  waitForUser?: boolean;
  waitMessage?: string;
};

type FormElement = {
  id?: string;
  name?: string;
  type?: string;
  selectKind?: string;
  defaultValue?: unknown;
  options?: Array<string | { value?: string; param?: string }>;
  sendByOption?: boolean;
  allowDeselection?: boolean;
};

type FormInputValues = Record<string, unknown>;

const now = () => new Date().toISOString();

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

export function useBuilderExecution({ nodes, edges }: UseBuilderExecutionArgs) {
  const { t } = useTranslation();
  const startNodeId = useBuilderStore((state: any) => state.startNodeId);
  const anchorNodeId = useBuilderStore((state: any) => state.anchorNodeId);
  const setSlots = useBuilderStore((state: any) => state.setSlots);

  const openBranchSelection = builderExecutionStore(
    (state) => state.openBranchSelection,
  );
  const closeBranchSelection = builderExecutionStore(
    (state) => state.closeBranchSelection,
  );
  const openFormInput = builderExecutionStore((state) => state.openFormInput);
  const closeFormInput = builderExecutionStore((state) => state.closeFormInput);

  const pendingBranchNodeRef = useRef<BuilderNode | null>(null);
  const pendingFormNodeRef = useRef<BuilderNode | null>(null);

  const branchSelectionResolverRef = useRef<
    ((reply: { display: string; value: string } | null) => void) | null
  >(null);
  const formInputResolverRef = useRef<
    ((values: FormInputValues | null) => void) | null
  >(null);

  // 선택 대기 함수
  const requestBranchSelection = useCallback(
    (node: BuilderNode, replies: Array<{ display: string; value: string }>) => {
      return new Promise<{ display: string; value: string } | null>(
        (resolve) => {
          pendingBranchNodeRef.current = node;
          branchSelectionResolverRef.current = resolve;

          openBranchSelection({
            nodeId: node.id,
            nodeType: node.type,
            title: node.data?.content ?? t("Select Branch"),
            replies,
          });
        },
      );
    },
    [openBranchSelection],
  );

  const selectBranchReply = useCallback(
    (replyValue: string) => {
      const node = pendingBranchNodeRef.current;
      if (!node) return;

      const replies = node.data?.replies ?? [];
      const selectedReply =
        replies.find((r: any) => r?.value === replyValue) ?? null;

      const resolve = branchSelectionResolverRef.current;
      branchSelectionResolverRef.current = null;
      pendingBranchNodeRef.current = null;
      closeBranchSelection();

      resolve?.(selectedReply);
    },
    [closeBranchSelection],
  );

  const cancelBranchReplySelection = useCallback(() => {
    const resolve = branchSelectionResolverRef.current;
    branchSelectionResolverRef.current = null;
    pendingBranchNodeRef.current = null;
    closeBranchSelection();

    resolve?.(null);
  }, [closeBranchSelection]);

  const getInitialFormValues = useCallback(
    (node: BuilderNode, currentSlots: Record<string, unknown>) => {
      const initialValues: FormInputValues = {};
      const elements = node.data?.elements ?? [];

      elements.forEach((element: FormElement, index: number) => {
        const key =
          element?.name?.trim() ||
          element?.id ||
          `${element?.type || "element"}-${index}`;
        if (!key) return;

        if (element.type === "checkbox") {
          if (element.sendByOption) {
            const selectedValues = Array.isArray(element.defaultValue)
              ? element.defaultValue.map(String)
              : [];
            initialValues[key] = Object.fromEntries(
              (element.options ?? []).map((option) => {
                const value =
                  typeof option === "string"
                    ? option
                    : String(option.value ?? "");
                const param =
                  typeof option === "string"
                    ? option
                    : option.param?.trim() || value;
                return [param, selectedValues.includes(value) ? "Y" : "N"];
              }),
            );
            return;
          }

          initialValues[key] = Array.isArray(element.defaultValue)
            ? element.defaultValue
            : [];
          return;
        }

        if (element.type === "radio" && element.sendByOption) {
          const selectedValue = String(element.defaultValue ?? "");
          initialValues[key] = Object.fromEntries(
            (element.options ?? []).map((option) => {
              const value =
                typeof option === "string"
                  ? option
                  : String(option.value ?? "");
              const param =
                typeof option === "string"
                  ? option
                  : option.param?.trim() || value;
              return [param, value === selectedValue ? "Y" : "N"];
            }),
          );
          return;
        }

        if (element.type === "dropbox" && element.selectKind === "multi") {
          initialValues[key] = Array.isArray(element.defaultValue)
            ? element.defaultValue
            : element.defaultValue
              ? [element.defaultValue]
              : [];
          return;
        }

        if (element.defaultValue !== undefined && element.defaultValue !== "") {
          initialValues[key] = interpolateMessage(
            String(element.defaultValue),
            currentSlots,
          );
          return;
        }

        initialValues[key] = "";
      });

      return initialValues;
    },
    [],
  );

  const requestFormInput = useCallback(
    (node: BuilderNode, currentSlots: Record<string, unknown>) => {
      return new Promise<FormInputValues | null>((resolve) => {
        const elements = node.data?.elements ?? [];
        const initialValues = getInitialFormValues(node, currentSlots);

        pendingFormNodeRef.current = node;
        formInputResolverRef.current = resolve;

        openFormInput({
          nodeId: node.id,
          nodeType: node.type,
          title: node.data?.title ?? t("Form input"),
          slotKey: node.data?.slotKey,
          elements,
          initialValues,
          slots: currentSlots,
        });
      });
    },
    [getInitialFormValues, openFormInput],
  );

  const submitFormInput = useCallback(
    (values: FormInputValues) => {
      const resolve = formInputResolverRef.current;
      formInputResolverRef.current = null;
      pendingFormNodeRef.current = null;
      closeFormInput();

      resolve?.(values);
    },
    [closeFormInput],
  );

  const cancelFormInput = useCallback(() => {
    const resolve = formInputResolverRef.current;
    formInputResolverRef.current = null;
    pendingFormNodeRef.current = null;
    closeFormInput();

    resolve?.(null);
  }, [closeFormInput]);

  const executionRunning = builderExecutionStore(
    (state) => state.executionRunning,
  );
  const resetExecution = builderExecutionStore((state) => state.resetExecution);
  const startExecution = builderExecutionStore((state) => state.startExecution);
  const setExecutionCurrentNode = builderExecutionStore(
    (state) => state.setExecutionCurrentNode,
  );
  const markExecutionCompleted = builderExecutionStore(
    (state) => state.markExecutionCompleted,
  );
  const appendExecutionLog = builderExecutionStore(
    (state) => state.appendExecutionLog,
  );
  const finishExecution = builderExecutionStore(
    (state) => state.finishExecution,
  );
  const failExecution = builderExecutionStore((state) => state.failExecution);
  const cancelExecution = builderExecutionStore(
    (state) => state.cancelExecution,
  );

  const cancelRef = useRef(false);
  const requestRef = useRef(new AbortController());
  const inFlightRef = useRef(false);

  const log = useCallback(
    (phase: ExecutionPhase, meta: Partial<ExecutionLog> = {}) => {
      const entry: ExecutionLog = {
        at: now(),
        phase,
        ...meta,
      };

      appendExecutionLog(entry);

      if (phase === "error") {
        console.error("[builder-execution]", entry);
      } else {
        // console.log("[builder-execution]", entry);
      }
    },
    [appendExecutionLog],
  );

  const assertNotCanceled = useCallback(() => {
    if (cancelRef.current) {
      throw new Error("Execution canceled by user.");
    }
  }, []);

  const getNodeById = useCallback(
    (nodeId: string | null | undefined) => {
      if (!nodeId) return null;
      return nodes.find((node) => node.id === nodeId) ?? null;
    },
    [nodes],
  );

  const findNextNode = useCallback(
    (sourceNodeId: string, sourceHandle?: string | null) => {
      const groupApiNext = resolveGroupApiNextNode(
        { nodes: nodes as any, edges, version: "1.0" },
        sourceNodeId,
        sourceHandle ?? null,
      );
      if (groupApiNext) return groupApiNext;
      let nextEdge: BuilderEdge | undefined;

      if (sourceHandle && groupApiNext === undefined) {
        nextEdge = edges.find(
          (edge) =>
            edge.source === sourceNodeId && edge.sourceHandle === sourceHandle,
        );
      }

      if (!nextEdge && groupApiNext === undefined) {
        const sourceNode = getNodeById(sourceNodeId);
        nextEdge =
          edges.find(
            (edge) =>
              edge.source === sourceNodeId && edge.sourceHandle === "default",
          ) ||
          edges.find(
            (edge) =>
              (edge.source === sourceNodeId && sourceHandle == null) ||
              (sourceHandle === "" &&
                !(
                  sourceNode?.type === "scenario" ||
                  sourceNode?.type === "selectionGroup"
                )),
            // (edge.sourceHandle == null || edge.sourceHandle === ''),
          );
      }

      if (!nextEdge) {
        const sourceNode = getNodeById(sourceNodeId);
        let parentNodeId = sourceNode?.parentNode;

        while (parentNodeId) {
          const parentNode = getNodeById(parentNodeId);
          if (!parentNode) break;

          if (
            parentNode.type === "scenario" ||
            parentNode.type === "selectionGroup"
          ) {
            const parentNextEdge =
              edges.find(
                (edge) =>
                  edge.source === parentNode.id &&
                  edge.sourceHandle === "default",
              ) ||
              edges.find(
                (edge) =>
                  edge.source === parentNode.id &&
                  (edge.sourceHandle == null || edge.sourceHandle === ""),
              );

            return parentNextEdge ? getNodeById(parentNextEdge.target) : null;
          }

          parentNodeId = parentNode.parentNode;
        }

        return null;
      }
      return getNodeById(nextEdge.target);
    },
    [nodes, edges, getNodeById],
  );

  const getChildNodes = useCallback(
    (parentNodeId: string) =>
      nodes.filter((node) => node.parentNode === parentNodeId),
    [nodes],
  );

  const findGroupEntryNode = useCallback(
    (groupNode: BuilderNode) => {
      const childNodes = getChildNodes(groupNode.id);
      if (childNodes.length === 0) return null;

      if (groupNode.type === "selectionGroup" && groupNode.data?.entryNodeId) {
        const explicit = childNodes.find(
          (node) => node.id === groupNode.data.entryNodeId,
        );
        if (explicit) return explicit;
      }

      const childIds = new Set(childNodes.map((node) => node.id));

      return (
        childNodes.find(
          (node) =>
            !edges.some(
              (edge) => edge.target === node.id && childIds.has(edge.source),
            ),
        ) ?? null
      );
    },
    [edges, getChildNodes],
  );

  const resolveBranchHandle = useCallback(
    (node: BuilderNode, currentSlots: Record<string, unknown>) => {
      const conditions = node.data?.conditions ?? [];
      const replies = node.data?.replies ?? [];

      for (let i = 0; i < conditions.length; i += 1) {
        const condition = conditions[i];
        const reply = replies[i];
        if (!condition || !reply?.value) continue;

        const slotValue = getNestedValue(currentSlots, condition.slot);
        const matched = evaluateCondition(
          slotValue,
          condition.operator,
          condition,
          currentSlots,
        );

        if (matched) {
          return reply.value;
        }
      }

      return "default";
    },
    [],
  );

  const applySetSlotAssignments = useCallback(
    (node: BuilderNode, currentSlots: Record<string, unknown>) => {
      const nextSlots = { ...currentSlots };
      const assignments = node.data?.assignments ?? [];

      assignments.forEach((assignment: any) => {
        if (!assignment?.key) return;

        const interpolated = interpolateMessage(
          assignment.value ?? "",
          nextSlots,
        );

        const text = String(interpolated ?? "").trim();

        try {
          if (
            (text.startsWith("{") && text.endsWith("}")) ||
            (text.startsWith("[") && text.endsWith("]"))
          ) {
            nextSlots[assignment.key] = JSON.parse(text);
            return;
          }
        } catch {
          // fall through
        }

        if (text.toLowerCase() === "true") {
          nextSlots[assignment.key] = true;
          return;
        }

        if (text.toLowerCase() === "false") {
          nextSlots[assignment.key] = false;
          return;
        }

        if (text !== "" && !Number.isNaN(Number(text))) {
          nextSlots[assignment.key] = Number(text);
          return;
        }

        nextSlots[assignment.key] = interpolated;
      });

      return nextSlots;
    },
    [],
  );

  const applyFormInputValues = useCallback(
    (node: BuilderNode, currentSlots: Record<string, unknown>) => {
      const nextSlots = { ...currentSlots };
      const formValues: Record<string, unknown> = {};
      const elements = node.data?.elements ?? [];

      elements.forEach((element: FormElement, index: number) => {
        const key =
          element?.name?.trim() ||
          element?.id ||
          `${element?.type || "element"}-${index}`;
        if (!key) return;
        const value = currentSlots[key];
        nextSlots[key] = value;
        formValues[key] = value;
      });

      if (node.data?.slotKey && Object.keys(formValues).length > 0) {
        nextSlots[node.data.slotKey] = formValues;
      }

      return {
        nextSlots,
        formValues,
      };
    },
    [],
  );

  const executeApiNode = useCallback(
    async (
      node: BuilderNode,
      currentSlots: Record<string, unknown>,
    ): Promise<RunNodeResult> => {
      const isMulti = Boolean(node.data?.isMulti);
      const apiCalls = isMulti ? (node.data?.apis ?? []) : [node.data];

      const processApiCall = async (apiCall: any) => {
        const method = String(apiCall?.method ?? "GET").toUpperCase();
        const url = interpolateMessage(apiCall?.url ?? "", currentSlots);

        let headers: Record<string, string> = {};
        try {
          headers = JSON.parse(
            interpolateMessage(apiCall?.headers ?? "{}", currentSlots),
          );
        } catch {
          headers = {};
        }

        const init: RequestInit = {
          method,
          headers: {
            "Content-Type": "application/json",
            ...headers,
          },
        };

        if (method === "GET" || method === "HEAD") {
          delete (init.headers as Record<string, string>)["Content-Type"];
        } else {
          const body = interpolateMessage(apiCall?.body ?? "{}", currentSlots);
          init.body = body;
        }

        const response = await fetch(url, {
          ...init,
          signal: requestRef.current.signal,
        });
        const data = await response.json().catch(() => null);
        assertNotCanceled();

        if (!response.ok) {
          throw new Error(
            `API call failed (${response.status}) ${response.statusText}`,
          );
        }

        return {
          data,
          mapping: apiCall?.responseMapping ?? [],
          name: apiCall?.name ?? "api",
        };
      };

      try {
        const results = await Promise.all(apiCalls.map(processApiCall));
        const nextSlots = { ...currentSlots };

        results.forEach((result) => {
          (result.mapping ?? []).forEach((mapping: any) => {
            if (!mapping?.path || !mapping?.slot) return;
            const value = getNestedValue(result.data, mapping.path);
            if (value !== undefined) {
              nextSlots[mapping.slot] = value;
            }
          });
        });

        setSlots(nextSlots);

        return {
          slots: nextSlots,
          nextNode: findNextNode(node.id, "onSuccess"),
          payload: {
            status: "success",
            apiCount: results.length,
            results,
          },
        };
      } catch (error: any) {
        const errorNextNode = findNextNode(node.id, "onError");

        const parent = getNodeById(node.parentNode);
        if (!errorNextNode && parent?.type !== "selectionGroup") {
          throw new Error(
            error?.message ||
              "API request failed and no onError edge is connected.",
          );
        }

        return {
          slots: currentSlots,
          nextNode: errorNextNode,
          payload: {
            status: "error",
            message: error?.message || "API request failed",
            method: node.data?.method ?? null,
            url: node.data?.url ?? null,
          },
        };
      }
    },
    [findNextNode, getNodeById, setSlots],
  );

  const executeLlmNode = useCallback(
    async (
      node: BuilderNode,
      currentSlots: Record<string, unknown>,
    ): Promise<RunNodeResult> => {
      void node;
      void currentSlots;
      throw new Error("Builder LLM execution is not configured.");
    },
    [assertNotCanceled, findNextNode, setSlots],
  );

  const runNode = useCallback(
    async (
      node: BuilderNode,
      currentSlots: Record<string, unknown>,
    ): Promise<RunNodeResult> => {
      assertNotCanceled();

      switch (node.type) {
        case "message":
          return {
            slots: currentSlots,
            nextNode: findNextNode(node.id, null),
            payload: {
              content: interpolateMessage(
                node.data?.content ?? "",
                currentSlots,
              ),
            },
          };

        case "setSlot": {
          const nextSlots = applySetSlotAssignments(node, currentSlots);
          setSlots(nextSlots);

          return {
            slots: nextSlots,
            nextNode: findNextNode(node.id, null),
            payload: {
              assignments: node.data?.assignments ?? [],
            },
          };
        }

        case "delay": {
          const duration = Number(node.data?.duration ?? 0);
          await wait(duration);

          return {
            slots: currentSlots,
            nextNode: findNextNode(node.id, null),
            payload: {
              duration,
            },
          };
        }

        case "toast":
          return {
            slots: currentSlots,
            nextNode: findNextNode(node.id, null),
            payload: {
              toastType: node.data?.toastType ?? "info",
              message: interpolateMessage(
                node.data?.message ?? "",
                currentSlots,
              ),
            },
          };

        case "link":
          return {
            slots: currentSlots,
            nextNode: findNextNode(node.id, null),
            payload: {
              display: interpolateMessage(
                node.data?.display ?? "",
                currentSlots,
              ),
              url: interpolateMessage(node.data?.content ?? "", currentSlots),
            },
          };

        case "iframe":
          return {
            slots: currentSlots,
            nextNode: findNextNode(node.id, null),
            payload: {
              url: interpolateMessage(node.data?.url ?? "", currentSlots),
              width: node.data?.width ?? null,
              height: node.data?.height ?? null,
            },
          };

        case "ynBranch":
        case "branch": {
          if (node.type === "ynBranch" && node.data?.isSimpleYN) {
            const replyYId = node.data?.replies?.[0]?.value || "Y";
            const replyNId = node.data?.replies?.[1]?.value || "N";

            const rawInput = node.data?.slotKey
              ? currentSlots[node.data.slotKey]
              : (currentSlots.lastUserInput ??
                currentSlots.input ??
                currentSlots.user_input ??
                currentSlots.text ??
                "");

            const strInput = String(rawInput ?? "")
              .trim()
              .toUpperCase();

            // input이 'N'인 경우에만 N으로 분기, 없거나 다른 경우 default Y로 분기
            const isN =
              strInput === "N" ||
              strInput === "NO" ||
              strInput === "ㄴ" ||
              strInput === "FALSE";
            const selectedHandle = isN ? replyNId : replyYId;

            return {
              slots: currentSlots,
              nextNode: findNextNode(node.id, selectedHandle),
              payload: {
                isSimpleYN: true,
                selectedHandle,
                input: strInput,
              },
            };
          }

          if (node.data?.evaluationType === "CONDITION") {
            const handle = resolveBranchHandle(node, currentSlots);
            return {
              slots: currentSlots,
              nextNode: findNextNode(node.id, handle),
              payload: {
                selectedHandle: handle,
                evaluationType: "CONDITION",
              },
            };
          }

          const replies = (node.data?.replies ?? []).filter(
            (r: any) => r?.value,
          );

          if (!replies.length) {
            return {
              slots: currentSlots,
              nextNode: null,
              waitForUser: true,
              waitMessage: t("Branch node has no selectable reply."),
              payload: {
                evaluationType: "BUTTON",
              },
            };
          }

          log("wait", {
            nodeId: node.id,
            nodeType: node.type,
            message: t("Waiting for branch selection."),
            payload: {
              evaluationType: "BUTTON",
              replies,
            },
          });

          const selectedReply = await requestBranchSelection(node, replies);

          if (!selectedReply?.value) {
            throw new Error("Branch selection was canceled.");
          }

          return {
            slots: currentSlots,
            nextNode: findNextNode(node.id, selectedReply.value),
            payload: {
              evaluationType: "BUTTON",
              selectedReply,
            },
          };
        }

        case "slotfilling":
        case "fixedmenu":
          return {
            slots: currentSlots,
            nextNode: null,
            waitForUser: true,
            waitMessage: `Interactive node '${node.type}' requires manual input.`,
          };

        case "form": {
          log("wait", {
            nodeId: node.id,
            nodeType: node.type,
            message: t("Waiting for form input."),
            payload: {
              title: node.data?.title ?? null,
              elements: node.data?.elements ?? [],
            },
          });

          const submittedValues = await requestFormInput(node, currentSlots);

          if (!submittedValues) {
            throw new Error("Form input was canceled.");
          }

          const { nextSlots, formValues } = applyFormInputValues(node, {
            ...currentSlots,
            ...submittedValues,
          });

          if (Object.keys(formValues).length > 0) {
            setSlots(nextSlots);
          }

          return {
            slots: nextSlots,
            nextNode: findNextNode(node.id, null),
            payload: {
              formValues,
              submitted: true,
            },
          };
        }

        case "scenario":
        case "selectionGroup": {
          const entryNode = findGroupEntryNode(node);
          return {
            slots: currentSlots,
            nextNode: entryNode ?? findNextNode(node.id, null),
            payload: {
              entryNodeId: entryNode?.id ?? null,
            },
          };
        }

        case "api":
          return executeApiNode(node, currentSlots);

        case "llm":
          return executeLlmNode(node, currentSlots);

        default:
          return {
            slots: currentSlots,
            nextNode: findNextNode(node.id, null),
            payload: {
              message: `No specific executor for node type '${node.type}'.`,
            },
          };
      }
    },
    [
      applySetSlotAssignments,
      applyFormInputValues,
      assertNotCanceled,
      executeApiNode,
      executeLlmNode,
      findGroupEntryNode,
      findNextNode,
      log,
      requestBranchSelection,
      requestFormInput,
      resolveBranchHandle,
      setSlots,
    ],
  );

  const stopExecution = useCallback(() => {
    const branchResolve = branchSelectionResolverRef.current;
    const formResolve = formInputResolverRef.current;

    requestRef.current.abort();
    cancelRef.current = true;
    inFlightRef.current = false;
    branchSelectionResolverRef.current = null;
    pendingBranchNodeRef.current = null;
    formInputResolverRef.current = null;
    pendingFormNodeRef.current = null;
    closeBranchSelection();
    closeFormInput();
    branchResolve?.(null);
    formResolve?.(null);
    cancelExecution("Stopped by user.");
  }, [cancelExecution, closeBranchSelection, closeFormInput]);

  useEffect(() => () => stopExecution(), [stopExecution]);

  const runBetweenStartAndAnchor = useCallback(async () => {
    if (inFlightRef.current) return;

    if (!startNodeId) {
      failExecution("startNodeId is not set.");
      alert(t("startNodeId is not set."));
      return;
    }

    if (!anchorNodeId) {
      failExecution("anchorNodeId is not set.");
      alert(t("anchorNodeId is not set."));
      return;
    }

    const startNode = getNodeById(startNodeId);
    if (!startNode) {
      failExecution(`Start node not found: ${startNodeId}`);
      return;
    }

    requestRef.current = new AbortController();
    cancelRef.current = false;
    inFlightRef.current = true;

    // 이전 실행 했던 slot 유지
    // resetExecution();
    // startExecution({ startNodeId, anchorNodeId });

    // let currentNode: BuilderNode | null = startNode;
    // let currentSlots: Record<string, unknown> = {
    //   ...(slots ?? {}),
    // };

    resetExecution();
    setSlots({}); // 플레이 시작 시 slot 초기화
    startExecution({ startNodeId, anchorNodeId });

    let currentNode: BuilderNode | null = startNode;
    let currentSlots: Record<string, unknown> = {};

    const maxSteps = 300;
    let step = 0;

    try {
      while (currentNode && step < maxSteps) {
        assertNotCanceled();
        step += 1;

        setExecutionCurrentNode(currentNode.id, currentNode.type);

        const isInstantNode =
          currentNode.type === "delay" ||
          currentNode.type === "ynBranch" ||
          Boolean(currentNode.data?.isSimpleYN);

        await wait(isInstantNode ? 0 : 1000);

        log("enter", {
          nodeId: currentNode.id,
          nodeType: currentNode.type,
          message: `Entering node ${currentNode.id}`,
          payload: {
            step,
            anchorNodeId,
            slotsSnapshot: currentSlots,
          },
        });

        // 모든 노드 공통 1초 로딩 표시
        // 단, delay 노드는 자체 duration이 있으니 중복 지연을 피하려면 0초 처리
        // const stepDelay = currentNode.type === "delay" ? 0 : 1000;
        // if (stepDelay > 0) {
        //   await wait(stepDelay);
        // }

        const result = await runNode(currentNode, currentSlots);
        currentSlots = result.slots ?? currentSlots;

        if (result.waitForUser) {
          log("wait", {
            nodeId: currentNode.id,
            nodeType: currentNode.type,
            message:
              result.waitMessage ?? t("Execution is waiting for user input."),
            payload: result.payload,
          });

          cancelExecution(result.waitMessage ?? t("Waiting for user input."));
          return;
        }

        markExecutionCompleted(currentNode.id, {
          nodeType: currentNode.type,
          payload: result.payload,
        });

        log("complete", {
          nodeId: currentNode.id,
          nodeType: currentNode.type,
          message: `Completed node ${currentNode.id}`,
          payload: result.payload,
        });

        if (currentNode.id === anchorNodeId) {
          finishExecution("Anchor node reached.");
          return;
        }

        currentNode = result.nextNode ?? null;
      }

      if (step >= maxSteps) {
        throw new Error("Execution stopped due to max step limit.");
      }

      finishExecution("Execution finished without reaching anchor.");
    } catch (error: any) {
      if (cancelRef.current) {
        cancelExecution(error?.message || "Execution canceled.");
        return;
      }

      failExecution(error?.message || "Unknown execution error.");
    } finally {
      setExecutionCurrentNode(null);
      inFlightRef.current = false;
    }
  }, [
    anchorNodeId,
    assertNotCanceled,
    cancelExecution,
    failExecution,
    finishExecution,
    getNodeById,
    log,
    markExecutionCompleted,
    resetExecution,
    runNode,
    setExecutionCurrentNode,
    setSlots,
    startExecution,
    startNodeId,
  ]);

  return {
    executionRunning,
    runBetweenStartAndAnchor,
    stopExecution,
    selectBranchReply,
    cancelBranchReplySelection,
    submitFormInput,
    cancelFormInput,
  };
}
