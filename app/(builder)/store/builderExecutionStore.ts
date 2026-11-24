import { create } from "zustand";

export type ExecutionPhase =
  | "start"
  | "enter"
  | "complete"
  | "wait"
  | "error"
  | "finish"
  | "cancel";

export type ExecutionLog = {
  at: string;
  phase: ExecutionPhase;
  nodeId?: string;
  nodeType?: string;
  message?: string;
  payload?: any;
};

type StartExecutionMeta = {
  startNodeId?: string | null;
  anchorNodeId?: string | null;
};

type MarkCompletedMeta = {
  nodeType?: string;
  payload?: any;
};

// 20260317 - 플레이시 branch 노드는 모달 팝업으로 선택 시 까지 pending 효과
type PendingBranchReply = {
  display: string;
  value: string;
};

type PendingBranchSelection = {
  nodeId: string;
  nodeType: string;
  title?: string;
  replies: PendingBranchReply[];
} | null;

type PendingFormInput = {
  nodeId: string;
  nodeType: string;
  title?: string;
  slotKey?: string;
  elements: unknown[];
  initialValues: Record<string, unknown>;
  slots?: Record<string, unknown>;
} | null;

type BuilderExecutionStore = {
  executionRunning: boolean;
  executionCurrentNodeId: string | null;
  executionCompletedNodeIds: string[];
  executionVisitedNodeIds: string[];
  executionLogs: ExecutionLog[];
  executionStartedAt: string | null;
  executionEndedAt: string | null;
  executionError: string | null;

  resetExecution: () => void;
  startExecution: (meta?: StartExecutionMeta) => void;
  setExecutionCurrentNode: (nodeId: string | null, nodeType?: string) => void;
  markExecutionCompleted: (nodeId: string, meta?: MarkCompletedMeta) => void;
  appendExecutionLog: (log: ExecutionLog) => void;
  finishExecution: (message?: string) => void;
  failExecution: (message: string, extra?: Partial<ExecutionLog>) => void;
  cancelExecution: (message?: string) => void;

  pendingBranchSelection: PendingBranchSelection;
  openBranchSelection: (payload: PendingBranchSelection) => void;
  closeBranchSelection: () => void;

  pendingFormInput: PendingFormInput;
  openFormInput: (payload: PendingFormInput) => void;
  closeFormInput: () => void;
};

const now = () => new Date().toISOString();

const initialState = {
  executionRunning: false,
  executionCurrentNodeId: null,
  executionCompletedNodeIds: [] as string[],
  executionVisitedNodeIds: [] as string[],
  executionLogs: [] as ExecutionLog[],
  executionStartedAt: null as string | null,
  executionEndedAt: null as string | null,
  executionError: null as string | null,
  pendingFormInput: null as PendingFormInput,
};

export const builderExecutionStore = create<BuilderExecutionStore>((set) => ({
  ...initialState,

  resetExecution: () =>
    set({
      ...initialState,
    }),

  startExecution: (meta) =>
    set({
      executionRunning: true,
      executionCurrentNodeId: null,
      executionCompletedNodeIds: [],
      executionVisitedNodeIds: [],
      executionLogs: [
        {
          at: now(),
          phase: "start",
          message: "Builder execution started",
          payload: meta ?? {},
        },
      ],
      executionStartedAt: now(),
      executionEndedAt: null,
      executionError: null,
    }),

  setExecutionCurrentNode: (nodeId) =>
    set((state) => ({
      executionCurrentNodeId: nodeId,
      executionVisitedNodeIds:
        nodeId && !state.executionVisitedNodeIds.includes(nodeId)
          ? [...state.executionVisitedNodeIds, nodeId]
          : state.executionVisitedNodeIds,
    })),

  markExecutionCompleted: (nodeId) =>
    set((state) => ({
      executionCompletedNodeIds: state.executionCompletedNodeIds.includes(
        nodeId,
      )
        ? state.executionCompletedNodeIds
        : [...state.executionCompletedNodeIds, nodeId],
    })),

  appendExecutionLog: (log) =>
    set((state) => ({
      executionLogs: [...state.executionLogs, log],
    })),

  finishExecution: (message) =>
    set((state) => ({
      executionRunning: false,
      executionCurrentNodeId: null,
      executionEndedAt: now(),
      executionLogs: [
        ...state.executionLogs,
        {
          at: now(),
          phase: "finish",
          message: message ?? "Builder execution finished",
        },
      ],
    })),

  failExecution: (message, extra) =>
    set((state) => ({
      executionRunning: false,
      executionCurrentNodeId: null,
      executionEndedAt: now(),
      executionError: message,
      executionLogs: [
        ...state.executionLogs,
        {
          at: now(),
          phase: "error",
          message,
          ...extra,
        },
      ],
    })),

  cancelExecution: (message) =>
    set((state) => ({
      executionRunning: false,
      executionCurrentNodeId: null,
      executionEndedAt: now(),
      executionLogs: [
        ...state.executionLogs,
        {
          at: now(),
          phase: "cancel",
          message: message ?? "Builder execution canceled",
        },
      ],
    })),

  pendingBranchSelection: null,

  openBranchSelection: (payload) =>
    set({
      pendingBranchSelection: payload,
    }),

  closeBranchSelection: () =>
    set({
      pendingBranchSelection: null,
    }),

  openFormInput: (payload) =>
    set({
      pendingFormInput: payload,
    }),

  closeFormInput: () =>
    set({
      pendingFormInput: null,
    }),
}));
