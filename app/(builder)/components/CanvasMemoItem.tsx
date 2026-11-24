"use client";

export type MemoCanvasItem = {
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

type CanvasMemoItemProps = {
  memo: MemoCanvasItem;
  selected: boolean;
  onSelect: (id: string) => void;
  onUpdate: (id: string, patch: Partial<MemoCanvasItem>) => void;
  onRemove: (id: string) => void;
  onToggleCollapse: (id: string) => void;
  onDragStart: (event: React.PointerEvent, id: string) => void;
  onResizeStart: (event: React.PointerEvent, id: string) => void;
};

function hexToRgba(hex: string, alpha: number) {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function CanvasMemoItem({
  memo,
  selected,
  onSelect,
  onUpdate,
  onRemove,
  onToggleCollapse,
  onDragStart,
  onResizeStart,
}: CanvasMemoItemProps) {
  const buttonStyle: React.CSSProperties = {
    cursor: "pointer",
    background: "none",
    border: "none",
    color: "black",
    padding: "4px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  return (
    <div
      onPointerDown={(event) => {
        event.stopPropagation();
        onSelect(memo.id);
      }}
      style={{
        position: "absolute",
        left: memo.x,
        top: memo.y,
        width: memo.width,
        height: memo.isCollapsed ? 42 : memo.height,
        backgroundColor: hexToRgba(
          memo.backgroundColor,
          memo.backgroundOpacity,
        ),
        color: memo.textColor,
        border: selected ? "2px solid #2563eb" : "1px solid #cbd5e1",
        borderRadius: 12,
        boxShadow: "0 8px 24px rgba(15, 23, 42, 0.18)",
        overflow: "hidden",
        pointerEvents: "auto",
        zIndex: memo.zIndex,
      }}
    >
      <div
        onPointerDown={(event) => {
          event.stopPropagation();
          onSelect(memo.id);
          onDragStart(event, memo.id);
        }}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: 42,
          padding: "0 10px",
          background: "rgba(255,255,255,0.35)",
          cursor: "grab",
          borderBottom: memo.isCollapsed ? "0" : "1px solid rgba(0,0,0,0.08)",
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 700 }}>Memo</span>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input
            type="range"
            min="0.1"
            max="1"
            step="0.05"
            value={memo.backgroundOpacity}
            onPointerDown={(event) => event.stopPropagation()}
            onChange={(event) =>
              onUpdate(memo.id, {
                backgroundOpacity: Number(event.target.value),
              })
            }
          />

          <input
            type="color"
            value={memo.backgroundColor}
            onPointerDown={(event) => event.stopPropagation()}
            onChange={(event) =>
              onUpdate(memo.id, { backgroundColor: event.target.value })
            }
          />

          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => onToggleCollapse(memo.id)}
            style={buttonStyle}
          >
            {memo.isCollapsed ? "+" : "-"}
          </button>

          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => onRemove(memo.id)}
            style={buttonStyle}
          >
            x
          </button>
        </div>
      </div>

      {!memo.isCollapsed && (
        <>
          <textarea
            value={memo.text}
            onPointerDown={(event) => event.stopPropagation()}
            onChange={(event) =>
              onUpdate(memo.id, { text: event.target.value })
            }
            style={{
              width: "100%",
              height: memo.height - 42,
              border: 0,
              outline: "none",
              resize: "none",
              background: "transparent",
              color: memo.textColor,
              padding: 12,
              paddingBottom: 24,
              fontSize: 13,
              lineHeight: 1.5,
              boxSizing: "border-box",
            }}
          />

          <div
            onPointerDown={(event) => onResizeStart(event, memo.id)}
            style={{
              position: "absolute",
              right: 6,
              bottom: 6,
              width: 14,
              height: 14,
              cursor: "nwse-resize",
              borderRight: "2px solid rgba(0,0,0,0.35)",
              borderBottom: "2px solid rgba(0,0,0,0.35)",
              pointerEvents: "auto",
            }}
          />
        </>
      )}
    </div>
  );
}
