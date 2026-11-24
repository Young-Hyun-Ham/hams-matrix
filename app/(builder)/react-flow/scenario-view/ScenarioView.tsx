"use client";

import { useTranslation } from "@/app/(builder)/hooks/useTranslation";

import { getSafeUUID } from "../../utils/util";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import ReactFlow, {
  Controls,
  useReactFlow,
  MiniMap,
  Background,
  MarkerType,
  Panel,
  SelectionMode,
} from "reactflow";
import "reactflow/dist/style.css";

import {
  Box,
  FormControl,
  Select,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  TextField,
  Button,
  Typography,
  Stack,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { ReactFlowProvider } from "reactflow";
import {
  Hand,
  MousePointer2,
  ChevronLeft,
  ChevronRight,
  NotebookPen,
  Activity,
  Sparkles,
  ArrowLeft,
  Play,
  Square,
  FileText,
  Rocket,
  History,
  RotateCcw,
} from "lucide-react";

import useBuilderHistoryStore from "../../store/historyStore";
import {
  useBuilderStore,
  ALL_NODE_TYPES,
  makeSnapshot,
} from "../../store/index";
import styles from "../../components/Detail.module.css";
import MessageNode from "../../components/nodes/MessageNode";
import BranchNode from "../../components/nodes/BranchNode";
import SlotFillingNode from "../../components/nodes/SlotFillingNode";
import ApiNode from "../../components/nodes/ApiNode";
import FormNode from "../../components/nodes/FormNode";
import FixedMenuNode from "../../components/nodes/FixedMenuNode";
import LinkNode from "../../components/nodes/LinkNode";
import LlmNode from "../../components/nodes/LlmNode";
import ToastNode from "../../components/nodes/ToastNode";
import IframeNode from "../../components/nodes/IframeNode";
import ScenarioNode from "../../components/nodes/ScenarioNode";
import SetSlotNode from "../../components/nodes/SetSlotNode";
import DelayNode from "../../components/nodes/DelayNode";
import GroupNode from "../../components/nodes/GroupNode";
import SlotDisplay from "../../components/SlotDisplay";
import NodeController from "../../components/NodeController";
import VersionTreeUI, {
  MOCK_UP_TREE_DATA,
} from "../../components/VersionsTreeUI";
import ChatbotSimulator from "../../components/ChatbotSimulator";

import "@reactflow/node-resizer/dist/style.css";
import CustomOrthogonalEdge from "../../components/edges/CustomOrthogonalEdge";

// 플레이(실행) 스토어
import { useBuilderExecution } from "../../components/controllers/hooks/useBuilderExecution";
import { builderExecutionStore } from "../../store/builderExecutionStore";
// 클립보드 스토어
import { builderClipboardStore } from "../../store/builderClipboardStore";
import MemoPad from "../../components/MemoPad";
import CanvasMemoLayer from "../../components/CanvasMemoLayer";
import { MemoCanvasItem } from "../../components/CanvasMemoItem";
import ScenarioGroupModal from "../../components/modals/ScenarioGroupModal";
import LogPreview from "../../components/modals/LogPreview";
import { Scenario, TreeItem } from "../../types/types";
import {
  getScenarioVersion,
  restoreScenarioVersion,
  scenarioVersionDeploy,
} from "../../services/backendService";
import DeployHistoryListModal from "../../components/modals/DeployHistoryModal";

import type { Edge, Node } from "reactflow";

import { useModal } from "@/app/(builder)/providers/ModalProvider";
import { COLORS } from "@/app/(builder)/constants/color";

import { useBuilderRuntime as useStore } from "@/app/(builder)/providers/runtime";

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
} as const;

const edgeTypes = {
  orthogonal: CustomOrthogonalEdge,
};

// 💡 [추가] 노드 레이블 매핑
const nodeLabels = {
  message: "+ Message",
  form: "+ Form",
  branch: "+ Condition Branch",
  slotfilling: "+ SlotFilling",
  api: "+ API",
  llm: "+ LLM",
  setSlot: "+ Set Slot",
  delay: "+ Delay",
  fixedmenu: "+ Fixed Menu",
  link: "+ Link",
  toast: "+ Toast",
  iframe: "+ iFrame",
  scenario: "+ Scenario Group", // Scenario Group 버튼용
} as any;

type ToolMode = "pan" | "select";

type LayerMenuState = {
  open: boolean;
  x: number;
  y: number;
};

type MenuTarget =
  | { type: "pane" }
  | { type: "node"; id: string }
  | { type: "edge"; id: string };

type ContextMenuState = {
  open: boolean;
  x: number;
  y: number;
  flowPosition?: { x: number; y: number } | null;
  target: any;
};

const Flow = ({ scenario, scenarios }: any) => {
  const { t } = useTranslation();
  const { showAlert, showConfirm } = useModal();
  const router = useRouter();
  const {
    backend,
    userInfoJson,
    loadingUserData,
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    addNode,
    setNodes,
    setEdges,
    selectedNodeId,
    setSelectedNodeId,
    duplicateNode,
    deleteSelectedEdges,
    nodeColors,
    exportSelectedNodes,
    visibleNodeTypes,
    deleteNodesByIds,
    addScenarioAsGroup,
    // 그룹노드 추가
    groupSelectedNodes,
    // undo/redo 기능 추가
    undo,
    redo,
    setScenario,
    selectedVersionId,
    setSelectedVersionId,
    setStartNodeId,
  } = useBuilderStore() as any;

  const { getNodes, project, setCenter } = useReactFlow();
  const reactFlowWrapper = useRef<HTMLDivElement | null>(null);

  const [toolMode, setToolMode] = useState<ToolMode>("pan");
  const isPanMode = toolMode === "pan";
  const isSelectMode = toolMode === "select";

  const [rightPanelWidth, setRightPanelWidth] = useState(400);
  const [isSimulatorVisible, setIsSimulatorVisible] = useState(false);
  const [isSimulatorExpanded, setIsSimulatorExpanded] = useState(false);
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);

  const [isLogVisible, setIsLogVisible] = useState(false);

  // 캔버스 노드 다중 선택
  const [selectedNodes, setSelectedNodes] = useState<any[]>([]);
  // 캔버스 노드 검색 기능
  const [searchType, setSearchType] = useState<string>("all");
  const [searchKeyword, setSearchKeyword] = useState("");
  // 캔버스 패널 접기/펼치기 상태
  const [isCanvasPanelCollapsed, setIsCanvasPanelCollapsed] = useState(false);
  // 에뮬 실행 데이터 표시 패널 상태 ( 캔버스 패널 height 조정 위해 별도 상태로 분리 )
  const [isSlotDisplayVisible, setIsSlotDisplayVisible] = useState(false);
  const [canvasPanelHeight, setCanvasPanelHeight] = useState(0);

  const searchPanelRef = useRef<HTMLDivElement | null>(null);
  // 좌측 노드 패널 옵션
  // isMenuView - 노드가 없을 경우 노드 패널 활설화(새로생성), 상세보기 노드 패널 숨김.
  const nodeTreeUIOptions = useMemo(() => {
    return {
      isMenuView: nodes.length === 0 ? false : isSimulatorVisible,
    };
  }, [nodes, isSimulatorVisible]);

  useEffect(() => {
    // admin sidebar를 닫는 로직 추가

    let active = true;
    const onload = async () => {
      if (scenario) {
        const payload = {
          scenario_id: scenario.id,
          version_id: selectedVersionId ?? scenario.ltst_ver_id,
        };
        // console.log("===========================> detail 조회: ", scenario)
        const res: any = await getScenarioVersion(backend, payload);
        if (!active) return;
        setSelectedVersionId(selectedVersionId ?? scenario.ltst_ver_id);
        setNodes(res.nodes || []);
        setEdges(res.edges || []);
        setStartNodeId(res.startNodeId || null);
      }
    };

    void onload().catch((error) => {
      if (active) void showAlert(error.message);
    });
    return () => {
      active = false;
    };
  }, []);

  const { selectBranchReply, cancelBranchReplySelection } = useBuilderExecution(
    { nodes, edges } as any,
  );

  const pendingBranchSelection = builderExecutionStore(
    (state) => state.pendingBranchSelection,
  );

  const executionLogs = builderExecutionStore((state) => state.executionLogs);
  const executionError = builderExecutionStore((state) => state.executionError);
  const [isExecutionLogVisible, setIsExecutionLogVisible] = useState(false);

  // 20260317 - 클립보드
  const copySelection = builderClipboardStore((state) => state.copySelection);
  const cutSelection = builderClipboardStore((state) => state.cutSelection);
  const pasteClipboard = builderClipboardStore((state) => state.pasteClipboard);

  // ===========================================================
  // 메모 패드 상태 추가
  const [isMemoVisible, setIsMemoVisible] = useState(false);
  const [memos, setMemos] = useState([
    {
      id: getSafeUUID(),
      text: "",
      backgroundColor: "#fff7c2",
      textColor: "#111827",
    },
  ]) as any[];
  // ===========================================================

  // ===========================================================
  // 캔버스 메모 상태 추가
  const [memoNodes, setMemoNodes] = useState<MemoCanvasItem[]>([]);
  const [selectedMemoId, setSelectedMemoId] = useState<string | null>(null);
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });

  const resizeStateRef = useRef<{
    id: string;
    startClientX: number;
    startClientY: number;
    startWidth: number;
    startHeight: number;
  } | null>(null);

  const dragStateRef = useRef<{
    id: string;
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
  } | null>(null);

  const updateMemoNode = useCallback(
    (id: string, patch: Partial<MemoCanvasItem>) => {
      setMemoNodes((prev) =>
        prev.map((memo) => (memo.id === id ? { ...memo, ...patch } : memo)),
      );
    },
    [],
  );

  const removeMemoNode = useCallback((id: string) => {
    setMemoNodes((prev) => prev.filter((memo) => memo.id !== id));

    setSelectedMemoId((prev) => (prev === id ? null : prev));
  }, []);

  const toggleMemoCollapsed = useCallback((id: string) => {
    setMemoNodes((prev) =>
      prev.map((memo) =>
        memo.id === id ? { ...memo, isCollapsed: !memo.isCollapsed } : memo,
      ),
    );
  }, []);

  const handleMemoPointerDown = (event: React.PointerEvent, id: string) => {
    const memo = memoNodes.find((item) => item.id === id);
    if (!memo) return;

    dragStateRef.current = {
      id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: memo.x,
      startY: memo.y,
    };
  };

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const drag = dragStateRef.current;
      if (drag) {
        const dx = (event.clientX - drag.startClientX) / viewport.zoom;
        const dy = (event.clientY - drag.startClientY) / viewport.zoom;

        setMemoNodes((prev) =>
          prev.map((memo) =>
            memo.id === drag.id
              ? { ...memo, x: drag.startX + dx, y: drag.startY + dy }
              : memo,
          ),
        );
      }

      const resize = resizeStateRef.current;
      if (resize) {
        const dx = (event.clientX - resize.startClientX) / viewport.zoom;
        const dy = (event.clientY - resize.startClientY) / viewport.zoom;

        setMemoNodes((prev) =>
          prev.map((memo) =>
            memo.id === resize.id
              ? {
                  ...memo,
                  width: Math.max(180, resize.startWidth + dx),
                  height: Math.max(100, resize.startHeight + dy),
                }
              : memo,
          ),
        );
      }
    };

    const handlePointerUp = () => {
      dragStateRef.current = null;
      resizeStateRef.current = null;
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [viewport.zoom]);

  const handleMemoResizeStart = (event: React.PointerEvent, id: string) => {
    event.stopPropagation();

    const memo = memoNodes.find((item) => item.id === id);
    if (!memo) return;

    resizeStateRef.current = {
      id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startWidth: memo.width,
      startHeight: memo.height,
    };
  };
  // ===========================================================

  // ===========================================================
  // 마우스 우 클릭 메뉴
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    open: false,
    x: 0,
    y: 0,
    target: null,
  });

  const getSelectedNodeIds = useCallback(() => {
    return nodes
      .filter((node: any) => node.selected)
      .map((node: any) => node.id);
  }, [nodes]);

  const isSelectionLayerTarget = useCallback((target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false;

    const pane = target.closest(".react-flow__pane");
    const isSelectionPane = pane?.classList.contains("selection") ?? false;

    return Boolean(
      isSelectionPane ||
        target.closest(".react-flow__nodesselection") ||
        target.closest(".react-flow__nodesselection-rect") ||
        target.closest(".react-flow__selection"),
    );
  }, []);

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
    const bounds = reactFlowWrapper.current?.getBoundingClientRect();
    const flowPosition = bounds
      ? project({
          x: event.clientX - bounds.left,
          y: event.clientY - bounds.top,
        })
      : null;

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
    const bounds = reactFlowWrapper.current?.getBoundingClientRect();
    const flowPosition = bounds
      ? project({
          x: event.clientX - bounds.left,
          y: event.clientY - bounds.top,
        })
      : null;

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

  const handleEdgeContextMenu = (event: React.MouseEvent, edge: Edge<any>) => {
    event.preventDefault();
    event.stopPropagation();

    const nextEdges: Edge<any>[] = edges.map((item: any) => ({
      ...item,
      selected: item.id === edge.id,
    }));

    const { x, y } = getSafeMenuPosition(event.clientX, event.clientY, "edge");
    const bounds = reactFlowWrapper.current?.getBoundingClientRect();
    const flowPosition = bounds
      ? project({
          x: event.clientX - bounds.left,
          y: event.clientY - bounds.top,
        })
      : null;

    setSelectedNodeId(null);
    setEdges(nextEdges);

    setContextMenu({
      open: true,
      x,
      y,
      flowPosition,
      target: { type: "edge", id: edge.id },
    });
  };

  const handleSelectionContextMenuCapture = useCallback(
    (event: React.MouseEvent) => {
      const selectedIds = getSelectedNodeIds();
      const hitSelectionLayer = isSelectionLayerTarget(event.target);

      if (!hitSelectionLayer) return;
      if (selectedIds.length === 0) return;

      event.preventDefault();
      event.stopPropagation();

      const { x, y } = getSafeMenuPosition(
        event.clientX,
        event.clientY,
        "node",
      );
      const bounds = reactFlowWrapper.current?.getBoundingClientRect();
      const flowPosition = bounds
        ? project({
            x: event.clientX - bounds.left,
            y: event.clientY - bounds.top,
          })
        : null;

      setContextMenu({
        open: true,
        x,
        y,
        flowPosition,
        target: {
          type: "selection",
          ids: selectedIds,
        },
      });
    },
    [getSelectedNodeIds, isSelectionLayerTarget, project],
  );
  // ===========================================================

  // ===========================================================
  // 클립보드
  const pushHistory = useCallback(() => {
    useBuilderHistoryStore
      .getState()
      .push(makeSnapshot(useBuilderStore.getState()));
  }, []);

  // 선택 대상 계산 helper
  const getTargetNodeIdsForContextMenu = useCallback(
    (targetNodeId?: string) => {
      const selectedIds = nodes
        .filter((node: any) => node.selected)
        .map((node: any) => node.id);

      if (!targetNodeId) return selectedIds;

      if (selectedIds.includes(targetNodeId)) {
        return selectedIds;
      }

      return [targetNodeId];
    },
    [nodes],
  );
  // ===========================================================

  // nodes가 undefined이거나 position 없는 항목을 보정
  const safeNodes = useMemo(() => {
    const list = Array.isArray(nodes) ? nodes : [];
    return list.filter(Boolean).map((n: any) => {
      // 기본 position 보정
      const px = n?.position?.x ?? n?.positionAbsolute?.x ?? 0;
      const py = n?.position?.y ?? n?.positionAbsolute?.y ?? 0;
      return { ...n, position: { x: px, y: py } };
    });
  }, [nodes]);

  // 그룹(시나리오) 접힘 처리도 safeNodes 기준으로
  const visibleNodes = useMemo(() => {
    const collapsedGroupIds = new Set(
      safeNodes
        .filter(
          (n: any) =>
            (n.type === "scenario" || n.type === "selectionGroup") &&
            n?.data?.isCollapsed,
        )
        .map((n: any) => n.id),
    );
    return safeNodes.filter(
      (n: any) => !n.parentNode || !collapsedGroupIds.has(n.parentNode),
    );
  }, [safeNodes]);

  const handlePaneClick = () => {
    setSelectedNodeId(null);

    // 마우스 우 클릭 이벤트
    closeContextMenu();
  };

  const handleMainResize = (mouseDownEvent: any) => {
    mouseDownEvent.preventDefault();
    const startSize = rightPanelWidth;
    const startPosition = mouseDownEvent.clientX;

    const onMouseMove = (mouseMoveEvent: any) => {
      const newSize = startSize - (mouseMoveEvent.clientX - startPosition);
      if (newSize > 350 && newSize < 1000) {
        setRightPanelWidth(newSize);
      }
    };

    const onMouseUp = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const handleKeyDown = (event: any) => {
    if (event.key === "Backspace" || event.key === "Delete") {
      const isNodeSelected = nodes.some((node: any) => node.selected);
      if (!isNodeSelected) {
        deleteSelectedEdges();
      }
    }
  };

  const onDragOver = useCallback((event: any) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: any) => {
      event.preventDefault();

      const reactFlowBounds = reactFlowWrapper.current?.getBoundingClientRect();
      if (!reactFlowBounds) return;

      const type = event.dataTransfer.getData("application/reactflow");

      if (typeof type === "undefined" || !type) {
        return;
      }

      const position = project({
        x: event.clientX - reactFlowBounds.left,
        y: event.clientY - reactFlowBounds.top,
      });

      addNode(type, position);
    },
    [project, addNode],
  );

  // ========================================================================================================
  // 키보드 단축키 (Undo/Redo)
  useEffect(() => {
    const handleHistoryKey = (event: KeyboardEvent) => {
      const isMetaOrCtrl = event.metaKey || event.ctrlKey;
      if (!isMetaOrCtrl) return;

      const key = event.key.toLowerCase();

      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        undo();
        return;
      }

      if ((key === "z" && event.shiftKey) || key === "y") {
        event.preventDefault();
        redo();
      }
    };

    window.addEventListener("keydown", handleHistoryKey);
    return () => window.removeEventListener("keydown", handleHistoryKey);
  }, [undo, redo]);
  // ========================================================================================================

  // ========================================================================================================
  // 노드 검색 기능
  const getNodeSearchText = useCallback((node: any) => {
    const data = node?.data ?? {};

    switch (node.type) {
      case "message":
        return [data.content];
      case "form":
        return [data.title];
      case "slotfilling":
        return [data.content, data.slot];
      case "api":
        return [
          data.url,
          ...(Array.isArray(data.apis)
            ? data.apis.map((api: any) => api?.name)
            : []),
        ];
      case "branch":
        return Array.isArray(data.replies)
          ? data.replies.map((reply: any) => reply?.display)
          : [];
      case "link":
        return [data.display, data.content];
      case "llm":
        return [data.prompt];
      case "toast":
        return [data.message];
      case "iframe":
        return [data.url];
      case "scenario":
        return [data.label];
      case "selectionGroup":
        return [data.label, data.title];
      case "setSlot":
        return Array.isArray(data.assignments)
          ? data.assignments.flatMap((item: any) => [item?.key, item?.value])
          : [];
      case "delay":
        return [String(data.duration ?? "")];
      default:
        return [];
    }
  }, []);

  const filteredSearchResults = useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase();
    if (!keyword) return [];

    return nodes.filter((node: any) => {
      const typeMatched = searchType === "all" || node.type === searchType;
      if (!typeMatched) return false;

      const text = getNodeSearchText(node)
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return text.includes(keyword);
    });
  }, [nodes, searchType, searchKeyword, getNodeSearchText]);
  // ========================================================================================================

  // ========================================================================================================
  // 노드 검색 패널 높이에 따라 캔버스 패널 높이 조정
  const updateCanvasPanelHeight = useCallback(() => {
    if (!searchPanelRef.current) return;
    setCanvasPanelHeight(searchPanelRef.current.offsetHeight);
  }, []);
  useLayoutEffect(() => {
    updateCanvasPanelHeight();
  }, [
    updateCanvasPanelHeight,
    isCanvasPanelCollapsed,
    filteredSearchResults.length,
  ]);

  useEffect(() => {
    window.addEventListener("resize", updateCanvasPanelHeight);
    return () => window.removeEventListener("resize", updateCanvasPanelHeight);
  }, [updateCanvasPanelHeight]);
  // ========================================================================================================

  // 시나리오 버전 관리 모달 상태
  const [isDeployHistoryModalOpen, setIsDeployHistoryModalOpen] =
    useState(false);

  const handleSelectDeployHistory = (history: any) => {
    setSelectedVersionId(history.ver_id);
    setIsDeployHistoryModalOpen(false);
    // 버전 상세 조회 후 노드/엣지 업데이트
    // console.log("선택한 버전 ID: ", versionId);
    const payload = {
      scenario_id: scenario.id,
      version_id: history.ver_id,
    };
    getScenarioVersion(backend, payload).then((res: any) => {
      setNodes(res.nodes || []);
      setEdges(res.edges || []);
      setStartNodeId(res.startNodeId || null);
    });
  };

  function goList() {
    router.back();
  }

  // version 관리
  const [selectedVersion, setSelectedVersion] = useState<Scenario | null>(
    scenario ?? null,
  );

  const getVersionNumber = (version?: string) =>
    Number(String(version ?? "").replace(/[^0-9]/g, "")) || 0;

  const selectedScenarioVersions = (scenarios ?? [])
    .filter((item: any) => item.groupId && item.groupId === scenario?.groupId)
    .sort(
      (a: any, b: any) =>
        getVersionNumber(a.versions) - getVersionNumber(b.versions),
    );

  // 상세보기 version 이동
  const handleSelectedVersionDeploy = async () => {
    if (!scenario?.id) return;
    // console.log(scenario);
    const confirmed = await showConfirm(
      "Do you want to deploy the selected version?",
    );
    if (!confirmed) return;
    const payload = {
      snro_id: scenario.id,
      ver_id: selectedVersionId ?? scenario.ltst_ver_id,
      memo: "",
    };
    const currentUser = await loadingUserData();
    await scenarioVersionDeploy(backend, {
      ...payload,
      depn_usr_id: currentUser?.id ?? userInfoJson?.id ?? "",
    });
    setSelectedVersionId(null);
    setSelectedVersion(null);
    router.push(`/react-flow/scenario-list`);
  };

  const handleMoveScenario = async (data?: Scenario) => {
    const confirmed = await showConfirm(
      "Do you want to restore the selected version and open the scenario editor?",
    );
    if (!confirmed) return;

    if (data?.id) {
      // console.log('============================>', selectedVersionId, scenario, data,);
      setSelectedVersion(null);
      // setScenario(null);

      const versionId = selectedVersionId ?? data.ltst_ver_id;
      const payload = {
        scenario_id: data.id,
        version_id: versionId,
      };
      const restoredScenario = await restoreScenarioVersion(backend, payload);
      setScenario({
        ...data,
        ...restoredScenario,
        id: data.id,
      });
      setNodes(restoredScenario.nodes ?? []);
      setEdges(restoredScenario.edges ?? []);
      setStartNodeId(restoredScenario.startNodeId ?? null);
      setSelectedVersionId(null);
      router.push(
        `/react-flow/scenario-flow?scenarioId=${encodeURIComponent(data?.id ?? scenario?.id ?? "")}`,
      );
    }
  };

  return (
    <Box
      sx={{
        flex: 1,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        gap: 1.5,
        ...{ minHeight: 0 },
      }}
    >
      {/* Deploy History */}
      <Box
        sx={{
          display: "flex",
          width: "100%",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 0.5,
        }}
      >
        {/* 1. 좌측 뒤로가기 버튼 */}
        <button
          onClick={goList}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            backgroundColor: "transparent",
            color: "#666", // 너무 튀지 않는 회색톤 추천
            fontWeight: "bold",
            fontSize: "18px",
            cursor: "pointer",
            border: "none",
            padding: "12px 0", // 좌우 패딩을 줄여 끝에 붙게 함
          }}
        >
          <ArrowLeft size={20} />
          {t("Back")}
        </button>
        <Button
          variant="outlined"
          size="medium"
          startIcon={<History size={18} />}
          title={t("View the deployment history for this scenario")}
          onClick={() => {
            setIsDeployHistoryModalOpen(true);
          }}
          sx={{
            minHeight: 40,
            px: 2,
            borderRadius: 2,
            borderColor: "var(--builder-border)",
            color: COLORS.grey[700],
            bgcolor: "background.paper",
            fontWeight: 600,
            textTransform: "none",
            boxShadow: "0 1px 2px rgba(15, 23, 42, 0.06)",
            "&:hover": {
              borderColor: "primary.main",
              bgcolor: COLORS.primary.states.hover,
            },
          }}
        >
          {t("Deployment History")}
        </Button>
      </Box>

      <Box
        sx={{
          border: 1,
          flexGrow: 1,
          height: 0,
          minHeight: 0,
          borderRadius: 2,
          borderColor: "var(--builder-border)",
          display: "flex",
          overflow: "hidden",
        }}
      >
        <ScenarioGroupModal
          isOpen={isGroupModalOpen}
          onClose={() => setIsGroupModalOpen(false)}
          scenarios={scenarios.filter((s: any) => s.id !== scenario.id)}
          onSelect={(selected: any) => {
            addScenarioAsGroup(selected);
            setIsGroupModalOpen(false);
          }}
        />

        {/* 좌측 메뉴바 영역 */}
        <VersionTreeUI
          props={nodeTreeUIOptions}
          versions={selectedScenarioVersions}
        />

        {/* 우측 react flow 영역 */}
        <div
          className={styles.mainContent}
          ref={reactFlowWrapper}
          onContextMenuCapture={handleSelectionContextMenuCapture}
        >
          {/* Current Values */}
          {isSlotDisplayVisible && (
            <div
              className={styles.slotDisplayAnchor}
              style={{ top: `${canvasPanelHeight + 24}px` }}
            >
              <SlotDisplay />
            </div>
          )}

          {/* Memo Pad */}
          {isMemoVisible && (
            <div
              className={styles.memoPadAnchor}
              style={{ top: `${canvasPanelHeight + 24}px` }}
            >
              <MemoPad memos={memos} setMemos={setMemos} />
            </div>
          )}

          <div
            className={styles.topRightControls}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              width: "100%",
            }}
          >
            {/* 1. 좌측으로 보낼 버전 정보 */}
            <div
              style={{ fontSize: "20px", color: "#333", paddingLeft: "30px" }}
            >
              <b>
                {t("Version")}{" "}
                {selectedVersionId
                  ? `${selectedVersionId}`
                  : `${scenario.ltst_ver_id}`}
              </b>
            </div>

            {/* 2. 우측 버튼들을 감싸는 컨테이너 */}
            <Stack sx={{ alignItems: "center" }} direction="row" spacing={1}>
              <Button
                variant="outlined"
                size="medium"
                startIcon={<RotateCcw size={18} />}
                title={t(
                  "Restore the selected version as the current working scenario",
                )}
                onClick={() => {
                  handleMoveScenario(scenario);
                }}
                sx={{
                  minHeight: 40,
                  px: 2,
                  borderRadius: 2,
                  fontWeight: 600,
                  textTransform: "none",
                }}
              >
                {t("Restore Version")}
              </Button>
              <Button
                variant="contained"
                size="medium"
                startIcon={<Rocket size={18} />}
                title={t("Deploy the selected scenario version")}
                onClick={handleSelectedVersionDeploy}
                sx={{
                  minHeight: 40,
                  px: 2.25,
                  borderRadius: 2,
                  fontWeight: 700,
                  textTransform: "none",
                  boxShadow: "0 4px 10px rgba(37, 99, 235, 0.2)",
                }}
              >
                {t("Deploy Version")}
              </Button>
            </Stack>
          </div>
          <ReactFlow
            className={isPanMode ? styles.panCanvas : styles.selectCanvas}
            key={scenario?.id}
            nodes={visibleNodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onKeyDown={handleKeyDown}
            onDragOver={onDragOver}
            onDrop={onDrop}
            fitView
            style={{ backgroundColor: "var(--builder-surface)" }}
            fitViewOptions={{ padding: 0.2, maxZoom: 1.2 }}
            // 메모 노드 드래그 시 뷰포트 업데이트
            onMove={(_, vp) => setViewport(vp)}
            // UX 개선을 위한 줌 및 패닝 설정
            zoomOnScroll // 마우스 휠 줌 사용
            zoomOnPinch // 트랙패드/터치 핀치 줌 사용
            zoomOnDoubleClick={false} // 더블클릭 실수 확대 방지
            minZoom={0.02} // 캔버스를 아주 멀리 축소 가능
            maxZoom={10} // 노드 편집할 때 충분히 크게 확대 가능
            panOnDrag={isPanMode} // 이동/선택 모드 전환 핵심
            selectionOnDrag={isSelectMode}
            selectionMode={SelectionMode.Partial}
            multiSelectionKeyCode="Shift" // 필요시 shift 없이 바로 다중선택 가능
            nodesDraggable={!isSimulatorVisible} // 시뮬레이터가 보이는 동안에는 노드 드래그 비활성화
            deleteKeyCode="Delete" // 'Delete' 키로 엣지 삭제
            defaultEdgeOptions={{
              type: "orthogonal", // custom options: draggable, draggableStep, orthogonal
              animated: false,
              markerEnd: { type: MarkerType.ArrowClosed, color: "#cbd5e1" },
              style: {
                stroke: "#b8c2cc",
                strokeWidth: 1.4,
                strokeDasharray: "0",
              },
            }}
            connectionLineStyle={{
              stroke: "",
              strokeWidth: 1.4,
              strokeDasharray: "0",
              animation: "none",
            }}
            // 마우스 우클릭 메뉴 custom 수정
            onPaneContextMenu={handlePaneContextMenu}
            onNodeContextMenu={handleNodeContextMenu}
            onEdgeContextMenu={handleEdgeContextMenu}
            onPaneClick={handlePaneClick}
          >
            <Controls />
            <MiniMap
              nodeColor={(n: unknown) =>
                (n as { type: string }).type in nodeColors
                  ? nodeColors[(n as { type: string }).type]
                  : "#ddd"
              }
              nodeStrokeWidth={3}
              zoomable
              pannable
            />
          </ReactFlow>

          {/* 캔버스 마우스 우클릭 메뉴 */}
          {contextMenu.open && contextMenu.target?.type === "pane" && (
            <div
              className={styles.layerMenu}
              style={{ left: contextMenu.x, top: contextMenu.y }}
            >
              <button
                type="button"
                className={styles.layerMenuItem}
                onClick={() => setIsMemoVisible((prev) => !prev)}
              >
                <NotebookPen size={16} className={styles.layerMenuIcon} />
                {t("memo panel")}
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
                onClick={() => setIsMemoVisible((prev) => !prev)}
              >
                <NotebookPen size={16} className={styles.layerMenuIcon} />
                {t("memo panel")}
              </button>
            </div>
          )}

          {/* 엣지 우클릭 */}
          {contextMenu.open && contextMenu.target?.type === "edge" && (
            <div
              className={styles.layerMenu}
              style={{ left: contextMenu.x, top: contextMenu.y }}
            >
              <button
                type="button"
                className={styles.layerMenuItem}
                onClick={() => setIsMemoVisible((prev) => !prev)}
              >
                <NotebookPen size={16} className={styles.layerMenuIcon} />
                {t("memo panel")}
              </button>
            </div>
          )}

          {/* select 영역 */}
          {contextMenu.open && contextMenu.target?.type === "selection" && (
            <div
              className={styles.layerMenu}
              style={{ left: contextMenu.x, top: contextMenu.y }}
            >
              <button
                type="button"
                className={styles.layerMenuItem}
                onClick={() => setIsMemoVisible((prev) => !prev)}
              >
                <NotebookPen size={16} className={styles.layerMenuIcon} />
                {t("memo panel")}
              </button>
            </div>
          )}

          {/* Canvas Memo Layer */}
          <CanvasMemoLayer
            memoNodes={memoNodes}
            selectedMemoId={selectedMemoId}
            viewport={viewport}
            onSelect={setSelectedMemoId}
            onUpdate={updateMemoNode}
            onRemove={removeMemoNode}
            onToggleCollapse={toggleMemoCollapsed}
            onDragStart={handleMemoPointerDown}
            onResizeStart={handleMemoResizeStart}
          />
        </div>

        <div
          className={`${styles.controllerPanel} ${selectedNodeId ? styles.visible : ""}`}
        >
          <NodeController />
        </div>

        <div
          className={`${styles.resizerV} ${isSimulatorVisible && !isSimulatorExpanded ? styles.visible : ""}`}
          onMouseDown={handleMainResize}
        />

        <div
          className={`${styles.rightContainer} ${isSimulatorVisible ? styles.visible : ""}`}
          style={{
            width: isSimulatorExpanded
              ? "max(600px, 50%)"
              : isSimulatorVisible
                ? `${rightPanelWidth}px`
                : "0",
          }}
        >
          <div className={styles.panel}>
            <ChatbotSimulator
              nodes={nodes}
              edges={edges}
              isVisible={isSimulatorVisible}
              isExpanded={isSimulatorExpanded}
              setIsExpanded={setIsSimulatorExpanded}
            />
          </div>
        </div>
      </Box>

      {/* 모달 팝업 ==================================================================== */}
      <DeployHistoryListModal
        isOpen={isDeployHistoryModalOpen}
        onClose={() => setIsDeployHistoryModalOpen(false)}
        onSelectDeployHistory={handleSelectDeployHistory}
      />
      {/* Execution Log */}
      <Dialog
        open={isExecutionLogVisible}
        onClose={() => setIsExecutionLogVisible(false)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>
          <Stack
            sx={{ justifyContent: "space-between", alignItems: "center" }}
            direction="row"
          >
            <Typography variant="h6">{t("Execution Log")}</Typography>
            <IconButton onClick={() => setIsExecutionLogVisible(false)}>
              <CloseIcon />
            </IconButton>
          </Stack>
        </DialogTitle>
        <DialogContent dividers>
          {executionError && (
            <Box
              sx={{
                mb: 2,
                p: 2,
                bgcolor: "#fdeded",
                color: "#5f2120",
                borderRadius: 1,
              }}
            >
              <Typography variant="body2">{executionError}</Typography>
            </Box>
          )}
          <Box
            sx={{
              bgcolor: "#1e1e1e",
              color: "#4af626",
              p: 2,
              borderRadius: 1,
              fontFamily: "monospace",
              fontSize: "0.75rem",
              overflow: "auto",
              maxHeight: "60vh",
            }}
          >
            <pre
              style={{
                margin: 0,
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
              }}
            >
              {JSON.stringify(executionLogs, null, 2)}
            </pre>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setIsExecutionLogVisible(false)}
            variant="contained"
          >
            {t("Close")}
          </Button>
        </DialogActions>
      </Dialog>

      {/* isLogVisible 로 hidden / flex 전환 */}
      <Dialog
        open={isLogVisible}
        onClose={() => setIsLogVisible(false)}
        fullWidth
        maxWidth="lg" // JSON 데이터는 가로로 길 수 있으므로 lg 권장
      >
        <DialogTitle>
          <Stack
            sx={{ justifyContent: "space-between", alignItems: "center" }}
            direction="row"
          >
            <Typography variant="h6">{`${t("Log")} (${t("DB JSON Edit")})`}</Typography>
            <IconButton onClick={() => setIsLogVisible(false)}>
              <CloseIcon />
            </IconButton>
          </Stack>
        </DialogTitle>
        <DialogContent dividers>
          <LogPreview
            nodes={nodes}
            edges={edges}
            setNodes={setNodes}
            setEdges={setEdges}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsLogVisible(false)} variant="outlined">
            {t("Cancel")}
          </Button>
          {/* LogPreview 내부에 저장 로직이 있다면 버튼을 추가하거나 내부 버튼을 사용하세요 */}
        </DialogActions>
      </Dialog>

      {/* play 시 branch node type 모달 */}
      <Dialog
        open={!!pendingBranchSelection}
        onClose={cancelBranchReplySelection}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>
          <Typography sx={{ fontWeight: "bold" }} variant="h6">
            {t("Select Branch")}
          </Typography>
        </DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" sx={{ mb: 3, color: "text.secondary" }}>
            {pendingBranchSelection?.title ||
              t("Please select the flow that you want to proceed with.")}
          </Typography>
          <Stack spacing={1.5}>
            {pendingBranchSelection?.replies.map((reply: any) => (
              <Button
                key={reply.value}
                fullWidth
                variant="outlined"
                onClick={() => selectBranchReply(reply.value)}
                sx={{
                  justifyContent: "flex-start",
                  py: 1.5,
                  px: 2,
                  textAlign: "left",
                  borderColor: "divider",
                  "&:hover": {
                    bgcolor: "primary.light",
                    color: "primary.contrastText",
                  },
                }}
              >
                {reply.display}
              </Button>
            ))}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={cancelBranchReplySelection} color="inherit">
            {t("Cancel")}
          </Button>
        </DialogActions>
      </Dialog>
      {/* ======================================================================================== */}
    </Box>
  );
};

function ScenarioView(props: any) {
  // scenario, backend, scenarios
  const selectedScenario = useBuilderStore((s: any) => s.scenario);
  const scenarios = useBuilderStore((s: any) => s.scenarios);
  // console.log('selectedScenario==========================> ', selectedScenario);
  // console.log('scenarios==========================> ', scenarios);
  return (
    <ReactFlowProvider>
      <Flow {...props} scenario={selectedScenario} scenarios={scenarios} />
    </ReactFlowProvider>
  );
}

export default ScenarioView;
