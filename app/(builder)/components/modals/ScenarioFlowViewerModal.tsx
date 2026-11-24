"use client";

import { useEffect, useState } from "react";
import CloseIcon from "@mui/icons-material/Close";
import {
  Box,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Typography,
} from "@mui/material";
import { useTranslation } from "@/app/(builder)/hooks/useTranslation";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  type Edge,
  type Node,
} from "reactflow";
import "reactflow/dist/style.css";
import "@reactflow/node-resizer/dist/style.css";

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

type ScenarioViewModalProps = {
  isOpen: boolean;
  onClose: () => void;
  scenario?: {
    id: string;
    name?: string;
    scenario_nm?: string;
    ltst_ver_id?: string;
  };
};

export default function ScenarioViewModal({
  isOpen,
  onClose,
  scenario,
}: ScenarioViewModalProps) {
  const { t } = useTranslation();
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen || !scenario?.id || !scenario.ltst_ver_id) return;
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
        setNodes(Array.isArray(result?.nodes) ? result.nodes : []);
        setEdges(Array.isArray(result?.edges) ? result.edges : []);
      })
      .catch(() => {
        if (!active) return;
        setNodes([]);
        setEdges([]);
        setError(t("Failed to load scenario data."));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [isOpen, scenario?.id, scenario?.ltst_ver_id, t]);

  return (
    <Dialog open={isOpen} onClose={onClose} fullScreen>
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
        {scenario?.name || scenario?.scenario_nm || t("Scenario Viewer")}

        <IconButton onClick={onClose} aria-label={t("Close")}>
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
          <Box sx={{ flex: 1, minWidth: 0, minHeight: 0 }}>
            <ReactFlowProvider>
              <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                nodesDraggable={false}
                nodesConnectable={false}
                elementsSelectable={false}
                fitView
              >
                <Controls showInteractive={false} />
                <MiniMap zoomable pannable />
                <Background gap={16} />
              </ReactFlow>
            </ReactFlowProvider>
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
}
