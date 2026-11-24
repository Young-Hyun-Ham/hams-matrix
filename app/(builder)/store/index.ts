// app/builder/store/index.js
"use client";

import { create, type UseBoundStore, type StoreApi } from "zustand";
import {
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type Connection,
} from "reactflow";

import { createNodeData, createFormElement } from "../utils/nodeFactory";
import {
  fetchScenarioData,
  fetchScenarios,
  saveScenarioData,
  createScenario,
  patchScenario,
  deleteScenario,
  cloneScenario,
} from "../services/backendService";
import { DB_TYPE, Scenario, TreeItem } from "../types/types";
import useBuilderHistoryStore, { GraphSnapshot } from "./historyStore";
import { createGroupActionStore } from "./groupActionStore";
import {
  createEdgeControlActionStore,
  EdgePoint,
  sanitizeEdgesForSave,
  sanitizeNodesForSave,
} from "./edgeControlActionStore";

import type { User } from "@/app/(builder)/types/user";
import { builderRequest } from "../services/transport";

// ================================================================
// 플레이 타입 설정
export type ExecutionPhase =
  | "start"
  | "enter"
  | "complete"
  | "wait"
  | "error"
  | "finish";

export type ExecutionLog = {
  at: string;
  phase: ExecutionPhase;
  nodeId?: string;
  nodeType?: string;
  message?: string;
  payload?: any;
};
// ================================================================

/* 노드 타입(키) 고정 */
export type NodeType =
  | "message"
  | "form"
  | "branch"
  | "slotfilling"
  | "api"
  | "llm"
  | "setSlot"
  | "delay"
  | "fixedmenu"
  | "link"
  | "toast"
  | "iframe"
  | "scenario";

/* 기본 색상/텍스트 색상: 키 누락 방지 */
const defaultColors = {
  message: "#f39c12",
  form: "#9b59b6",
  branch: "#2ecc71",
  slotfilling: "#3498db",
  api: "#e74c3c",
  llm: "#1abc9c",
  setSlot: "#8e44ad",
  delay: "#f1c40f",
  fixedmenu: "#e74c3c",
  link: "#1977d4ff",
  toast: "#95a5a6",
  iframe: "#7e96afff",
  scenario: "#7f8c8d",
} satisfies any;

const defaultTextColors = {
  message: "#ffffff",
  form: "#ffffff",
  branch: "#ffffff",
  slotfilling: "#ffffff",
  api: "#ffffff",
  llm: "#ffffff",
  setSlot: "#ffffff",
  delay: "#333333",
  fixedmenu: "#ffffff",
  link: "#ffffff",
  toast: "#ffffff",
  iframe: "#ffffff",
  scenario: "#ffffff",
} satisfies any;

/* 키 배열을 NodeType[]로 고정 */
export const ALL_NODE_TYPES = Object.keys(defaultColors) as NodeType[];

/* 기본 표시 타입 */
const defaultVisibleNodeTypes: NodeType[] = [
  "message",
  "form",
  "branch",
  "slotfilling",
  "api",
  "setSlot",
  "delay",
  "fixedmenu",
  "link",
  "iframe",
  "scenario",
  // 'llm','toast',
];

/* scenario detail nodes data */
export const MOCK_UP_TREE_DATA: TreeItem[] = [
  {
    id: "sec-default",
    index: 0,
    label: "Default",
    children: [
      {
        id: "message",
        type: "message",
        index: 0,
        label: "Message",
        children: [],
      },
      {
        id: "setSlot",
        type: "setSlot",
        index: 1,
        label: "Set Slot",
        children: [],
      },
      {
        id: "branch",
        type: "branch",
        index: 2,
        label: "Condition Branch",
        children: [],
      },
      { id: "form", type: "form", index: 3, label: "Form", children: [] },
      { id: "link", type: "link", index: 4, label: "Link", children: [] },
      { id: "api", type: "api", index: 5, label: "API", children: [] },
      {
        id: "iframe",
        type: "iframe",
        index: 6,
        label: "iframe",
        children: [],
      },
    ],
  },
  {
    id: "sec-biz",
    index: 1,
    label: "Business",
    children: [
      {
        id: "ScenarioGroup",
        type: "scenarioGroup",
        index: 0,
        label: "Scenario Group",
        children: [],
      },
    ],
  },
  {
    id: "sec-user",
    index: 2,
    label: "User Defined",
    children: [
      {
        id: "settingNodes",
        type: "settingNodes",
        index: 0,
        label: "Nodes Settings",
        children: [],
      },
    ],
  },
];

const userInfo: User = {
  id: "",
  sub: "",
  email: "",
  username: "",
  roles: ["guest"],
  unuseFormElements: [],
  unuseNodes: [],
  nodeColors: defaultColors,
};

/* 스토어 상태/액션 타입 */
export type StoreState = {
  settingsRevision: number;
  saveUserSettings: () => Promise<void>;
  backend: DB_TYPE;
  setBackend: (kind: DB_TYPE) => void;

  userInfoJson: User;
  setUserInfoJson: (userInfo: User) => void;
  loadingUserData: () => Promise<User>;
  treeNodes: TreeItem[];
  loadTreeNodes: () => void;

  scenario: Scenario;
  setScenario: (item: Scenario) => void;
  scenarios: Scenario[];
  setScenarios: (item: Scenario[]) => void;

  nodes: Node<any>[]; // 노드 데이터 제네릭이 다양하므로 any 유지
  edges: Edge<any>[];

  setNodes: (newNodes: Node<any>[]) => void;
  setEdges: (newEdges: Edge<any>[]) => void;

  selectedVersionId: string | null;
  setSelectedVersionId: (ver_id: string) => void;

  selectedNodeId: string | null;
  anchorNodeId: string | null;
  startNodeId: string | null;

  nodeColors: any;
  nodeTextColors: any;
  setNodeColors: (nodeColors: any) => void;
  setNodeTextColors: (nodeTextColors: any) => void;

  // 슬롯/행 등 기존 any 구조는 점진 전환용으로 둠
  slots: Record<string, unknown>;
  selectedRow: unknown;

  visibleNodeTypes: NodeType[];

  setAnchorNodeId: (nodeId: string | null) => void;
  setStartNodeId: (nodeId: string | null) => void;
  setSelectedRow: (row: unknown) => void;
  setSlots: (newSlots: Record<string, unknown>) => void;

  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;

  setSelectedNodeId: (nodeId: string | null) => void;

  deleteNode: (nodeId: string) => void;
  deleteNodesByIds: (nodeIds: string[]) => void;
  toggleScenarioNode: (nodeId: string) => void;
  deleteSelectedEdges: () => void;

  duplicateNode: (nodeId: string) => void;
  updateNodeData: (nodeId: string, dataUpdate: Record<string, unknown>) => void;

  addNode: (type: NodeType, position?: { x: number; y: number }) => void;

  addReply: (nodeId: string) => void;
  updateReply: (
    nodeId: string,
    index: number,
    part: "display" | "value",
    value: string,
  ) => void;
  deleteReply: (nodeId: string, index: number) => void;

  addElement: (nodeId: string, elementType: string) => void;
  updateElement: (
    nodeId: string,
    elementIndex: number,
    elementUpdate: Record<string, any>,
  ) => void;
  deleteElement: (nodeId: string, elementIndex: number) => void;
  updateGridCell: (
    nodeId: string,
    elementIndex: number,
    rowIndex: number,
    colIndex: number,
    value: string,
  ) => void;
  moveElement: (nodeId: string, startIndex: number, endIndex: number) => void;

  exportSelectedNodes: (selectedNodes: Node<any>[]) => void;
  importNodes: () => Promise<void>;

  addScenarioAsGroup: (
    scenario: { id: string; name: string },
    position?: { x: number; y: number },
  ) => Promise<void>;

  groupSelectedNodes: (groupLabel?: string) => void;
  ungroupNode: (groupId: string) => void;

  updateEdgeSegment: (edgeId: string, points: EdgePoint[]) => void;
  updateEdgePoints: (edgeId: string, points: EdgePoint[]) => void;

  // undo/redo 기능 추가
  undo: () => void;
  redo: () => void;

  fetchScenarios: (options: any) => Promise<Scenario[]>;
  fetchScenario: (scenarioId: string) => Promise<any>;
  saveScenario: (
    scenario: {
      id: string;
      name: string;
      version_yn?: boolean;
    },
    options?: { onSuccess?: () => void; onError?: (err: any) => void },
  ) => Promise<{
    id: string;
    version_yn: boolean;
    latestVersion?: number;
    ltst_ver_id?: number;
  } | void>;
  createScenario: (scenario: Scenario) => Promise<Scenario>;
  patchScenario: (scenario: Scenario) => Promise<Scenario>;
  deleteScenario: (scenarioId: string[]) => void;
  cloneScenario: (scenario: Scenario) => Promise<void>;
};

/* Zustand 제네릭으로 상태 안전화 */
// ==========================================================
// undo/redo 기능 추가 위해 스냅샷 관련 액션 추가
export const makeSnapshot = (state: {
  nodes: Node<any>[];
  edges: Edge<any>[];
  selectedNodeId: string | null;
  startNodeId: string | null;
}): GraphSnapshot => ({
  nodes: JSON.parse(JSON.stringify(state.nodes)),
  edges: JSON.parse(JSON.stringify(state.edges)),
  selectedNodeId: state.selectedNodeId,
  startNodeId: state.startNodeId,
});

const shouldRecordNodeChanges = (changes: NodeChange[]) =>
  changes.some((change) => {
    switch (change.type) {
      case "position":
      case "remove":
      case "add":
        return true;
      default:
        return false;
    }
  });

const shouldRecordEdgeChanges = (changes: EdgeChange[]) =>
  changes.some((change) => {
    switch (change.type) {
      case "remove":
      case "add":
        return true;
      default:
        return false;
    }
  });
// ==========================================================

const createReconnectedEdge = (
  incomingEdge: Edge<any>,
  outgoingEdge: Edge<any>,
): Edge<any> => ({
  ...incomingEdge,
  id: `reactflow__edge-${incomingEdge.source}${incomingEdge.sourceHandle || ""}-${outgoingEdge.target}${outgoingEdge.targetHandle || ""}`,
  target: outgoingEdge.target,
  targetHandle: outgoingEdge.targetHandle ?? null,
});

const getNodeIdsToRemove = (
  nodes: Node<any>[],
  nodeIds: string[],
  edges: Edge<any>[] = [],
) => {
  const removeSet = new Set<string>();
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const outgoingEdgesBySourceId = new Map<string, Edge<any>[]>();

  edges.forEach((edge) => {
    outgoingEdgesBySourceId.set(edge.source, [
      ...(outgoingEdgesBySourceId.get(edge.source) || []),
      edge,
    ]);
  });

  const collectNodeAndChildren = (targetId: string) => {
    if (removeSet.has(targetId)) return;

    const targetNode = nodeById.get(targetId);
    if (!targetNode) return;

    removeSet.add(targetId);

    if (
      targetNode.type === "scenario" ||
      targetNode.type === "selectionGroup"
    ) {
      nodes
        .filter((child) => child.parentNode === targetId)
        .forEach((child) => collectNodeAndChildren(child.id));
    }

    if (targetNode.type === "branch") {
      outgoingEdgesBySourceId
        .get(targetId)
        ?.forEach((edge) => collectBranchDescendant(edge.target));
    }
  };

  const collectBranchDescendant = (targetId: string) => {
    if (removeSet.has(targetId)) return;

    collectNodeAndChildren(targetId);

    outgoingEdgesBySourceId
      .get(targetId)
      ?.forEach((edge) => collectBranchDescendant(edge.target));
  };

  nodeIds.forEach(collectNodeAndChildren);
  return removeSet;
};

const reconnectEdgesAfterRemoval = (
  edges: Edge<any>[],
  removeSet: Set<string>,
) => {
  const incomingEdges = edges.filter(
    (edge) => !removeSet.has(edge.source) && removeSet.has(edge.target),
  );
  const outgoingEdges = edges.filter(
    (edge) => removeSet.has(edge.source) && !removeSet.has(edge.target),
  );
  const remainingEdges = edges.filter(
    (edge) => !removeSet.has(edge.source) && !removeSet.has(edge.target),
  );
  const nextEdges = [...remainingEdges];
  const edgeKey = (edge: Edge<any>) =>
    [
      edge.source,
      edge.sourceHandle ?? null,
      edge.target,
      edge.targetHandle ?? null,
    ].join("|");
  const existingKeys = new Set(nextEdges.map(edgeKey));

  incomingEdges.forEach((incomingEdge) => {
    outgoingEdges.forEach((outgoingEdge) => {
      if (incomingEdge.source === outgoingEdge.target) return;

      const reconnectedEdge = createReconnectedEdge(incomingEdge, outgoingEdge);
      const key = edgeKey(reconnectedEdge);
      if (existingKeys.has(key)) return;

      existingKeys.add(key);
      nextEdges.push(reconnectedEdge);
    });
  });

  return { nextEdges, outgoingEdges };
};

export const useBuilderStore: UseBoundStore<StoreApi<StoreState>> =
  create<StoreState>((set, get) => ({
    settingsRevision: 0,
    saveUserSettings: async () => {
      const state = get(),
        {
          unuseNodes = [],
          unuseFormElements = [],
          nodeColors = {},
        } = state.userInfoJson;
      const result = await builderRequest("/settings", "PUT", {
        settings: { unuseNodes, unuseFormElements, nodeColors },
        expectedRevision: state.settingsRevision,
      });
      set({ settingsRevision: result.revision });
    },
    backend: "turso",
    setBackend: (kind: DB_TYPE) => set({ backend: kind }),
    treeNodes: [],

    userInfoJson: userInfo,
    setUserInfoJson: (userInfo: User) => set({ userInfoJson: userInfo }),
    loadingUserData: async () => {
      // TODO: 추후 API 전환
      // const res = await apiClient.get<ElementTypeItem[]>('/chat/user-info');
      // const userInfo = res.data;
      try {
        const authenticatedUser = get().userInfoJson;
        const storedBuilderUser = get().userInfoJson;
        const currentUserInfo: User = authenticatedUser
          ? {
              ...storedBuilderUser,
              ...authenticatedUser,
              unuseFormElements:
                authenticatedUser.unuseFormElements ??
                storedBuilderUser.unuseFormElements ??
                [],
              unuseNodes:
                authenticatedUser.unuseNodes ??
                storedBuilderUser.unuseNodes ??
                [],
              nodeColors:
                authenticatedUser.nodeColors ?? storedBuilderUser.nodeColors,
            }
          : storedBuilderUser;

        const nodeColors = {
          ...defaultColors,
          ...(currentUserInfo.nodeColors ?? {}),
        };

        const userInfo: User = {
          ...currentUserInfo,
          roles: currentUserInfo.roles ?? ["guest"],
          unuseFormElements: currentUserInfo.unuseFormElements ?? [],
          unuseNodes: currentUserInfo.unuseNodes ?? [],
          nodeColors,
        };

        set({
          userInfoJson: userInfo,
          nodeColors,
        });

        return userInfo;
      } catch (error) {
        console.error("Error loading user data:", error);
        throw error;
      }
    },
    loadTreeNodes: async () => {
      try {
        // TODO: API 명세 확정 후 엔드포인트 및 데이터 구조에 맞게 수정 필요

        const userInfo = await get().loadingUserData();
        const filteredTreeData = MOCK_UP_TREE_DATA.map((section) => ({
          ...section,
          // children 배열 내에서 unuseNodes에 id가 포함되지 않은 것만 남김
          children: section.children.filter(
            (child) => !userInfo.unuseNodes?.includes(child.id),
          ),
        }));
        set({ treeNodes: filteredTreeData });
      } catch (error) {
        console.error("Error loading tree nodes:", error);
      }
    },

    scenario: { name: "", description: "" },
    setScenario: (item: Scenario) => set({ scenario: item }),
    scenarios: [],
    setScenarios: (item: Scenario[]) => set({ scenarios: item }),

    nodes: [],
    edges: [],

    setNodes: (newNodes) => {
      set({ nodes: newNodes });
    },

    setEdges: (newEdges) => {
      set({ edges: newEdges });
    },

    selectedVersionId: null,
    setSelectedVersionId: (ver_id: string) => {
      set({ selectedVersionId: ver_id });
    },

    selectedNodeId: null,
    anchorNodeId: null,
    startNodeId: null,
    nodeColors: defaultColors,
    nodeTextColors: defaultTextColors,
    setNodeColors: (nodeColors) => set({ nodeColors }),
    setNodeTextColors: (nodeTextColors) => set({ nodeTextColors }),
    slots: {},
    selectedRow: null,

    visibleNodeTypes: defaultVisibleNodeTypes,

    setAnchorNodeId: (nodeId) =>
      set((state) => ({
        anchorNodeId: state.anchorNodeId === nodeId ? null : nodeId,
      })),

    setStartNodeId: (nodeId) =>
      set((state) => ({
        startNodeId: state.startNodeId === nodeId ? null : nodeId,
      })),

    setSelectedRow: (row) => set({ selectedRow: row }),
    setSlots: (newSlots) => set({ slots: newSlots }),

    onNodesChange: (changes) => {
      if (shouldRecordNodeChanges(changes)) {
        useBuilderHistoryStore.getState().push(makeSnapshot(get()));
      }
      const prevNodes = get().nodes;
      const prevEdges = get().edges;
      const nextNodes = applyNodeChanges(changes, prevNodes);

      const movedChanges = (changes as any[]).filter(
        (change: any) =>
          change?.type === "position" && change?.position && change?.dragging,
      );

      if (movedChanges.length === 0) {
        set({ nodes: nextNodes });
        return;
      }

      const deltaByNodeId = new Map<string, any>();

      for (const change of movedChanges) {
        const prevNode = prevNodes.find((node: any) => node.id === change.id);
        if (!prevNode || !change.position) continue;

        deltaByNodeId.set(change.id, {
          dx: change.position.x - prevNode.position.x,
          dy: change.position.y - prevNode.position.y,
        });
      }

      const nextEdges = prevEdges.map((edge: any) => {
        const sourceDelta: any = deltaByNodeId.get(edge.source) ?? null;
        const targetDelta: any = deltaByNodeId.get(edge.target) ?? null;

        const sameDelta: any =
          sourceDelta &&
          targetDelta &&
          sourceDelta.dx === targetDelta.dx &&
          sourceDelta.dy === targetDelta.dy
            ? sourceDelta
            : null;

        const shouldTranslate = !!edge.selected || !!sameDelta;

        if (!shouldTranslate) {
          return edge;
        }

        const dx = sameDelta?.dx ?? sourceDelta?.dx ?? targetDelta?.dx ?? 0;
        const dy = sameDelta?.dy ?? sourceDelta?.dy ?? targetDelta?.dy ?? 0;

        return {
          ...edge,
          data: {
            ...(edge.data ?? {}),
            points: Array.isArray(edge.data?.points)
              ? edge.data.points.map((point: any) => ({
                  x: point.x + dx,
                  y: point.y + dy,
                }))
              : edge.data?.points,
            controlX:
              typeof edge.data?.controlX === "number"
                ? edge.data.controlX + dx
                : edge.data?.controlX,
            controlY:
              typeof edge.data?.controlY === "number"
                ? edge.data.controlY + dy
                : edge.data?.controlY,
          },
        };
      });

      set({
        nodes: nextNodes,
        edges: nextEdges,
      });
    },
    onEdgesChange: (changes) => {
      if (shouldRecordEdgeChanges(changes)) {
        useBuilderHistoryStore.getState().push(makeSnapshot(get()));
      }
      set({ edges: applyEdgeChanges(changes, get().edges) });
    },
    onConnect: (connection) => {
      // edge 중복 연결
      // useBuilderHistoryStore.getState().push(makeSnapshot(get()));
      // set({ edges: addEdge(connection, get().edges) });

      // edge 중복 연결 방지
      const currentEdges = get().edges;

      // 동일한 노드의 동일한 source handle에 연결된 edge가 있는지 확인
      const sourceHandleAlreadyConnected = currentEdges.some(
        (edge) =>
          edge.source === connection.source &&
          (edge.sourceHandle ?? null) === (connection.sourceHandle ?? null),
      );

      if (sourceHandleAlreadyConnected) {
        return;
      }

      useBuilderHistoryStore.getState().push(makeSnapshot(get()));

      set({
        edges: addEdge(connection, currentEdges),
      });
    },

    setSelectedNodeId: (nodeId) => set({ selectedNodeId: nodeId }),

    deleteNode: (nodeId) => {
      useBuilderHistoryStore.getState().push(makeSnapshot(get()));

      set((state) => {
        const nodeToDelete = state.nodes.find((n) => n.id === nodeId);
        if (!nodeToDelete) return state;

        const removeSet = getNodeIdsToRemove(
          state.nodes,
          [nodeId],
          state.edges,
        );
        const remainingNodes = state.nodes.filter((n) => !removeSet.has(n.id));
        const { nextEdges, outgoingEdges } = reconnectEdgesAfterRemoval(
          state.edges,
          removeSet,
        );

        return {
          nodes: remainingNodes,
          edges: nextEdges,
          selectedNodeId:
            state.selectedNodeId && removeSet.has(state.selectedNodeId)
              ? null
              : state.selectedNodeId,
          startNodeId:
            state.startNodeId && removeSet.has(state.startNodeId)
              ? outgoingEdges[0]?.target || null
              : state.startNodeId,
        };
      });
    },

    deleteNodesByIds: (nodeIds) => {
      if (!nodeIds.length) return;

      useBuilderHistoryStore.getState().push(makeSnapshot(get()));

      set((state) => {
        const removeSet = getNodeIdsToRemove(state.nodes, nodeIds, state.edges);

        const remainingNodes = state.nodes.filter(
          (node) => !removeSet.has(node.id),
        );
        const { nextEdges, outgoingEdges } = reconnectEdgesAfterRemoval(
          state.edges,
          removeSet,
        );

        return {
          nodes: remainingNodes,
          edges: nextEdges,
          selectedNodeId:
            state.selectedNodeId && removeSet.has(state.selectedNodeId)
              ? null
              : state.selectedNodeId,
          startNodeId:
            state.startNodeId && removeSet.has(state.startNodeId)
              ? outgoingEdges[0]?.target || null
              : state.startNodeId,
        };
      });
    },

    toggleScenarioNode: (nodeId) => {
      set((state) => {
        const PADDING = 40;
        const newNodes = state.nodes.map((n) => {
          if (
            n.id === nodeId &&
            (n.type === "scenario" || n.type === "selectionGroup")
          ) {
            const isCollapsed = !(n.data?.isCollapsed ?? false);
            const nextStyle: Record<string, any> = { ...(n.style as any) };

            if (isCollapsed) {
              nextStyle.width = 250;
              nextStyle.height = 50;
            } else {
              const children = state.nodes.filter(
                (c) => c.parentNode === nodeId,
              );
              if (n.type === "selectionGroup") {
                nextStyle.width = 640;
                nextStyle.height = Math.max(
                  260,
                  ...children.map(
                    (child) =>
                      child.position.y +
                      (child.height || Number(child.style?.height) || 150) +
                      60,
                  ),
                );
              } else if (children.length) {
                let minX = Infinity,
                  minY = Infinity,
                  maxX = 0,
                  maxY = 0;
                children.forEach((c) => {
                  const x = c.position.x;
                  const y = c.position.y;
                  const w = (c.width as number) || 250;
                  const h = (c.height as number) || 150;
                  minX = Math.min(minX, x);
                  minY = Math.min(minY, y);
                  maxX = Math.max(maxX, x + w);
                  maxY = Math.max(maxY, y + h);
                });
                nextStyle.width = maxX - minX + PADDING * 2;
                nextStyle.height = maxY - minY + PADDING * 2;

                children.forEach((c) => {
                  c.position.x -= minX - PADDING;
                  c.position.y -= minY - PADDING;
                });
              } else {
                nextStyle.width = 250;
                nextStyle.height = 100;
              }
            }
            return { ...n, style: nextStyle, data: { ...n.data, isCollapsed } };
          }
          return n;
        });
        const nextEdges = state.edges.map((edge) => {
          if (edge.source !== nodeId && edge.target !== nodeId) return edge;
          if (!edge.data?.points) return edge;

          const nextData = { ...edge.data };
          delete nextData.points;

          return {
            ...edge,
            data: Object.keys(nextData).length > 0 ? nextData : undefined,
          };
        });

        return { nodes: newNodes, edges: nextEdges };
      });
    },

    deleteSelectedEdges: () =>
      set((state) => ({ edges: state.edges.filter((e) => !e.selected) })),

    duplicateNode: (nodeId) => {
      useBuilderHistoryStore.getState().push(makeSnapshot(get()));

      const { nodes } = get();
      const original = nodes.find((n) => n.id === nodeId);
      if (!original) return;

      const maxZ = nodes.reduce(
        (m, n) => Math.max((n.zIndex as number) || 0, m),
        0,
      );
      const newData = JSON.parse(JSON.stringify(original.data ?? {}));
      const newNode: Node<any> = {
        ...original,
        id: `${original.type}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        position: { x: original.position.x + 50, y: original.position.y + 50 },
        data: newData,
        selected: false,
        zIndex: (maxZ + 1) as any,
      };
      set({ nodes: [...nodes, newNode] });
      get().setSelectedNodeId(newNode.id);
    },

    updateNodeData: (nodeId, dataUpdate) => {
      useBuilderHistoryStore.getState().push(makeSnapshot(get()));

      set((state) => ({
        nodes: state.nodes.map((n) =>
          n.id === nodeId
            ? { ...n, data: { ...(n.data ?? {}), ...dataUpdate } }
            : n,
        ),
      }));
    },

    addNode: (type, position = { x: 100, y: 100 }) => {
      useBuilderHistoryStore.getState().push(makeSnapshot(get()));

      const data = createNodeData(type);
      const newNode: Node<any> = { id: data.id, type, position, data };
      set({ nodes: [...get().nodes, newNode] });
    },

    /* 이하 폼/리플라이 관련 로직은 원본 유지, 파라미터만 타입 지정 */
    addReply: (nodeId) => {
      set((state) => ({
        nodes: state.nodes.map((n) => {
          if (n.id !== nodeId) return n;
          const t = n.type as NodeType;
          const label =
            t === "branch"
              ? "New Condition"
              : t === "fixedmenu"
                ? "New Menu"
                : "New Reply";
          const prefix =
            t === "branch" ? "cond" : t === "fixedmenu" ? "menu" : "val";
          const newReply = {
            display: label,
            value: `${prefix}_${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          };
          const replies = Array.isArray(n.data?.replies) ? n.data!.replies : [];
          return {
            ...n,
            data: { ...(n.data ?? {}), replies: [...replies, newReply] },
          };
        }),
      }));
    },

    updateReply: (nodeId, index, part, value) => {
      set((state) => ({
        nodes: state.nodes.map((n) => {
          if (n.id !== nodeId) return n;
          const replies = Array.isArray(n.data?.replies)
            ? [...n.data!.replies]
            : [];
          if (!replies[index]) return n;
          replies[index] = { ...replies[index], [part]: value };
          return { ...n, data: { ...(n.data ?? {}), replies } };
        }),
      }));
    },

    deleteReply: (nodeId, index) => {
      set((state) => ({
        nodes: state.nodes.map((n) => {
          if (n.id !== nodeId) return n;
          const replies = Array.isArray(n.data?.replies)
            ? n.data!.replies.filter((_: any, i: number) => i !== index)
            : [];
          return { ...n, data: { ...(n.data ?? {}), replies } };
        }),
      }));
    },

    addElement: (nodeId, elementType) => {
      set((state) => ({
        nodes: state.nodes.map((n) => {
          if (n.id !== nodeId || n.type !== "form") return n;
          const el = createFormElement(elementType);
          const elements = Array.isArray(n.data?.elements)
            ? n.data!.elements
            : [];
          return {
            ...n,
            data: { ...(n.data ?? {}), elements: [...elements, el] },
          };
        }),
      }));
    },

    updateElement: (nodeId, elementIndex, elementUpdate) => {
      set((state) => ({
        nodes: state.nodes.map((n) => {
          if (n.id !== nodeId || n.type !== "form") return n;
          const elements = Array.isArray(n.data?.elements)
            ? [...n.data!.elements]
            : [];
          const oldEl = elements[elementIndex];
          if (!oldEl) return n;
          const nextEl = { ...oldEl, ...elementUpdate };

          if (
            nextEl.type === "grid" &&
            (oldEl.rows !== nextEl.rows || oldEl.columns !== nextEl.columns)
          ) {
            const oldData: string[] = oldEl.data || [];
            const newRows = nextEl.rows || 2;
            const newCols = nextEl.columns || 2;
            const newData = Array(newRows * newCols).fill("");
            for (let r = 0; r < Math.min(oldEl.rows || 0, newRows); r++) {
              for (let c = 0; c < Math.min(oldEl.columns || 0, newCols); c++) {
                const oi = r * (oldEl.columns || 0) + c;
                const ni = r * newCols + c;
                if (oldData[oi] !== undefined) newData[ni] = oldData[oi];
              }
            }
            nextEl.data = newData;
          }

          elements[elementIndex] = nextEl;
          return { ...n, data: { ...(n.data ?? {}), elements } };
        }),
      }));
    },

    deleteElement: (nodeId, elementIndex) => {
      set((state) => ({
        nodes: state.nodes.map((n) => {
          if (n.id !== nodeId || n.type !== "form") return n;
          const elements = Array.isArray(n.data?.elements)
            ? n.data!.elements.filter((_: any, i: number) => i !== elementIndex)
            : [];
          return { ...n, data: { ...(n.data ?? {}), elements } };
        }),
      }));
    },

    updateGridCell: (nodeId, elementIndex, rowIndex, colIndex, value) => {
      set((state) => ({
        nodes: state.nodes.map((n) => {
          if (n.id !== nodeId || n.type !== "form") return n;
          const elements = JSON.parse(JSON.stringify(n.data?.elements ?? []));
          const grid = elements[elementIndex];
          if (!grid || grid.type !== "grid") return n;
          const idx = rowIndex * grid.columns + colIndex;
          grid.data[idx] = value;
          return { ...n, data: { ...(n.data ?? {}), elements } };
        }),
      }));
    },

    moveElement: (nodeId, startIndex, endIndex) => {
      set((state) => ({
        nodes: state.nodes.map((n) => {
          if (n.id !== nodeId || n.type !== "form") return n;
          const elements = Array.isArray(n.data?.elements)
            ? [...n.data!.elements]
            : [];
          const [removed] = elements.splice(startIndex, 1);
          elements.splice(endIndex, 0, removed);
          return { ...n, data: { ...(n.data ?? {}), elements } };
        }),
      }));
    },

    exportSelectedNodes: (selectedNodes) => {
      const { edges } = get();
      const ids = new Set(selectedNodes.map((n) => n.id));
      const relevantEdges = edges.filter(
        (e) => ids.has(e.source) && ids.has(e.target),
      );
      const json = JSON.stringify(
        { nodes: selectedNodes, edges: relevantEdges },
        null,
        2,
      );

      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard
          .writeText(json)
          .then(() =>
            alert(`${selectedNodes.length} nodes exported to clipboard!`),
          )
          .catch((err) => {
            console.error("Clipboard API failed: ", err);
            alert(`Failed to export nodes: ${err.message}`);
          });
      } else {
        try {
          const ta = document.createElement("textarea");
          ta.value = json;
          ta.style.position = "fixed";
          ta.style.top = "-9999px";
          ta.style.left = "-9999px";
          document.body.appendChild(ta);
          ta.focus();
          ta.select();
          document.execCommand("copy");
          document.body.removeChild(ta);
          alert(
            `${selectedNodes.length} nodes exported to clipboard (fallback).`,
          );
        } catch (err) {
          console.error("Fallback export failed: ", err);
          alert("Failed to export nodes.");
        }
      }
    },

    importNodes: async () => {
      useBuilderHistoryStore.getState().push(makeSnapshot(get()));

      try {
        const text = await navigator.clipboard.readText();
        const parsed = JSON.parse(text);
        if (!parsed.nodes || !Array.isArray(parsed.nodes))
          throw new Error("Invalid data format");

        const { nodes: curNodes, edges: curEdges } = get();
        const map = new Map<string, string>();

        const newNodes: Node<any>[] = parsed.nodes.map(
          (node: Node<any>, i: number) => {
            const oldId = node.id;
            const newId = `${node.type}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}-${i}`;
            map.set(oldId, newId);
            return {
              ...node,
              id: newId,
              position: { x: node.position.x + 20, y: node.position.y + 20 },
              selected: false,
            };
          },
        );

        const newEdges: Edge<any>[] = (parsed.edges ?? [])
          .map((e: Edge<any>) => {
            const s = map.get(e.source);
            const t = map.get(e.target);
            if (s && t) {
              return {
                ...e,
                id: `reactflow__edge-${s}${e.sourceHandle || ""}-${t}${e.targetHandle || ""}`,
                source: s,
                target: t,
              };
            }
            return null;
          })
          .filter(Boolean) as Edge<any>[];

        set({
          nodes: [...curNodes, ...newNodes],
          edges: [...curEdges, ...newEdges],
        });
        alert(`${newNodes.length} nodes imported successfully!`);
      } catch (err) {
        console.error("Failed to import nodes: ", err);
        alert("Failed to import nodes from clipboard.");
      }
    },

    addScenarioAsGroup: async (scenario, position) => {
      const { nodes: curNodes, edges: curEdges } = get();
      const data = await fetchScenarioData(get().backend, {
        scenarioId: scenario.id,
      });
      if (!data?.nodes?.length) {
        alert(
          `Failed to load scenario data for '${scenario.name}' or it is empty.`,
        );
        return;
      }

      const PADDING = 40;
      let minX = Infinity,
        minY = Infinity,
        maxX = 0,
        maxY = 0;
      data.nodes.forEach((n: Node<any>) => {
        minX = Math.min(minX, n.position.x);
        minY = Math.min(minY, n.position.y);
        const w = (n.width as number) || 250;
        const h = (n.height as number) || 150;
        maxX = Math.max(maxX, n.position.x + w);
        maxY = Math.max(maxY, n.position.y + h);
      });

      const groupPos = position ?? { x: minX, y: minY };
      const groupW = maxX - minX + PADDING * 2;
      const groupH = maxY - minY + PADDING * 2;

      const idPrefix = `group-${scenario.id}-${Date.now()}`;
      const groupId = `group-${idPrefix}`;
      const map = new Map<string, string>();

      const childNodes: Node<any>[] = data.nodes.map((n: Node<any>) => {
        const newId = `${idPrefix}-${n.id}`;
        map.set(n.id, newId);
        return {
          ...n,
          id: newId,
          position: {
            x: n.position.x - minX + PADDING,
            y: n.position.y - minY + PADDING,
          },
          parentNode: groupId,
          extent: "parent",
        };
      });

      const groupNode: Node<any> = {
        id: groupId,
        type: "scenario",
        position: groupPos,
        data: {
          label: scenario.name,
          scenarioId: scenario.id,
          isCollapsed: false,
        },
        // 20260715 - 노드를 숨기고 모달 팝업에서 시나리오 뷰어를 보이도록 변경 처리
        // 시나리오 그룹 노드의 크기를 자식 노드들의 범위에 맞게 설정
        // style: { width: groupW, height: groupH },
      };

      const newEdges: Edge<any>[] = (data.edges ?? []).map((e: Edge<any>) => ({
        ...e,
        id: `${idPrefix}-${e.id}`,
        source: map.get(e.source)!,
        target: map.get(e.target)!,
      }));

      set({
        nodes: [...curNodes, groupNode, ...childNodes],
        edges: [...curEdges, ...newEdges],
      });
    },

    ...createGroupActionStore(set, get),
    ...createEdgeControlActionStore(set, get),

    undo: () => {
      const current = get();
      const snapshot = useBuilderHistoryStore
        .getState()
        .undoSnapshot(makeSnapshot(current));
      if (!snapshot) return;

      set({
        nodes: snapshot.nodes,
        edges: snapshot.edges,
        selectedNodeId: snapshot.selectedNodeId,
        startNodeId: snapshot.startNodeId,
      });
    },

    redo: () => {
      const current = get();
      const snapshot = useBuilderHistoryStore
        .getState()
        .redoSnapshot(makeSnapshot(current));
      if (!snapshot) return;

      set({
        nodes: snapshot.nodes,
        edges: snapshot.edges,
        selectedNodeId: snapshot.selectedNodeId,
        startNodeId: snapshot.startNodeId,
      });
    },

    fetchScenarios: async (options: any) => {
      try {
        const datas = await fetchScenarios(get().backend, options);
        set({ scenarios: datas });
        return datas;
      } catch (e) {
        console.error("Error fetching scenarios:", e);
        alert("Failed to load scenario details.");
        throw e;
      }
    },
    fetchScenario: async (scenarioId) => {
      try {
        const data = await fetchScenarioData(get().backend, { scenarioId });
        // console.log("fetch data ===>", data)
        set({ scenario: { ...get().scenario, ...data } });
        const loadedNodes = (data.nodes ?? []) as Node<any>[];
        const rawEdges = (data.edges ?? []) as Edge<any>[];
        const cleanEdges = sanitizeEdgesForSave(rawEdges, loadedNodes);

        set({
          nodes: loadedNodes,
          edges: cleanEdges,
          selectedNodeId: null,
          startNodeId: (data.startNodeId ?? null) as string | null,
        });
        return data;
      } catch (e) {
        console.error("Error fetching scenario:", e);
        alert("Failed to load scenario details.");
        throw e;
      }
    },

    saveScenario: async (scenario, options) => {
      try {
        const { nodes, edges, startNodeId } = get();
        // console.log('Saving scenario with nodes:', nodes);
        const res = await saveScenarioData(get().backend, {
          scenario,
          data: {
            nodes: sanitizeNodesForSave(nodes),
            edges: sanitizeEdgesForSave(edges, nodes),
            startNodeId,
          },
        });

        if (res?.ltst_ver_id !== undefined) {
          set({
            scenario: {
              ...scenario,
              ...res,
              version_yn: false,
            },
          });
        }

        if (options?.onSuccess) {
          options.onSuccess();
        } else {
          alert(
            `Scenario '${scenario.name}' has been ${scenario.version_yn ? "versioned" : "saved"} successfully!`,
          );
        }
        return res;
      } catch (e: any) {
        // console.error('Error saving scenario:', e);
        if (options?.onError) {
          options.onError(e);
        } else {
          alert(`Failed to save scenario: ${e?.message ?? "unknown error"}`);
        }

        throw e;
      }
    },

    createScenario: async (scenario) => {
      try {
        const res = await createScenario(get().backend, scenario);
        alert(`Scenario '${scenario.name}' has been saved successfully!`);
        return res;
      } catch (e: any) {
        console.error("Error saving scenario:", e);
        alert(`Failed to save scenario: ${e?.message ?? "unknown error"}`);
        throw e;
      }
    },

    patchScenario: async (scenario) => {
      try {
        // console.log('Patching scenario with data === > :', scenario);
        const res = await patchScenario(get().backend, scenario);
        // await showAlert("info", "success", `Scenario '${scenario.name}' has been saved successfully!`);
        return res;
      } catch (e: any) {
        console.error("Error saving scenario:", e);
        alert(`Failed to save scenario: ${e?.message ?? "unknown error"}`);
        throw e;
      }
    },

    deleteScenario: async (scenarioId: string[]) => {
      try {
        await deleteScenario(get().backend, scenarioId);
        alert(`Scenario '${scenarioId}' has been saved successfully!`);
      } catch (e: any) {
        console.error("Error delete scenario:", e);
        alert(`Failed to delete scenario: ${e?.message ?? "unknown error"}`);
        throw e;
      }
    },

    cloneScenario: async (scenario) => {
      try {
        await cloneScenario(get().backend, scenario);
        alert(`Scenario '${scenario.name}' has been clone successfully!`);
      } catch (e: any) {
        console.error("Error clone scenario:", e);
        alert(`Failed to clone scenario: ${e?.message ?? "unknown error"}`);
        throw e;
      }
    },
  }));
