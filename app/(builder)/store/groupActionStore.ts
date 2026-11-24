import useBuilderHistoryStore from "./historyStore";

import { makeSnapshot, type StoreState } from "./index";

import type { Edge, Node } from "reactflow";

type SetState = (
  partial:
    | Partial<StoreState>
    | ((state: StoreState) => Partial<StoreState> | StoreState),
) => void;

type GetState = () => StoreState;

type GroupActions = Pick<StoreState, "groupSelectedNodes" | "ungroupNode">;

export function createGroupActionStore(
  set: SetState,
  get: GetState,
): GroupActions {
  return {
    groupSelectedNodes: (groupLabel = "Selected Group") => {
      useBuilderHistoryStore.getState().push(makeSnapshot(get()));

      const { nodes: curNodes, edges: curEdges } = get();

      const selectedNodes = curNodes.filter(
        (node) =>
          node.selected &&
          !node.parentNode &&
          node.type !== "scenario" &&
          node.type !== "selectionGroup",
      );

      const selectedIds = new Set(selectedNodes.map((node) => node.id));

      const internalEdges = curEdges.filter(
        (edge) => selectedIds.has(edge.source) && selectedIds.has(edge.target),
      );

      const startCandidates = selectedNodes.filter(
        (node) => !internalEdges.some((edge) => edge.target === node.id),
      );

      if (startCandidates.length > 1) {
        alert(
          "그룹 내 시작 노드가 2개 이상입니다. 연결을 정리한 뒤 다시 시도하세요.",
        );
        return;
      }

      const entryNodeId = startCandidates[0]?.id ?? null;

      const exitNodeIds = selectedNodes
        .filter((node) =>
          curEdges.some(
            (edge) => edge.source === node.id && !selectedIds.has(edge.target),
          ),
        )
        .map((node) => node.id);

      const PADDING_X = 60;
      const PADDING_Y = 56;
      const MIN_GROUP_W = 420;
      const MIN_GROUP_H = 260;

      let minX = selectedNodes.length ? Infinity : 160;
      let minY = selectedNodes.length ? Infinity : 160;
      let maxX = 0;
      let maxY = 0;

      selectedNodes.forEach((node) => {
        const width =
          (node.width as number) || Number((node.style as any)?.width) || 250;

        const height =
          (node.height as number) || Number((node.style as any)?.height) || 150;

        minX = Math.min(minX, node.position.x);
        minY = Math.min(minY, node.position.y);
        maxX = Math.max(maxX, node.position.x + width);
        maxY = Math.max(maxY, node.position.y + height);
      });

      const groupId = `group-selected-${Date.now()}`;
      const groupNode: Node<any> = {
        id: groupId,
        type: "selectionGroup",
        position: { x: minX - PADDING_X, y: minY - PADDING_Y },
        data: {
          label: groupLabel,
          title: "Group",
          isCollapsed: false,
          entryNodeId,
          exitNodeIds,
        },
        style: {
          width: Math.max(maxX - minX + PADDING_X * 2, MIN_GROUP_W),
          height: Math.max(maxY - minY + PADDING_Y * 2, MIN_GROUP_H),
        },
        selected: true,
      };

      const nextNodes: Node<any>[] = curNodes.map((node) => {
        const isSelectedTarget = selectedIds.has(node.id);

        if (!isSelectedTarget) {
          return {
            ...node,
            selected: false,
          };
        }

        return {
          ...node,
          parentNode: groupId,
          extent: "parent",
          position: {
            x: node.position.x - (minX - PADDING_X),
            y: node.position.y - (minY - PADDING_Y),
          },
          selected: false,
        };
      });

      const nextEdges: Edge<any>[] = curEdges.map((edge) => {
        const sourceInside = selectedIds.has(edge.source);
        const targetInside = selectedIds.has(edge.target);

        if (sourceInside && targetInside) {
          return edge;
        }

        if (!sourceInside && targetInside) {
          return {
            ...edge,
            target: groupId,
            targetHandle: null,
            data: {
              ...(edge.data ?? {}),
              groupedTargetId: edge.target,
              groupedTargetHandle: edge.targetHandle ?? null,
              groupedBy: groupId,
            },
          };
        }

        if (sourceInside && !targetInside) {
          return {
            ...edge,
            source: groupId,
            sourceHandle: null,
            data: {
              ...(edge.data ?? {}),
              groupedSourceId: edge.source,
              groupedSourceHandle: edge.sourceHandle ?? null,
              groupedBy: groupId,
            },
          };
        }

        return edge;
      });

      set({
        nodes: [groupNode, ...nextNodes],
        edges: nextEdges,
        selectedNodeId: groupId,
      });
    },

    ungroupNode: (groupId) => {
      useBuilderHistoryStore.getState().push(makeSnapshot(get()));

      set((state) => {
        const groupNode = state.nodes.find((node) => node.id === groupId);
        if (!groupNode) return state;

        const groupPosition = groupNode.position || { x: 0, y: 0 };

        const nextNodes = state.nodes
          .filter((node) => node.id !== groupId)
          .map((node) => {
            if (node.parentNode !== groupId) {
              return node;
            }

            return {
              ...node,
              parentNode: undefined,
              extent: undefined,
              position: {
                x: groupPosition.x + node.position.x,
                y: groupPosition.y + node.position.y,
              },
              selected: false,
            };
          });

        const nextEdges = state.edges.map((edge) => {
          const nextData = { ...(edge.data ?? {}) };
          let nextEdge: Edge<any> = edge;

          if (
            edge.target === groupId &&
            nextData.groupedBy === groupId &&
            nextData.groupedTargetId
          ) {
            nextEdge = {
              ...nextEdge,
              target: nextData.groupedTargetId,
              targetHandle: nextData.groupedTargetHandle ?? null,
            };
          }

          if (
            edge.source === groupId &&
            nextData.groupedBy === groupId &&
            nextData.groupedSourceId
          ) {
            nextEdge = {
              ...nextEdge,
              source: nextData.groupedSourceId,
              sourceHandle: nextData.groupedSourceHandle ?? null,
            };
          }

          delete nextData.groupedTargetId;
          delete nextData.groupedTargetHandle;
          delete nextData.groupedSourceId;
          delete nextData.groupedSourceHandle;
          delete nextData.groupedBy;

          return {
            ...nextEdge,
            data: nextData,
          };
        });

        return {
          nodes: nextNodes,
          edges: nextEdges,
          selectedNodeId:
            state.selectedNodeId === groupId ? null : state.selectedNodeId,
          startNodeId: state.startNodeId === groupId ? null : state.startNodeId,
        };
      });
    },
  };
}
