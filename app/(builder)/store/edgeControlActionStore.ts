import { withNodeTitle } from "../utils/nodeTitles";
import useBuilderHistoryStore from "./historyStore";

import { makeSnapshot, type StoreState } from "./index";

import type { Node, Edge } from "reactflow";

export type EdgePoint = { x: number; y: number };

type SetState = (
  partial:
    | Partial<StoreState>
    | ((state: StoreState) => Partial<StoreState> | StoreState),
) => void;

type GetState = () => StoreState;

type EdgeControlActionSlice = Pick<
  StoreState,
  "updateEdgeSegment" | "updateEdgePoints"
>;

function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedDeep(item)) as T;
  }

  if (value && typeof value === "object") {
    const next: Record<string, unknown> = {};

    Object.entries(value as Record<string, unknown>).forEach(
      ([key, current]) => {
        if (current === undefined) return;
        next[key] = stripUndefinedDeep(current);
      },
    );

    return next as T;
  }

  return value;
}

export function createEdgeControlActionStore(
  set: SetState,
  get: GetState,
): EdgeControlActionSlice {
  return {
    updateEdgeSegment: (edgeId, points) => {
      useBuilderHistoryStore.getState().push(makeSnapshot(get()));

      set((state) => ({
        edges: state.edges.map((edge) =>
          edge.id === edgeId
            ? {
                ...edge,
                data: {
                  ...(edge.data ?? {}),
                  points,
                  updateEdgeSegment: get().updateEdgeSegment,
                },
              }
            : edge,
        ),
      }));
    },

    updateEdgePoints: (edgeId, points) => {
      useBuilderHistoryStore.getState().push(makeSnapshot(get()));

      set((state) => ({
        edges: state.edges.map((edge) =>
          edge.id === edgeId
            ? {
                ...edge,
                data: {
                  ...(edge.data ?? {}),
                  points,
                },
              }
            : edge,
        ),
      }));
    },
  };
}

export function sanitizeNodesForSave(nodes: Node<any>[]): Node<any>[] {
  return nodes.map((node) => stripUndefinedDeep(withNodeTitle(node)));
}

export function sanitizeEdgesForSave(
  edges: Edge<any>[],
  nodes?: Node<any>[],
): Edge<any>[] {
  let validEdges = edges;

  if (nodes && nodes.length > 0) {
    const nodeMap = new Map<string, Node<any>>(nodes.map((n) => [n.id, n]));

    validEdges = edges.filter((edge) => {
      const sourceNode = nodeMap.get(edge.source);
      const targetNode = nodeMap.get(edge.target);
      if (!sourceNode || !targetNode) return false;

      if (edge.sourceHandle) {
        // Standard fixed handles across various node types
        const standardFixedHandles = [
          "default",
          "onSuccess",
          "onError",
          "true",
          "false",
          "output-right",
          "output-bottom",
          "output",
          "input-top",
          "input-left",
          "input",
          "Y",
          "N",
        ];
        if (
          standardFixedHandles.includes(edge.sourceHandle) ||
          edge.sourceHandle.startsWith("output") ||
          edge.sourceHandle.startsWith("input")
        ) {
          return true;
        }

        const nodeData = sourceNode.data as any;
        const replies = nodeData?.replies;
        const conditions = nodeData?.conditions;

        let handleExists = false;

        if (Array.isArray(replies)) {
          handleExists = replies.some(
            (r: any) =>
              r?.value === edge.sourceHandle || r?.id === edge.sourceHandle,
          );
        }

        if (!handleExists && Array.isArray(conditions)) {
          handleExists = conditions.some(
            (c: any, index: number) =>
              c?.id === edge.sourceHandle ||
              String(index) === edge.sourceHandle,
          );
        }

        if (!handleExists) return false;
      }

      return true;
    });
  }

  return validEdges.map((edge) => {
    const cleanedData = edge.data
      ? (() => {
          const { updateEdgeSegment, updateEdgePoints, ...restData } =
            edge.data;
          return restData;
        })()
      : undefined;

    return stripUndefinedDeep({
      ...edge,
      data: cleanedData,
    });
  });
}
