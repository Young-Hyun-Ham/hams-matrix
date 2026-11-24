import { Box, Typography } from "@mui/material";
import type { Edge, Node } from "reactflow";

/** A static overview of the saved graph, independent of the editor viewport. */
export function ScenarioThumbnail({
  nodes,
  edges,
  emptyLabel,
}: {
  nodes: Node[];
  edges: Edge[];
  emptyLabel: string;
}) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const position = (
    node: Node,
    visited = new Set<string>(),
  ): { x: number; y: number } => {
    if (visited.has(node.id)) return { x: 0, y: 0 };
    visited.add(node.id);
    const parent = node.parentNode ? byId.get(node.parentNode) : undefined;
    const offset = parent ? position(parent, visited) : { x: 0, y: 0 };
    return { x: node.position.x + offset.x, y: node.position.y + offset.y };
  };
  const rectangles = nodes
    .filter((node) => !node.hidden)
    .map((node) => ({
      node,
      ...position(node),
      width: node.width || Number.parseFloat(String(node.style?.width)) || 240,
      height:
        node.height || Number.parseFloat(String(node.style?.height)) || 100,
    }));
  const shapes = new Map(rectangles.map((rect) => [rect.node.id, rect]));
  const left = Math.min(...rectangles.map((rect) => rect.x));
  const top = Math.min(...rectangles.map((rect) => rect.y));
  const width =
    Math.max(...rectangles.map((rect) => rect.x + rect.width)) - left;
  const height =
    Math.max(...rectangles.map((rect) => rect.y + rect.height)) - top;

  return (
    <Box
      sx={{
        height: 154,
        borderRadius: 1.5,
        bgcolor: "var(--builder-surface)",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {rectangles.length ? (
        <svg
          width="100%"
          height="100%"
          viewBox={`${left - 40} ${top - 40} ${width + 80} ${height + 80}`}
          role="img"
          aria-label="Scenario flow overview"
        >
          {rectangles.map(({ node, x, y, width, height }) => (
            <rect
              key={node.id}
              x={x}
              y={y}
              width={width}
              height={height}
              rx={8}
              fill={
                node.type === "selectionGroup" || node.type === "scenario"
                  ? "#e2e8f0"
                  : node.data?.nodeColor || "#94a3b8"
              }
              stroke="#64748b"
              strokeWidth={1}
            />
          ))}
          {edges
            .filter((edge) => !edge.hidden)
            .map((edge) => {
              const source = shapes.get(edge.source);
              const target = shapes.get(edge.target);
              if (!source || !target) return null;
              const x1 = source.x + source.width;
              const y1 = source.y + source.height / 2;
              const x2 = target.x;
              const y2 = target.y + target.height / 2;
              return (
                <path
                  key={edge.id}
                  d={`M ${x1} ${y1} H ${(x1 + x2) / 2} V ${y2} H ${x2}`}
                  fill="none"
                  stroke="#ed8b36"
                  strokeWidth={2}
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}
        </svg>
      ) : (
        <Typography sx={{ color: "text.secondary" }} variant="caption">
          {emptyLabel}
        </Typography>
      )}
    </Box>
  );
}
