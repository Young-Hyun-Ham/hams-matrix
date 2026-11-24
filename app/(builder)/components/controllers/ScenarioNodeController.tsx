import { useState } from "react";
import { useTranslation } from "@/app/(builder)/hooks/useTranslation";
import { type Edge, type Node } from "reactflow";

import { fetchScenarioData } from "../../services/backendService";
import { useBuilderStore } from "../../store/index";
import styles from "../NodeController.module.css";
import ScenarioGroupModal from "../modals/ScenarioGroupModal";
import ScenarioViewModal from "../modals/ScenarioFlowViewerModal";
import ScenarioFlowEditorModal from "../modals/ScenarioFlowEditorModal";
import { BuilderAppearanceContext } from "../BuilderAppearance";

type ScenarioLocalNode = {
  id: string;
  data?: {
    label?: string;
    title?: string;
    scenarioId?: string;
  };
};

type ScenarioNodeControllerProps = {
  localNode: ScenarioLocalNode;
  setLocalNode: (
    updater: (prev: ScenarioLocalNode) => ScenarioLocalNode,
  ) => void;
};

const GROUP_PADDING_X = 40;
const GROUP_PADDING_TOP = 110;
const GROUP_PADDING_BOTTOM = 56;
const NODE_GAP_X = 96;
const NODE_GAP_Y = 78;
const DEFAULT_NODE_WIDTH = 260;
const DEFAULT_NODE_HEIGHT = 110;

const normalizeSourceHandle = (sourceHandle?: string | null) =>
  !sourceHandle || sourceHandle === "default" ? null : sourceHandle;

const getNodeSize = (node: Node<any>) => {
  const style = (node.style ?? {}) as Record<string, unknown>;

  return {
    width:
      Number(node.width ?? style.width) ||
      (node.type === "form" ? 300 : DEFAULT_NODE_WIDTH),
    height:
      Number(node.height ?? style.height) ||
      (node.type === "branch" ? 250 : DEFAULT_NODE_HEIGHT),
  };
};

const getNodeHandles = (node: Node<any>): string[] => {
  const data = node.data ?? {};

  if (node.type === "api") return ["onSuccess", "onError"];

  if (node.type === "branch") {
    if (data.evaluationType === "CONDITION" && data.conditions?.length) {
      return [
        ...data.conditions.map(
          (condition: any, index: number) =>
            data.replies?.[index]?.value ||
            condition.id ||
            `condition-${index}`,
        ),
        "default",
      ];
    }

    if (data.replies?.length) {
      return data.replies.map(
        (reply: any, index: number) => reply.value || `reply-${index}`,
      );
    }
  }

  return ["default"];
};

const getScenarioImportNodes = (nodes: Node<any>[]) => {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const containerIds = new Set(
    nodes
      .filter(
        (node) =>
          node.type === "scenario" &&
          nodes.some((childNode) => childNode.parentNode === node.id),
      )
      .map((node) => node.id),
  );

  if (!containerIds.size) return nodes;

  return nodes.filter((node) => {
    if (containerIds.has(node.id)) return false;

    let parentId = node.parentNode;
    while (parentId) {
      if (containerIds.has(parentId)) return true;
      parentId = nodeById.get(parentId)?.parentNode;
    }

    return false;
  });
};

const getFallbackSourceHandle = (
  sourceNode: Node<any>,
  targetNode: Node<any>,
) => {
  const handles = getNodeHandles(sourceNode);
  if (handles.length <= 1) return normalizeSourceHandle(handles[0]);

  const sourceSize = getNodeSize(sourceNode);
  const targetSize = getNodeSize(targetNode);
  const sourceX = sourceNode.position?.x ?? 0;
  const targetCenterX = (targetNode.position?.x ?? 0) + targetSize.width / 2;
  const relativeX = Math.min(
    1,
    Math.max(0, (targetCenterX - sourceX) / sourceSize.width),
  );
  const handleIndex = Math.min(
    handles.length - 1,
    Math.max(0, Math.floor(relativeX * handles.length)),
  );

  return normalizeSourceHandle(handles[handleIndex]);
};

const createFallbackScenarioEdges = (nodes: Node<any>[]): Edge<any>[] => {
  if (nodes.length < 2) return [];

  const sortedNodes = [...nodes].sort((a, b) => {
    const yDiff = (a.position?.y ?? 0) - (b.position?.y ?? 0);
    if (yDiff !== 0) return yDiff;

    return (a.position?.x ?? 0) - (b.position?.x ?? 0);
  });

  return sortedNodes.slice(0, -1).map((sourceNode, index) => {
    const targetNode = sortedNodes[index + 1];
    const sourceHandle = getFallbackSourceHandle(sourceNode, targetNode);

    return {
      id: `fallback-edge-${sourceNode.id}${sourceHandle || ""}-${targetNode.id}`,
      source: sourceNode.id,
      target: targetNode.id,
      sourceHandle,
      targetHandle: null,
    };
  });
};

const layoutScenarioNodesTopDown = (
  sourceNodes: Node<any>[],
  sourceEdges: Edge<any>[],
  startNodeId?: string | null,
) => {
  const nodeById = new Map(sourceNodes.map((node) => [node.id, node]));
  const measured = new Map<string, number>();
  const positioned = new Map<string, { x: number; y: number }>();
  const placed = new Set<string>();

  const getEdgeForHandle = (nodeId: string, handleId: string) => {
    const sourceHandle = normalizeSourceHandle(handleId);

    return sourceEdges.find(
      (edge) =>
        edge.source === nodeId &&
        normalizeSourceHandle(edge.sourceHandle) === sourceHandle &&
        nodeById.has(edge.target),
    );
  };

  const measure = (nodeId: string, visited = new Set<string>()): number => {
    if (visited.has(nodeId)) return DEFAULT_NODE_WIDTH;
    if (measured.has(nodeId)) return measured.get(nodeId) || DEFAULT_NODE_WIDTH;

    const node = nodeById.get(nodeId);
    if (!node) return DEFAULT_NODE_WIDTH;

    const size = getNodeSize(node);
    const handles = getNodeHandles(node);
    const nextVisited = new Set(visited);
    nextVisited.add(nodeId);
    const childWidths = handles.map((handleId) => {
      const edge = getEdgeForHandle(nodeId, handleId);

      return edge?.target ? measure(edge.target, nextVisited) : size.width;
    });
    const childrenWidth =
      childWidths.reduce((sum, width) => sum + width, 0) +
      NODE_GAP_X * Math.max(0, childWidths.length - 1);
    const width = Math.max(size.width, childrenWidth);

    measured.set(nodeId, width);
    return width;
  };

  const place = (
    nodeId: string,
    centerX: number,
    y: number,
    visited = new Set<string>(),
  ) => {
    if (visited.has(nodeId)) return;

    const node = nodeById.get(nodeId);
    if (!node) return;

    const size = getNodeSize(node);
    positioned.set(nodeId, {
      x: Math.max(GROUP_PADDING_X, centerX - size.width / 2),
      y,
    });
    placed.add(nodeId);

    const handles = getNodeHandles(node);
    const nextVisited = new Set(visited);
    nextVisited.add(nodeId);
    const childWidths = handles.map((handleId) => {
      const edge = getEdgeForHandle(nodeId, handleId);

      return edge?.target ? measure(edge.target, nextVisited) : size.width;
    });
    const totalChildrenWidth =
      childWidths.reduce((sum, width) => sum + width, 0) +
      NODE_GAP_X * Math.max(0, childWidths.length - 1);
    let nextX = centerX - totalChildrenWidth / 2;

    handles.forEach((handleId, index) => {
      const edge = getEdgeForHandle(nodeId, handleId);
      const laneWidth = childWidths[index];

      if (edge?.target) {
        place(
          edge.target,
          nextX + laneWidth / 2,
          y + size.height + NODE_GAP_Y,
          nextVisited,
        );
      }

      nextX += laneWidth + NODE_GAP_X;
    });
  };

  const incomingTargets = new Set(
    sourceEdges
      .filter((edge) => nodeById.has(edge.source) && nodeById.has(edge.target))
      .map((edge) => edge.target),
  );
  const configuredStart =
    startNodeId && nodeById.has(startNodeId) ? nodeById.get(startNodeId) : null;
  const roots = configuredStart
    ? [configuredStart]
    : sourceNodes.filter((node) => !incomingTargets.has(node.id));
  const layoutRoots = roots.length > 0 ? roots : sourceNodes.slice(0, 1);
  const rootWidths = layoutRoots.map((node) => measure(node.id));
  const totalRootWidth =
    rootWidths.reduce((sum, width) => sum + width, 0) +
    NODE_GAP_X * Math.max(0, rootWidths.length - 1);
  let rootX = GROUP_PADDING_X + totalRootWidth / 2;

  layoutRoots.forEach((node, index) => {
    const rootWidth = rootWidths[index];
    place(
      node.id,
      rootX - totalRootWidth / 2 + rootWidth / 2,
      GROUP_PADDING_TOP,
    );
    rootX += rootWidth + NODE_GAP_X;
  });

  sourceNodes.forEach((node) => {
    if (placed.has(node.id)) return;

    const width = measure(node.id);
    const nextY =
      Math.max(
        GROUP_PADDING_TOP,
        ...Array.from(positioned.entries()).map(([id, position]) => {
          const size = getNodeSize(nodeById.get(id) as Node<any>);
          return position.y + size.height + NODE_GAP_Y;
        }),
      ) || GROUP_PADDING_TOP;

    place(node.id, GROUP_PADDING_X + width / 2, nextY);
  });

  let maxX = GROUP_PADDING_X + DEFAULT_NODE_WIDTH;
  let maxY = GROUP_PADDING_TOP + DEFAULT_NODE_HEIGHT;
  sourceNodes.forEach((node) => {
    const position = positioned.get(node.id) || {
      x: GROUP_PADDING_X,
      y: GROUP_PADDING_TOP,
    };
    const size = getNodeSize(node);

    maxX = Math.max(maxX, position.x + size.width);
    maxY = Math.max(maxY, position.y + size.height);
  });

  return {
    positions: positioned,
    width: Math.max(620, maxX + GROUP_PADDING_X),
    height: Math.max(260, maxY + GROUP_PADDING_BOTTOM),
  };
};

const collectScenarioChildIds = (nodes: Node<any>[], parentId: string) => {
  const childIds = new Set<string>();
  let changed = true;

  while (changed) {
    changed = false;
    nodes.forEach((node) => {
      if (!node.parentNode) return;
      if (node.parentNode !== parentId && !childIds.has(node.parentNode)) {
        return;
      }
      if (childIds.has(node.id)) return;

      childIds.add(node.id);
      changed = true;
    });
  }

  return childIds;
};

const importScenarioIntoOrkesNode = async ({
  backend,
  scenario,
  targetNodeId,
  nodes,
  edges,
  setNodes,
  setEdges,
}: {
  backend: any;
  scenario: { id: string; name?: string; scenario_nm?: string };
  targetNodeId: string;
  nodes: Node<any>[];
  edges: Edge<any>[];
  setNodes: (nodes: Node<any>[]) => void;
  setEdges: (edges: Edge<any>[]) => void;
}) => {
  const data = await fetchScenarioData(backend ?? "fastapi", scenario.id);
  const rawNodes = Array.isArray(data?.nodes)
    ? (data.nodes as Node<any>[])
    : [];
  const sourceNodes = getScenarioImportNodes(rawNodes);

  if (!sourceNodes.length) {
    alert(
      `Failed to load scenario data for '${scenario.name || scenario.scenario_nm}' or it is empty.`,
    );
    return;
  }

  const importNodeIds = new Set(sourceNodes.map((node) => node.id));
  const sourceEdgesFromData = Array.isArray(data?.edges)
    ? (data.edges as Edge<any>[]).filter(
        (edge) =>
          importNodeIds.has(edge.source) && importNodeIds.has(edge.target),
      )
    : [];
  const sourceEdges = sourceEdgesFromData.length
    ? sourceEdgesFromData
    : createFallbackScenarioEdges(sourceNodes);
  const layout = layoutScenarioNodesTopDown(
    sourceNodes,
    sourceEdges,
    data?.startNodeId,
  );
  const idPrefix = `scenario-${targetNodeId}-${scenario.id}-${Date.now()}`;
  const idMap = new Map<string, string>();

  const importedNodes = sourceNodes.map((node) => {
    const nextId = `${idPrefix}-${node.id}`;
    idMap.set(node.id, nextId);
    const nodeForImport = { ...node } as Node<any> & {
      positionAbsolute?: { x: number; y: number };
    };
    delete nodeForImport.positionAbsolute;
    delete nodeForImport.selected;
    delete nodeForImport.dragging;
    delete nodeForImport.parentNode;
    delete nodeForImport.extent;

    return {
      ...nodeForImport,
      id: nextId,
      data: {
        ...(node.data ?? {}),
        flowCollapsed: false,
        isCollapsed: false,
      },
      selected: false,
      dragging: false,
      position: layout.positions.get(node.id) || {
        x: GROUP_PADDING_X,
        y: GROUP_PADDING_TOP,
      },
      parentNode: targetNodeId,
      extent: "parent" as const,
    };
  });

  const importedEdges = sourceEdges
    .map((edge) => {
      const source = idMap.get(edge.source);
      const target = idMap.get(edge.target);
      if (!source || !target) return null;

      return {
        ...edge,
        id: `reactflow__edge-${source}${edge.sourceHandle || ""}-${target}`,
        source,
        target,
        selected: false,
      };
    })
    .filter(Boolean) as Edge<any>[];
  const removeIds = collectScenarioChildIds(nodes, targetNodeId);
  const retainedNodes = nodes
    .filter((node) => !removeIds.has(node.id))
    .map((node) =>
      node.id === targetNodeId
        ? {
            ...node,
            data: {
              ...(node.data ?? {}),
              label: scenario.name || scenario.scenario_nm || node.data?.label,
              title: scenario.name || scenario.scenario_nm || node.data?.title,
              scenarioId: scenario.id,
              isCollapsed: false,
              flowScenarioWidth: layout.width,
              flowScenarioHeight: layout.height,
            },
            style: {
              ...(node.style ?? {}),
              width: layout.width,
              height: layout.height,
            },
          }
        : node,
    );
  const retainedEdges = edges.filter(
    (edge) => !removeIds.has(edge.source) && !removeIds.has(edge.target),
  );

  setNodes([...retainedNodes, ...importedNodes]);
  setEdges([...retainedEdges, ...importedEdges]);
};

function ScenarioNodeController({
  localNode,
  setLocalNode,
}: ScenarioNodeControllerProps) {
  const { t } = useTranslation();

  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [isGroupViewModalOpen, setIsGroupViewModalOpen] = useState(false);
  const [isGroupEditorModalOpen, setIsGroupEditorModalOpen] = useState(false);
  const scenarios = useBuilderStore((state) => state.scenarios);
  const scenario: any = scenarios.find((s: any) => s.id === localNode.id);
  const backend = useBuilderStore((state) => state.backend);
  const nodes = useBuilderStore((state) => state.nodes);
  const edges = useBuilderStore((state) => state.edges);
  const setNodes = useBuilderStore((state) => state.setNodes);
  const setEdges = useBuilderStore((state) => state.setEdges);

  const data = localNode.data || {};
  const selectedScenario: any = scenarios.find(
    (item: any) => item.id === data.scenarioId,
  );
  const title = data.label || data.title || "";

  const updateTitle = (value: string) => {
    setLocalNode((prev) => ({
      ...prev,
      data: {
        ...prev.data,
        label: value,
        title: value,
      },
    }));
  };

  return (
    <>
      <ScenarioGroupModal
        isOpen={isGroupModalOpen}
        onClose={() => setIsGroupModalOpen(false)}
        scenarios={scenarios.filter((s: any) => s.id !== scenario?.id)}
        onSelect={async (selected: any) => {
          setLocalNode((prev) => ({
            ...prev,
            data: {
              ...prev.data,
              label: selected.name || selected.scenario_nm,
              title: selected.name || selected.scenario_nm,
              scenarioId: selected.id,
              isCollapsed: false,
            },
          }));
          setIsGroupModalOpen(false);
        }}
      />

      <BuilderAppearanceContext.Provider value={null}>
        <ScenarioViewModal
          isOpen={isGroupViewModalOpen}
          onClose={() => setIsGroupViewModalOpen(false)}
          scenario={selectedScenario}
        />

        <ScenarioFlowEditorModal
          isOpen={isGroupEditorModalOpen}
          onClose={() => setIsGroupEditorModalOpen(false)}
          scenario={selectedScenario}
        />
      </BuilderAppearanceContext.Provider>

      <div className={styles.formGroup}>
        <label>{t("Group header")}</label>
        <input
          value={title}
          onChange={(event) => updateTitle(event.target.value)}
          placeholder={t("Selected Group")}
        />
      </div>

      <div className={styles.formGroup}>
        <button
          type="button"
          className={styles.addReplyButton}
          onClick={() => setIsGroupModalOpen(true)}
        >
          {t("Select Scenario")}
        </button>
        {/* hidden scenario viewer button per user request */}
        <button
          type="button"
          className={styles.addReplyButton}
          onClick={() => {
            if (selectedScenario) {
              window.dispatchEvent(
                new CustomEvent("flow:open-scenario-tab", {
                  detail: { scenario: selectedScenario },
                }),
              );
            } else {
              alert(t("Please select a scenario first."));
            }
          }}
        >
          {t("Open Scenario in Tab")}
        </button>
      </div>
    </>
  );
}

export default ScenarioNodeController;
