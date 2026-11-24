// app/(siderbar-header)/admin/builder/components/modals/LogPreview.tsx

import { useRef, useState } from "react";
import {
  Box,
  Button,
  Stack,
  Typography,
  IconButton,
  Tooltip,
  Divider,
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import UndoIcon from "@mui/icons-material/Undo";
import RedoIcon from "@mui/icons-material/Redo";
import PlayCircleOutlineIcon from "@mui/icons-material/PlayCircleOutlineOutlined";
import { useTranslation } from "@/app/(builder)/hooks/useTranslation";

type LogPreviewProps = {
  nodes: any[];
  edges: any[];
  setNodes: (nodes: any[]) => void;
  setEdges: (edges: any[]) => void;
};

const LogPreview = ({ nodes, edges, setNodes, setEdges }: LogPreviewProps) => {
  const { t } = useTranslation();
  const [nodesJsonText, setNodesJsonText] = useState(() =>
    JSON.stringify(nodes, null, 2),
  );
  const [edgesJsonText, setEdgesJsonText] = useState(() =>
    JSON.stringify(edges, null, 2),
  );

  // Undo / Redo용 히스토리
  const [history, setHistory] = useState<{ nodes: any[]; edges: any[] }[]>(
    () => [
      {
        nodes: JSON.parse(JSON.stringify(nodes)),
        edges: JSON.parse(JSON.stringify(edges)),
      },
    ],
  );
  const [historyIndex, setHistoryIndex] = useState(0);

  const handleReloadFromFlow = () => {
    setNodesJsonText(JSON.stringify(nodes, null, 2));
    setEdgesJsonText(JSON.stringify(edges, null, 2));
  };

  const handleUndo = () => {
    if (historyIndex <= 0) return;
    const newIdx = historyIndex - 1;
    const snapshot = history[newIdx];
    applySnapshot(snapshot, newIdx);
  };

  const handleRedo = () => {
    if (historyIndex < 0 || historyIndex >= history.length - 1) return;
    const newIdx = historyIndex + 1;
    const snapshot = history[newIdx];
    applySnapshot(snapshot, newIdx);
  };

  const applySnapshot = (snapshot: any, index: number) => {
    setNodes(snapshot.nodes);
    setEdges(snapshot.edges);
    setNodesJsonText(JSON.stringify(snapshot.nodes, null, 2));
    setEdgesJsonText(JSON.stringify(snapshot.edges, null, 2));
    setHistoryIndex(index);
  };

  const handleApplyJson = () => {
    try {
      const parsedNodes = JSON.parse(nodesJsonText);
      const parsedEdges = JSON.parse(edgesJsonText);

      if (!Array.isArray(parsedNodes) || !Array.isArray(parsedEdges)) {
        //alert('Nodes와 Edges는 모두 배열 형태여야 합니다.');
        alert(`${t("Nodes and Edges must both be in array form")}.`);
        return;
      }

      setHistory((prev) => {
        const sliced = prev.slice(0, historyIndex + 1);
        return [...sliced, { nodes: parsedNodes, edges: parsedEdges }];
      });
      setHistoryIndex((idx) => idx + 1);

      setNodes(parsedNodes);
      setEdges(parsedEdges);
      // alert('Flow UI가 성공적으로 갱신되었습니다.');
      alert(`${t("Flow UI updated successfully")}.`);
    } catch (err) {
      // alert('유효하지 않은 JSON 형식입니다.');
      alert(`${t("Invalid JSON format")}.`);
    }
  };

  const canUndo = historyIndex > 0;
  const canRedo = history.length > 1 && historyIndex < history.length - 1;

  // 공통 텍스트에디터 스타일
  const textAreaStyle = {
    width: "100%",
    padding: "12px",
    fontFamily: 'Consolas, Monaco, "Andale Mono", "Ubuntu Mono", monospace',
    fontSize: "12px",
    lineHeight: "1.5",
    backgroundColor: "var(--builder-surface)",
    border: "1px solid #e0e0e0",
    borderRadius: "8px",
    outline: "none",
    resize: "vertical" as const,
    minHeight: "150px",
    maxHeight: "300px",
    "&:focus": {
      borderColor: "#3b82f6",
      backgroundColor: "var(--builder-surface)",
    },
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {/* 상단 컨트롤바 */}
      <Stack
        direction="row"
        sx={{
          justifyContent: "space-between",
          alignItems: "center",
          ...{ bgcolor: "#f1f5f9", p: 1.5, borderRadius: 2 },
        }}
      >
        <Typography
          sx={{ color: "text.secondary", fontWeight: "bold" }}
          variant="subtitle2"
        >
          {t("DB JSON Editor")}
        </Typography>

        <Stack direction="row" spacing={1}>
          <Tooltip title={t("Import data back from graph")}>
            <Button
              size="small"
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={handleReloadFromFlow}
            >
              {t("Sync")}
            </Button>
          </Tooltip>

          <Divider orientation="vertical" flexItem />

          <IconButton size="small" onClick={handleUndo} disabled={!canUndo}>
            <UndoIcon fontSize="small" />
          </IconButton>

          <IconButton size="small" onClick={handleRedo} disabled={!canRedo}>
            <RedoIcon fontSize="small" />
          </IconButton>

          <Button
            size="small"
            variant="contained"
            color="primary"
            startIcon={<PlayCircleOutlineIcon />}
            onClick={handleApplyJson}
          >
            {t("Apply")}
          </Button>
        </Stack>
      </Stack>

      <Stack spacing={3}>
        {/* Nodes 영역 */}
        <Box>
          <Stack
            sx={{
              justifyContent: "space-between",
              mb: 1,
              alignItems: "center",
            }}
            direction="row"
          >
            <Typography
              sx={{ fontWeight: "bold", color: "primary" }}
              variant="caption"
            >
              {t("NODES DATA")}
            </Typography>
            <Typography sx={{ color: "text.disabled" }} variant="caption">
              {t("Array of Objects")} [&#123;...&#125;]
            </Typography>
          </Stack>
          <Box
            component="textarea"
            sx={textAreaStyle}
            value={nodesJsonText}
            onChange={(e: any) => setNodesJsonText(e.target.value)}
            spellCheck={false}
          />
        </Box>

        {/* Edges 영역 */}
        <Box>
          <Stack
            sx={{
              justifyContent: "space-between",
              mb: 1,
              alignItems: "center",
            }}
            direction="row"
          >
            <Typography
              sx={{ fontWeight: "bold", color: "primary" }}
              variant="caption"
            >
              {t("EDGES DATA")}
            </Typography>
            <Typography sx={{ color: "text.disabled" }} variant="caption">
              {t("Array of Objects")} [&#123;...&#125;]
            </Typography>
          </Stack>
          <Box
            component="textarea"
            sx={textAreaStyle}
            value={edgesJsonText}
            onChange={(e: any) => setEdgesJsonText(e.target.value)}
            spellCheck={false}
          />
        </Box>
      </Stack>

      <Typography
        variant="caption"
        sx={{ color: "error", ...{ fontStyle: "italic", textAlign: "center" } }}
      >
        {/* ※ JSON 구조를 수동으로 변경 시 그래프 렌더링에 오류가 발생할 수 있으니
        주의하세요. */}
        ※{" "}
        {t(
          "Manually changing the JSON structure can cause errors in graph rendering Be careful",
        )}
        .
      </Typography>
    </Box>
  );
};

export default LogPreview;
