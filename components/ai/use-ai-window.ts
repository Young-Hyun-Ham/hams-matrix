"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from "react";

type Position = { x: number; y: number };
type Edge = "left" | "right";
type Operation = {
  kind: "move" | Edge;
  target: HTMLElement;
  pointerId: number;
  startX: number;
  startY: number;
  rect: DOMRect;
};
const MARGIN = 12;
const MIN_WIDTH = 360;

function releaseOperation(operation: Operation | null) {
  if (operation?.target.hasPointerCapture(operation.pointerId))
    operation.target.releasePointerCapture(operation.pointerId);
}

export function useAiWindow(
  panel: RefObject<HTMLElement | null>,
  open: boolean,
) {
  const [floating, setFloating] = useState(true),
    [stackedExpanded, setStackExpanded] = useState(false),
    [split, setSplit] = useState(true),
    [splitExpanded, setSplitExpanded] = useState(true),
    [customWidths, setCustomWidths] = useState<{
      stacked: number | null;
      split: number | null;
    }>({ stacked: null, split: null }),
    [viewport, setViewport] = useState<{
      width: number;
      height: number;
    } | null>(null),
    [position, setPosition] = useState<Position>({ x: 24, y: 88 }),
    [interaction, setInteraction] = useState<Operation["kind"] | null>(null);
  const operation = useRef<Operation | null>(null);
  const positioned = useRef(false);
  const expanded = split ? splitExpanded : stackedExpanded;
  const widthGrowth = expanded || split ? 100 : 0;
  const popupBaseWidth = expanded ? 760 : 460;
  const customWidth = customWidths[split ? "split" : "stacked"];
  const popupWidth = customWidth ?? popupBaseWidth + widthGrowth;
  const displayedWidth = Math.min(
    popupWidth,
    Math.max(0, (viewport?.width ?? popupWidth + 24) - 24),
  );
  const minimumWidth = Math.min(
    MIN_WIDTH,
    Math.max(0, (viewport?.width ?? MIN_WIDTH + 24) - 24),
  );

  const finishOperation = useCallback(() => {
    const current = operation.current;
    if (!current) return;
    operation.current = null;
    setInteraction(null);
    releaseOperation(current);
  }, []);

  useEffect(() => {
    const onResize = () => {
      finishOperation();
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    };
    const frame = requestAnimationFrame(onResize);
    window.addEventListener("resize", onResize);
    window.addEventListener("blur", finishOperation);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("blur", finishOperation);
      const current = operation.current;
      operation.current = null;
      releaseOperation(current);
    };
  }, [finishOperation]);

  useEffect(() => {
    if (floating && open) return;
    const frame = requestAnimationFrame(finishOperation);
    return () => cancelAnimationFrame(frame);
  }, [floating, open, finishOperation]);

  useEffect(() => {
    if (!floating || !open) return;
    const frame = requestAnimationFrame(() => {
      const rect = panel.current?.getBoundingClientRect();
      if (!rect) return;
      const initialX = !positioned.current
        ? (document.querySelector(".workspace-body")?.getBoundingClientRect()
            .left ?? MARGIN)
        : null;
      positioned.current = true;
      setPosition((current) => {
        const next = {
          x: Math.min(
            Math.max(MARGIN, initialX ?? current.x),
            Math.max(MARGIN, window.innerWidth - rect.width - MARGIN),
          ),
          y: Math.min(
            Math.max(MARGIN, current.y),
            Math.max(MARGIN, window.innerHeight - rect.height - MARGIN),
          ),
        };
        return current.x === next.x && current.y === next.y ? current : next;
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [floating, popupWidth, open, panel, viewport]);

  function toggleSplit() {
    finishOperation();
    if (!split) {
      setSplitExpanded(true);
      setCustomWidths((current) => ({ ...current, split: null }));
    }
    setSplit((current) => !current);
  }
  function toggleExpanded() {
    finishOperation();
    setCustomWidths((current) => ({
      ...current,
      [split ? "split" : "stacked"]: null,
    }));
    if (split) setSplitExpanded((current) => !current);
    else setStackExpanded((current) => !current);
  }
  function toggleFloating() {
    finishOperation();
    if (!floating) {
      const rect = panel.current?.getBoundingClientRect();
      setPosition({
        x: Math.max(
          MARGIN,
          Math.min(
            (rect?.left ?? 0) + 24,
            window.innerWidth -
              Math.min(popupWidth, window.innerWidth - 24) -
              MARGIN,
          ),
        ),
        y: 88,
      });
    }
    setFloating((current) => !current);
  }
  function bounded(x: number, y: number): Position {
    const rect = panel.current?.getBoundingClientRect();
    return {
      x: Math.min(
        Math.max(MARGIN, x),
        Math.max(MARGIN, window.innerWidth - (rect?.width ?? 460) - MARGIN),
      ),
      y: Math.min(
        Math.max(MARGIN, y),
        Math.max(MARGIN, window.innerHeight - (rect?.height ?? 600) - MARGIN),
      ),
    };
  }
  function maxWidth(edge: Edge, rect: { left: number; right: number }) {
    return Math.max(
      0,
      edge === "right"
        ? window.innerWidth - MARGIN - rect.left
        : rect.right - MARGIN,
    );
  }
  function resizeWindow(edge: Edge, rect: DOMRect, requestedWidth: number) {
    const maximum = maxWidth(edge, rect);
    const width = Math.min(
      maximum,
      Math.max(Math.min(MIN_WIDTH, maximum), requestedWidth),
    );
    setCustomWidths((current) => ({
      ...current,
      [split ? "split" : "stacked"]: width,
    }));
    setPosition({
      x: edge === "left" ? rect.right - width : rect.left,
      y: rect.top,
    });
  }
  function startOperation(
    event: PointerEvent<HTMLElement>,
    kind: Operation["kind"],
  ) {
    if (!floating || !open || event.button !== 0 || operation.current) return;
    const rect = panel.current?.getBoundingClientRect();
    if (!rect || (kind !== "move" && maxWidth(kind, rect) <= minimumWidth))
      return;
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    operation.current = {
      kind,
      target: event.currentTarget,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      rect,
    };
    setInteraction(kind);
  }
  function onPointerMove(event: PointerEvent<HTMLElement>) {
    const current = operation.current;
    if (!current || event.pointerId !== current.pointerId) return;
    const deltaX = event.clientX - current.startX;
    if (current.kind === "move") {
      setPosition(
        bounded(
          current.rect.left + deltaX,
          current.rect.top + event.clientY - current.startY,
        ),
      );
    } else {
      resizeWindow(
        current.kind,
        current.rect,
        current.rect.width + (current.kind === "left" ? -deltaX : deltaX),
      );
    }
  }
  function endOperation(event: PointerEvent<HTMLElement>) {
    if (event.pointerId === operation.current?.pointerId) finishOperation();
  }
  const pointerProps = {
    onPointerMove,
    onPointerUp: endOperation,
    onPointerCancel: endOperation,
    onLostPointerCapture: endOperation,
  };
  function resizeHandleProps(edge: Edge) {
    const maximum = Math.max(
      0,
      edge === "right"
        ? (viewport?.width ?? position.x + displayedWidth + MARGIN) -
            MARGIN -
            position.x
        : position.x + displayedWidth - MARGIN,
    );
    const disabled = maximum <= minimumWidth;
    return {
      ...pointerProps,
      role: "separator" as const,
      tabIndex: disabled ? -1 : 0,
      "aria-orientation": "vertical" as const,
      "aria-label":
        "AI 채팅 창 " + (edge === "left" ? "왼쪽" : "오른쪽") + " 너비 조절",
      "aria-controls": "matrix-ai-panel",
      "aria-valuemin": minimumWidth,
      "aria-valuemax": Math.max(minimumWidth, maximum),
      "aria-valuenow": Math.round(displayedWidth),
      "aria-valuetext": Math.round(displayedWidth) + "px",
      "aria-disabled": disabled,
      title:
        "드래그 또는 좌우 방향키로 너비 조절 · Shift 40px · Home 최소 · End 최대",
      onPointerDown: (event: PointerEvent<HTMLDivElement>) =>
        startOperation(event, edge),
      onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
        if (
          !floating ||
          !open ||
          disabled ||
          operation.current ||
          !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
        )
          return;
        event.preventDefault();
        const rect = panel.current?.getBoundingClientRect();
        if (!rect) return;
        const step = event.shiftKey ? 40 : 10;
        const delta =
          (event.key === "ArrowRight" ? 1 : -1) *
          (edge === "right" ? 1 : -1) *
          step;
        resizeWindow(
          edge,
          rect,
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? maxWidth(edge, rect)
              : rect.width + delta,
        );
      },
    };
  }
  return {
    floating,
    expanded,
    split,
    widthGrowth,
    popupBaseWidth,
    customWidth,
    displayedWidth,
    position,
    dragging: interaction === "move",
    resizing: interaction === "left" || interaction === "right",
    toggleFloating,
    toggleSplit,
    toggleExpanded,
    resizeHandleProps,
    dragHandleProps: {
      ...pointerProps,
      onPointerDown: (event: PointerEvent<HTMLButtonElement>) =>
        startOperation(event, "move"),
      onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => {
        if (
          !floating ||
          !open ||
          operation.current ||
          !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
            event.key,
          )
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
      },
    },
  };
}
