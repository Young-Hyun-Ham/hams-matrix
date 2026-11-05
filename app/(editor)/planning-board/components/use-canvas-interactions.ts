import {
  useEffect,
  useRef,
  useState,
  type RefObject,
  type PointerEvent as ReactPointerEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import type { Layer, LayerPosition, LayerSize } from "./types";
import { layerIndex, movableSelection } from "../lib/editor-selection";
import { isDeleteShortcut } from "../lib/editor-delete";
import {
  intersection,
  intersects,
  moveTargets,
  resizeRect,
  type Rect,
  type ResizeDirection,
  type MoveTarget,
} from "../lib/canvas-geometry";

type Options = {
  layers: Layer[];
  positions: Record<string, LayerPosition>;
  selectedIds: string[];
  onDeleteMany: (ids: string[]) => boolean;
  readOnly: boolean;
  tool: "cursor" | "hand";
  board: RefObject<HTMLDivElement | null>;
  canvas: RefObject<HTMLDivElement | null>;
  suppressClick: RefObject<boolean>;
  onSelectMany: (ids: string[]) => void;
  onGeometry: (patch: {
    positions?: Record<string, LayerPosition>;
    sizes?: Record<string, LayerSize>;
  }) => void;
  onInteractionStart: () => void;
  onInteractionEnd: () => void;
};
const rectOf = (node: Element): Rect => {
  const r = node.getBoundingClientRect();
  return { x: r.left, y: r.top, width: r.width, height: r.height };
};

export function useCanvasInteractions(options: Options) {
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const cleanup = useRef<((cancel?: boolean) => void) | null>(null);
  const keyActive = useRef(false);
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });
  const nodeFor = (id: string) =>
    options.board.current?.querySelector<HTMLElement>(
      `[data-layer-id="${CSS.escape(id)}"]`,
    );
  const scale = () => {
    const b = options.board.current;
    return b ? b.getBoundingClientRect().width / b.offsetWidth || 1 : 1;
  };
  const targetsFor = (ids: string[]): MoveTarget[] =>
    movableSelection(options.layers, ids).flatMap((id) => {
      const node = nodeFor(id),
        entry = layerIndex(options.layers).get(id);
      const parent = node?.offsetParent as HTMLElement | null;
      if (!node || !parent || !entry) return [];
      const position = options.positions[id] ?? {
        x: node.offsetLeft,
        y: node.offsetTop,
      };
      return [
        {
          id,
          ...position,
          width: node.offsetWidth,
          height: node.offsetHeight,
          maxX:
            entry.layer.kind === "page"
              ? Infinity
              : Math.max(0, parent.clientWidth - node.offsetWidth),
          maxY:
            entry.layer.kind === "page"
              ? Infinity
              : Math.max(0, parent.clientHeight - node.offsetHeight),
        },
      ];
    });
  const focus = () => options.canvas.current?.focus({ preventScroll: true });
  const track = (
    event: ReactPointerEvent,
    update: (dx: number, dy: number) => void,
    end?: (cancel: boolean) => void,
    editing = true,
  ) => {
    cleanup.current?.(true);
    const initialIndex = layerIndex(options.layers);
    const editingIds = options.selectedIds.filter(
      (id) => !initialIndex.get(id)?.blocked,
    );
    const x = event.clientX,
      y = event.clientY,
      pointerId = event.pointerId,
      zoom = scale();
    let started = false;
    const move = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      const currentIndex = layerIndex(latest.current.layers);
      if (
        editing &&
        (latest.current.readOnly ||
          editingIds.some(
            (id) => !currentIndex.has(id) || currentIndex.get(id)?.blocked,
          ))
      ) {
        finish(true);
        return;
      }
      if (!started && Math.hypot(e.clientX - x, e.clientY - y) < 3) return;
      if (!started) {
        started = true;
        if (editing) latest.current.onInteractionStart();
      }
      options.suppressClick.current = true;
      update((e.clientX - x) / zoom, (e.clientY - y) / zoom);
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId === pointerId) finish(false);
    };
    const cancel = () => finish(true);
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      }
    };
    const finish = (cancelled = false) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("blur", cancel);
      window.removeEventListener("keydown", key);
      cleanup.current = null;
      if (started) end?.(cancelled);
      if (started && editing) latest.current.onInteractionEnd();
      setMarquee(null);
      setTimeout(() => {
        options.suppressClick.current = false;
      }, 0);
    };
    cleanup.current = finish;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("blur", cancel);
    window.addEventListener("keydown", key);
  };
  const beginMove = (event: ReactPointerEvent, id: string) => {
    if (
      event.button !== 0 ||
      options.readOnly ||
      options.tool !== "cursor" ||
      !options.selectedIds.includes(id)
    )
      return;
    const targets = targetsFor(options.selectedIds);
    if (!targets.length) return;
    event.preventDefault();
    event.stopPropagation();
    focus();
    const initial = Object.fromEntries(
      targets.map((t) => [t.id, { x: t.x, y: t.y }]),
    );
    track(
      event,
      (dx, dy) =>
        latest.current.onGeometry({ positions: moveTargets(targets, dx, dy) }),
      (cancelled) => {
        if (cancelled && !latest.current.readOnly)
          latest.current.onGeometry({ positions: initial });
      },
    );
  };
  const beginResize = (
    event: ReactPointerEvent,
    id: string,
    direction: ResizeDirection,
  ) => {
    if (event.button !== 0 || options.readOnly || options.tool !== "cursor")
      return;
    const target = targetsFor([id])[0],
      node = nodeFor(id);
    const parent = node?.offsetParent as HTMLElement | null;
    if (!target || !parent) return;
    event.preventDefault();
    event.stopPropagation();
    focus();
    const unbounded = layerIndex(options.layers).get(id)?.layer.kind === "page";
    track(
      event,
      (dx, dy) => {
        const next = resizeRect(
          target,
          direction,
          dx,
          dy,
          { width: parent.clientWidth, height: parent.clientHeight },
          unbounded,
        );
        latest.current.onGeometry({
          positions: { [id]: { x: next.x, y: next.y } },
          sizes: { [id]: { width: next.width, height: next.height } },
        });
      },
      (cancelled) => {
        if (cancelled && !latest.current.readOnly)
          latest.current.onGeometry({
            positions: { [id]: { x: target.x, y: target.y } },
            sizes: { [id]: { width: target.width, height: target.height } },
          });
      },
    );
  };
  const beginMarquee = (event: ReactPointerEvent) => {
    if (
      event.button !== 0 ||
      options.tool !== "cursor" ||
      !(event.target instanceof Element) ||
      event.target.closest(".canvas-memo,.resize-overlay,[data-page-move]")
    )
      return;
    const hit = event.target.closest<HTMLElement>("[data-layer-id]");
    if (hit && !hit.classList.contains("artboard")) return;
    const board = options.board.current;
    if (!board) return;
    event.preventDefault();
    focus();
    const index = layerIndex(options.layers),
      initialIds = options.selectedIds,
      additive = event.shiftKey;
    let page = hit?.classList.contains("artboard") ? hit : null;
    const origin = board.getBoundingClientRect(),
      zoom = scale();
    const start = {
      x: (event.clientX - origin.left) / zoom,
      y: (event.clientY - origin.top) / zoom,
    };
    track(
      event,
      (dx, dy) => {
        const rect = {
          x: Math.min(start.x, start.x + dx),
          y: Math.min(start.y, start.y + dy),
          width: Math.abs(dx),
          height: Math.abs(dy),
        };
        setMarquee(rect);
        const screen = {
          x: origin.left + rect.x * zoom,
          y: origin.top + rect.y * zoom,
          width: rect.width * zoom,
          height: rect.height * zoom,
        };
        if (!page)
          page =
            [...board.querySelectorAll<HTMLElement>(".artboard")].find((node) =>
              intersects(screen, rectOf(node)),
            ) ?? null;
        if (!page) return;
        const ids = [...page.querySelectorAll<HTMLElement>("[data-layer-id]")]
          .filter((node) => {
            if (index.get(node.dataset.layerId!)?.blocked) return false;
            let visible = rectOf(node);
            let parent = node.parentElement;
            while (parent && parent !== board) {
              const css = getComputedStyle(parent);
              if (
                css.overflow !== "visible" ||
                css.overflowX !== "visible" ||
                css.overflowY !== "visible"
              )
                visible = intersection(visible, rectOf(parent));
              parent = parent.parentElement;
            }
            return intersects(screen, visible);
          })
          .map((node) => node.dataset.layerId!);
        const selected = movableSelection(options.layers, [
          ...(additive
            ? initialIds.filter(
                (id) =>
                  index.get(id)?.layer.kind !== "page" &&
                  page?.querySelector(`[data-layer-id="${CSS.escape(id)}"]`),
              )
            : []),
          ...ids,
        ]);
        latest.current.onSelectMany(
          selected.length ? selected : [page.dataset.layerId!],
        );
      },
      (cancelled) => {
        if (cancelled) latest.current.onSelectMany(initialIds);
      },
      false,
    );
  };
  const finishKeys = () => {
    if (keyActive.current) {
      latest.current.onInteractionEnd();
      keyActive.current = false;
    }
  };
  useEffect(() => {
    if (options.readOnly) {
      cleanup.current?.(true);
      if (keyActive.current) {
        latest.current.onInteractionEnd();
        keyActive.current = false;
      }
    }
  }, [options.readOnly]);
  useEffect(() => {
    cleanup.current?.(true);
  }, [options.tool]);
  useEffect(() => {
    const blur = () => {
      if (keyActive.current) {
        latest.current.onInteractionEnd();
        keyActive.current = false;
      }
    };
    window.addEventListener("blur", blur);
    return () => {
      cleanup.current?.(true);
      blur();
      window.removeEventListener("blur", blur);
    };
  }, []);
  const onKeyDown = (event: ReactKeyboardEvent) => {
    if (
      !options.readOnly &&
      options.tool === "cursor" &&
      isDeleteShortcut(event)
    ) {
      cleanup.current?.(true);
      if (options.onDeleteMany(options.selectedIds)) {
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }
    if (event.key === "Escape") {
      cleanup.current?.(true);
      return;
    }
    if (
      options.readOnly ||
      options.tool !== "cursor" ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.nativeEvent.isComposing ||
      (event.target instanceof Element &&
        event.target.closest(
          'input,textarea,select,[contenteditable="true"]',
        )) ||
      document.querySelector(
        ".planning-root dialog[open],.planning-root .canvas-context-menu",
      )
    )
      return;
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    if (!delta[event.key]) return;
    const targets = targetsFor(options.selectedIds);
    if (!targets.length) return;
    const next = moveTargets(targets, ...delta[event.key]);
    if (!targets.some((t) => next[t.id].x !== t.x || next[t.id].y !== t.y))
      return;
    event.preventDefault();
    if (!keyActive.current) {
      options.onInteractionStart();
      keyActive.current = true;
    }
    options.onGeometry({ positions: next });
  };
  return {
    cancel: () => cleanup.current?.(true),
    marquee,
    beginMove,
    beginResize,
    beginMarquee,
    onKeyDown,
    onKeyUp: finishKeys,
    onBlur: finishKeys,
  };
}
