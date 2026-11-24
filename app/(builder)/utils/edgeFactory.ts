import { MarkerType, type Edge } from "reactflow";
// Extracted from BAPS BuildTopDownFlow: shared graph data, no alternate canvas.
export function createWorkflowEdge({
  source,
  target,
  sourceHandle,
}: {
  source: string;
  target: string;
  sourceHandle?: string | null;
}): Edge {
  return {
    id: `edge-${crypto.randomUUID()}`,
    source,
    target,
    sourceHandle:
      !sourceHandle || sourceHandle === "default" ? null : sourceHandle,
    targetHandle: null,
    type: "default",
    animated: false,
    markerEnd: { type: MarkerType.ArrowClosed },
    style: { stroke: "var(--builder-edge)", strokeWidth: 1.4 },
  };
}
