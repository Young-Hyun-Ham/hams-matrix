"use client";

import { CanvasMemoItem } from "./CanvasMemoItem";

type MemoCanvasItem = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  backgroundColor: string;
  backgroundOpacity: number;
  textColor: string;
  isCollapsed: boolean;
  zIndex: number;
};

type ViewportState = {
  x: number;
  y: number;
  zoom: number;
};

type CanvasMemoLayerProps = {
  memoNodes: MemoCanvasItem[];
  selectedMemoId: string | null;
  viewport: ViewportState;
  onSelect: (id: string) => void;
  onUpdate: (id: string, patch: Partial<MemoCanvasItem>) => void;
  onRemove: (id: string) => void;
  onToggleCollapse: (id: string) => void;
  onDragStart: (event: React.PointerEvent, id: string) => void;
  onResizeStart: (event: React.PointerEvent, id: string) => void;
};

export default function CanvasMemoLayer({
  memoNodes,
  selectedMemoId,
  viewport,
  onSelect,
  onUpdate,
  onRemove,
  onToggleCollapse,
  onDragStart,
  onResizeStart,
}: CanvasMemoLayerProps) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
          transformOrigin: "0 0",
          pointerEvents: "none",
        }}
      >
        {memoNodes.map((memo) => (
          <CanvasMemoItem
            key={memo.id}
            memo={memo}
            selected={selectedMemoId === memo.id}
            onSelect={onSelect}
            onUpdate={onUpdate}
            onRemove={onRemove}
            onToggleCollapse={onToggleCollapse}
            onDragStart={onDragStart}
            onResizeStart={onResizeStart}
          />
        ))}
      </div>
    </div>
  );
}
