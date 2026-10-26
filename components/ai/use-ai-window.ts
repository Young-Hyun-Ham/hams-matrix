"use client";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from "react";
type Position = { x: number; y: number };
type Drag = {
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
};
export function useAiWindow(
  panel: RefObject<HTMLElement | null>,
  open: boolean,
) {
  const [floating, setFloating] = useState(false),
    [expanded, setExpanded] = useState(false),
    [position, setPosition] = useState<Position>({ x: 24, y: 88 }),
    [dragging, setDragging] = useState(false);
  const drag = useRef<Drag | null>(null);
  function bounded(x: number, y: number): Position {
    const rect = panel.current?.getBoundingClientRect();
    return {
      x: Math.min(
        Math.max(12, x),
        Math.max(12, window.innerWidth - (rect?.width ?? 460) - 12),
      ),
      y: Math.min(
        Math.max(12, y),
        Math.max(12, window.innerHeight - (rect?.height ?? 600) - 12),
      ),
    };
  }
  useEffect(() => {
    if (!floating || !open) return;
    const clampPosition = () => {
      const rect = panel.current?.getBoundingClientRect();
      if (!rect) return;
      setPosition((current) => {
        const next = {
          x: Math.min(
            Math.max(12, current.x),
            Math.max(12, window.innerWidth - rect.width - 12),
          ),
          y: Math.min(
            Math.max(12, current.y),
            Math.max(12, window.innerHeight - rect.height - 12),
          ),
        };
        return current.x === next.x && current.y === next.y ? current : next;
      });
    };
    const frame = requestAnimationFrame(clampPosition);
    window.addEventListener("resize", clampPosition);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", clampPosition);
    };
  }, [floating, expanded, open, panel]);
  function toggleFloating() {
    if (!floating) {
      const rect = panel.current?.getBoundingClientRect();
      setPosition({
        x: Math.max(
          12,
          Math.min(
            (rect?.left ?? 0) + 24,
            window.innerWidth -
              Math.min(expanded ? 760 : 460, window.innerWidth - 24) -
              12,
          ),
        ),
        y: 88,
      });
    }
    setFloating((current) => !current);
  }
  function onPointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (!floating || event.button !== 0) return;
    const rect = panel.current?.getBoundingClientRect();
    if (!rect) return;
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: rect.left,
      y: rect.top,
    };
    setDragging(true);
  }
  function onPointerMove(event: PointerEvent<HTMLButtonElement>) {
    const current = drag.current;
    if (!current || event.pointerId !== current.pointerId) return;
    setPosition(
      bounded(
        current.x + event.clientX - current.startX,
        current.y + event.clientY - current.startY,
      ),
    );
  }
  function endDrag(event: PointerEvent<HTMLButtonElement>) {
    if (!drag.current || event.pointerId !== drag.current.pointerId) return;
    drag.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (
      !floating ||
      !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
    )
      return;
    event.preventDefault();
    const rect = panel.current?.getBoundingClientRect();
    if (!rect) return;
    const step = event.shiftKey ? 40 : 10;
    setPosition(
      bounded(
        rect.left +
          (event.key === "ArrowLeft"
            ? -step
            : event.key === "ArrowRight"
              ? step
              : 0),
        rect.top +
          (event.key === "ArrowUp"
            ? -step
            : event.key === "ArrowDown"
              ? step
              : 0),
      ),
    );
  }
  return {
    floating,
    expanded,
    position,
    dragging,
    toggleFloating,
    toggleExpanded: () => setExpanded((value) => !value),
    dragHandleProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
      onLostPointerCapture: endDrag,
      onKeyDown,
    },
  };
}
