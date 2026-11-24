"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import CloseIcon from "@mui/icons-material/Close";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import SaveIcon from "@mui/icons-material/Save";
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Select,
  Stack,
  Typography,
} from "@mui/material";
import { useTranslation } from "@/app/(builder)/hooks/useTranslation";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  useReactFlow,
} from "reactflow";
import "reactflow/dist/style.css";
import "@reactflow/node-resizer/dist/style.css";

import { Copy, Plus, Scissors, Trash } from "lucide-react";

import { NodeControllerEditor } from "../NodeController";
import ApiNode from "../nodes/ApiNode";
import BranchNode from "../nodes/BranchNode";
import DelayNode from "../nodes/DelayNode";
import FixedMenuNode from "../nodes/FixedMenuNode";
import FormNode from "../nodes/FormNode";
import GroupNode from "../nodes/GroupNode";
import IframeNode from "../nodes/IframeNode";
import LinkNode from "../nodes/LinkNode";
import LlmNode from "../nodes/LlmNode";
import MessageNode from "../nodes/MessageNode";
import ScenarioNode from "../nodes/ScenarioNode";
import SetSlotNode from "../nodes/SetSlotNode";
import SlotFillingNode from "../nodes/SlotFillingNode";
import ToastNode from "../nodes/ToastNode";
import CustomOrthogonalEdge from "../edges/CustomOrthogonalEdge";
import { getScenarioVersion } from "../../services/tursoApi";
import { useBuilderStore } from "../../store/index";
import styles from "../../components/Detail.module.css";
import { BuilderNode, BuilderNodeData, InsertTarget } from "../../types/types";
import ActivityPickerModal, { ActivityType } from "./ActivityPickerModal";
import { createNodeData } from "../../utils/nodeFactory";

import type { Edge, Node } from "reactflow";

const nodeTypes = {
  message: MessageNode,
  branch: BranchNode,
  slotfilling: SlotFillingNode,
  api: ApiNode,
  form: FormNode,
  fixedmenu: FixedMenuNode,
  link: LinkNode,
  llm: LlmNode,
  toast: ToastNode,
  iframe: IframeNode,
  scenario: ScenarioNode,
  setSlot: SetSlotNode,
  delay: DelayNode,
  selectionGroup: GroupNode,
};
const edgeTypes = { orthogonal: CustomOrthogonalEdge };
const editableNodeTypes = [
  "message",
  "form",
  "branch",
  "slotfilling",
  "api",
  "llm",
  "setSlot",
  "delay",
  "fixedmenu",
  "link",
  "toast",
  "iframe",
] as const;

type Props = {
  isOpen: boolean;
  onClose: () => void;
  scenario?: {
    id: string;
    name?: string;
    scenario_nm?: string;
    ltst_ver_id?: string;
    job?: string;
    description?: string;
  };
};

type StoreSnapshot = {
  nodes: any[];
  edges: any[];
  selectedNodeId: string | null;
  startNodeId: string | null;
  scenarioEditorActive?: boolean;
  scenarioEditorOwnerNode?: any;
};

// 마우스 우 클릭 메뉴 상태
type ContextMenuState = {
  open: boolean;
  x: number;
  y: number;
  flowPosition?: { x: number; y: number } | null;
  target: any;
};

function EditorCanvas({
  scenario,
}: {
  scenario: NonNullable<Props["scenario"]>;
}) {
  const { t } = useTranslation();
  const { screenToFlowPosition } = useReactFlow();
  const [newNodeType, setNewNodeType] = useState("message");
  const [saving, setSaving] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    deleteNode,
    saveScenario,
    addNode,
    setEdges,
  } = useBuilderStore() as any;

  const selectedNode = nodes.find((node: any) => node.id === selectedNodeId);

  const handleAddNode = () => {
    addNode(
      newNodeType,
      screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      }),
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveScenario({
        ...scenario,
        name: scenario.name || scenario.scenario_nm,
        job: scenario.job || "Process",
        version_yn: false,
      });
    } finally {
      setSaving(false);
    }
  };

  // ========================================================================================================
  // add node 모달 팝업
  const [insertTarget, setInsertTarget] = useState<InsertTarget | null>(null);
  const [activitySearch, setActivitySearch] = useState("");
  const [activityInsertPosition, setActivityInsertPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [recentTypes, setRecentTypes] = useState<ActivityType[]>([
    "message",
    "setSlot",
    "branch",
    "form",
  ]);

  const closeActivityPicker = () => {
    setInsertTarget(null);
    setActivitySearch("");
    setActivityInsertPosition(null);
  };

  const openActivityPicker = useCallback(async (target: InsertTarget) => {
    setInsertTarget(target);
    setActivitySearch("");
  }, []);

  useEffect(() => {
    const handleGroupNodeAdd = (event: Event) => {
      const groupId = (event as CustomEvent<{ groupId?: string }>).detail
        ?.groupId;

      if (!groupId) return;
      openActivityPicker({ parentId: groupId });
    };

    window.addEventListener("flow-uipath:add-group-node", handleGroupNodeAdd);

    return () => {
      window.removeEventListener(
        "flow-uipath:add-group-node",
        handleGroupNodeAdd,
      );
    };
  }, [openActivityPicker]);

  const handleSelectActivity = (type: ActivityType) => {
    if (!insertTarget) return;
    if (
      // unuseNodes.includes(type) ||
      type === "branch" &&
      insertTarget.targetId
    )
      return;

    const sourceNode = insertTarget.sourceId
      ? nodes.find((node: any) => node.id === insertTarget.sourceId)
      : null;
    const targetNode = insertTarget.targetId
      ? nodes.find((node: any) => node.id === insertTarget.targetId)
      : null;
    const data = createNodeData(type) as BuilderNodeData;
    const parentNode = insertTarget.parentId
      ? nodes.find((node: any) => node.id === insertTarget.parentId)
      : null;
    const position = parentNode
      ? {
          x: 40,
          y:
            80 +
            nodes.filter((node: any) => node.parentNode === parentNode.id)
              .length *
              160,
        }
      : sourceNode && targetNode
        ? {
            x: Math.round((sourceNode.position.x + targetNode.position.x) / 2),
            y: Math.round((sourceNode.position.y + targetNode.position.y) / 2),
          }
        : sourceNode
          ? {
              x: sourceNode.position.x,
              y: sourceNode.position.y + 160,
            }
          : targetNode
            ? {
                x: targetNode.position.x,
                y: Math.max(40, targetNode.position.y - 160),
              }
            : (activityInsertPosition ?? { x: 100, y: 100 });

    const newNode: BuilderNode = {
      id: data.id || `${type}-${Date.now()}`,
      type,
      position,
      parentNode: parentNode?.id,
      extent: parentNode ? "parent" : undefined,
      data: {
        ...data,
        flowCollapsed: false,
      },
      selected: true,
    };
    const insertedNodeNextSourceHandle = type === "api" ? "onSuccess" : null;

    if (parentNode) {
      const groupChildren = nodes
        .filter((node: any) => node.parentNode === parentNode.id)
        .slice()
        .sort((a: any, b: any) => (a.position?.y || 0) - (b.position?.y || 0));

      const sourceChild = insertTarget.sourceId
        ? groupChildren.find((node: any) => node.id === insertTarget.sourceId)
        : groupChildren[groupChildren.length - 1];

      const sourceHandle = insertTarget.sourceHandle || null;

      const existingSourceEdge = sourceChild
        ? edges.find(
            (edge: any) =>
              edge.source === sourceChild.id &&
              (edge.sourceHandle || null) === sourceHandle &&
              groupChildren.some((node: any) => node.id === edge.target),
          )
        : null;

      const nextChild = existingSourceEdge
        ? groupChildren.find(
            (node: any) => node.id === existingSourceEdge.target,
          )
        : null;

      const nextEdges = sourceChild
        ? [
            ...edges.filter(
              (edge: any) =>
                !(
                  edge.source === sourceChild.id &&
                  (edge.sourceHandle || null) === sourceHandle &&
                  existingSourceEdge &&
                  edge.target === existingSourceEdge.target
                ),
            ),
            // 필요한 edge 생성 코드
          ]
        : edges;

      useBuilderStore.setState((state: any) => ({
        nodes: [
          ...state.nodes.map((node: BuilderNode) => ({
            ...node,
            selected: false,
          })),
          newNode,
        ],
        edges: nextEdges,
      }));
      setSelectedNodeId(newNode.id);
      setRecentTypes((prev) =>
        [type, ...prev.filter((item) => item !== type)].slice(0, 6),
      );
      closeActivityPicker();
      return;
    }

    // 일반 캔버스에 추가하는 경우
    useBuilderStore.setState((state: any) => ({
      nodes: [
        ...state.nodes.map((node: BuilderNode) => ({
          ...node,
          selected: false,
        })),
        newNode,
      ],
    }));
    setSelectedNodeId(newNode.id);
    setRecentTypes((prev) =>
      [type, ...prev.filter((item) => item !== type)].slice(0, 6),
    );
    closeActivityPicker();
  };
  // ========================================================================================================

  // =================================================================
  // 마우스 우 클릭 메뉴
  const reactFlowWrapper = useRef<HTMLDivElement | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    open: false,
    x: 0,
    y: 0,
    target: null,
  });

  const closeContextMenu = () => {
    setContextMenu({
      open: false,
      x: 0,
      y: 0,
      target: null,
    });
  };

  const MENU_WIDTH = 220;
  const MENU_HEIGHTS = {
    pane: 350,
    node: 56,
    edge: 56,
  } as const;
  const MENU_GAP = 8;

  const getSafeMenuPosition = (
    clientX: number,
    clientY: number,
    menuType: "pane" | "node" | "edge",
  ) => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const menuHeight = MENU_HEIGHTS[menuType];

    let x = clientX;
    let y = clientY;

    if (x + MENU_WIDTH + MENU_GAP > viewportWidth) {
      x = viewportWidth - MENU_WIDTH - MENU_GAP;
    }

    if (y + menuHeight + MENU_GAP > viewportHeight) {
      y = viewportHeight - menuHeight - MENU_GAP;
    }

    x = Math.max(MENU_GAP, x);
    y = Math.max(MENU_GAP, y);

    return { x, y };
  };

  const handlePaneContextMenu = (event: React.MouseEvent) => {
    event.preventDefault();

    const clearedEdges: Edge<any>[] = edges.map((edge: any) => ({
      ...edge,
      selected: false,
    }));

    const { x, y } = getSafeMenuPosition(event.clientX, event.clientY, "pane");
    const flowPosition = screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });

    setSelectedNodeId(null);
    setEdges(clearedEdges);

    setContextMenu({
      open: true,
      x,
      y,
      flowPosition,
      target: { type: "pane" },
    });
  };

  const handleNodeContextMenu = (event: React.MouseEvent, node: Node<any>) => {
    event.preventDefault();
    event.stopPropagation();

    const clearedEdges: Edge<any>[] = edges.map((edge: any) => ({
      ...edge,
      selected: false,
    }));

    const { x, y } = getSafeMenuPosition(event.clientX, event.clientY, "node");
    const flowPosition = screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });

    setSelectedNodeId(node.id);
    setEdges(clearedEdges);

    setContextMenu({
      open: true,
      x,
      y,
      flowPosition,
      target: { type: "node", id: node.id },
    });
  };

  return (
    <Box sx={{ display: "flex", flex: 1, minWidth: 0, minHeight: 0 }}>
      <Box
        ref={reactFlowWrapper}
        sx={{ position: "relative", flex: 1, minWidth: 0 }}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={(_, node) => setSelectedNodeId(node.id)}
          onPaneClick={() => setSelectedNodeId(null)}
          deleteKeyCode="Delete"
          fitView
          defaultEdgeOptions={{ type: "orthogonal" }}
          // 마우스 우클릭 메뉴 custom 수정
          onPaneContextMenu={handlePaneContextMenu}
          onNodeContextMenu={handleNodeContextMenu}
        >
          <Controls />
          <MiniMap zoomable pannable />
          <Background gap={16} />
        </ReactFlow>
        {/* 캔버스 마우스 우클릭 메뉴 */}
        {contextMenu.open && (
          <div
            className={styles.layerMenu}
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              type="button"
              className={`${styles.layerMenuItem}`}
              onClick={() => {
                const position = contextMenu.flowPosition ?? { x: 100, y: 100 };

                setActivityInsertPosition(position);
                closeContextMenu();
                void openActivityPicker({});
              }}
            >
              <Plus size={16} className={styles.layerMenuIcon} />
              <span>{t("Add Node")}</span>
            </button>
          </div>
        )}
        {/* 노드 우클릭 */}
        {contextMenu.open && contextMenu.target?.type === "node" && (
          <div
            className={styles.layerMenu}
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              type="button"
              className={styles.layerMenuItem}
              onClick={() => {
                deleteNode(contextMenu.target.id);
                closeContextMenu();
              }}
            >
              <Trash size={16} className={styles.layerMenuIcon} />
              <span>{t("Delete Node")}</span>
            </button>
          </div>
        )}
        <Stack
          direction="row"
          spacing={1}
          sx={{ position: "absolute", zIndex: 5, top: 12, left: 12 }}
        >
          <Select
            size="small"
            value={newNodeType}
            onChange={(event) => setNewNodeType(event.target.value)}
            sx={{ minWidth: 150, bgcolor: "background.paper" }}
          >
            {editableNodeTypes.map((type) => (
              <MenuItem key={type} value={type}>
                {type}
              </MenuItem>
            ))}
          </Select>
          <Button variant="contained" onClick={handleAddNode}>
            {t("Add Node")}
          </Button>
          <Button
            variant="outlined"
            color="error"
            startIcon={<DeleteOutlinedIcon />}
            disabled={!selectedNodeId}
            onClick={() => {
              if (selectedNodeId) deleteNode(selectedNodeId);
              setSelectedNodeId(null);
            }}
          >
            {t("Delete")}
          </Button>
          <Button
            variant="contained"
            color="success"
            startIcon={<SaveIcon />}
            disabled={saving}
            onClick={handleSave}
          >
            {saving ? t("Saving...") : t("Save")}
          </Button>
        </Stack>
      </Box>
      <Box
        sx={{
          width: 400,
          minWidth: 400,
          overflow: "auto",
          borderLeft: 1,
          borderColor: "divider",
          bgcolor: "background.paper",
        }}
      >
        <NodeControllerEditor
          key={selectedNode?.id ?? "empty"}
          selectedNode={selectedNode}
        />
      </Box>
      {/* add node modal */}
      <ActivityPickerModal
        open={Boolean(insertTarget)}
        search={activitySearch}
        recentTypes={recentTypes}
        // hiddenTypes={
        //   userInfoJson.unuse_nodes && !insertTarget?.targetId
        //     ? userInfoJson.unuse_nodes
        //     : insertTarget?.targetId
        //       ? unuseNodes
        //       : []
        // }
        onSearchChange={setActivitySearch}
        onClose={closeActivityPicker}
        onSelect={handleSelectActivity}
      />
    </Box>
  );
}

export default function ScenarioFlowEditorModal({
  isOpen,
  onClose,
  scenario,
}: Props) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const snapshotRef = useRef<StoreSnapshot | null>(null);

  const restoreStore = useCallback(() => {
    if (!snapshotRef.current) return;
    useBuilderStore.setState(snapshotRef.current);
    snapshotRef.current = null;
  }, []);
  const handleClose = useCallback(() => {
    restoreStore();
    onClose();
  }, [onClose, restoreStore]);

  useEffect(() => () => restoreStore(), [restoreStore]);

  useEffect(() => {
    if (!isOpen || !scenario?.id || !scenario.ltst_ver_id) return;
    const current = useBuilderStore.getState() as any;
    snapshotRef.current ??= {
      nodes: current.nodes,
      edges: current.edges,
      selectedNodeId: current.selectedNodeId,
      startNodeId: current.startNodeId,
      scenarioEditorActive: current.scenarioEditorActive,
      scenarioEditorOwnerNode: current.scenarioEditorOwnerNode,
    };
    useBuilderStore.setState({
      scenarioEditorActive: true,
      scenarioEditorOwnerNode: current.nodes.find(
        (node: any) => node.id === current.selectedNodeId,
      ),
    } as any);
    let active = true;
    void Promise.resolve()
      .then(() => {
        if (!active) return null;
        setLoading(true);
        setError("");
        return getScenarioVersion({
          scenario_id: scenario.id,
          version_id: scenario.ltst_ver_id,
        });
      })
      .then((result: any) => {
        if (!active || !result) return;
        useBuilderStore.setState({
          nodes: Array.isArray(result?.nodes) ? result.nodes : [],
          edges: Array.isArray(result?.edges) ? result.edges : [],
          startNodeId: result?.startNodeId ?? result?.start_node_id ?? null,
        });
      })
      .catch(() => active && setError(t("Failed to load scenario data.")))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [isOpen, scenario?.id, scenario?.ltst_ver_id, t]);

  return (
    <Dialog open={isOpen} onClose={handleClose} fullScreen>
      <DialogTitle
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: 1,
          borderColor: "divider",
          py: 1,
          pr: 1,
        }}
      >
        {scenario?.name || scenario?.scenario_nm || t("Scenario Editor")}
        <IconButton onClick={handleClose} aria-label={t("Close")}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ display: "flex", flex: 1, minHeight: 0, p: 0 }}>
        {!scenario ? (
          <Typography sx={{ color: "text.secondary", ...{ m: "auto" } }}>
            {t("Please select a scenario.")}
          </Typography>
        ) : loading ? (
          <CircularProgress sx={{ m: "auto" }} />
        ) : error ? (
          <Typography sx={{ color: "error", ...{ m: "auto" } }}>
            {error}
          </Typography>
        ) : (
          <ReactFlowProvider>
            <EditorCanvas scenario={scenario} />
          </ReactFlowProvider>
        )}
      </DialogContent>
    </Dialog>
  );
}
