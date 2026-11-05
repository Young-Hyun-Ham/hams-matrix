export type Rect = { x: number; y: number; width: number; height: number };
export type ResizeDirection = "n" | "e" | "s" | "w" | "nw" | "ne" | "sw" | "se";
export type MoveTarget = Rect & { id: string; maxX: number; maxY: number };
export const intersects = (a: Rect, b: Rect) =>
  a.width > 0 &&
  a.height > 0 &&
  b.width > 0 &&
  b.height > 0 &&
  a.x <= b.x + b.width &&
  a.x + a.width >= b.x &&
  a.y <= b.y + b.height &&
  a.y + a.height >= b.y;
export function intersection(a: Rect, b: Rect): Rect {
  const x = Math.max(a.x, b.x),
    y = Math.max(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(0, Math.min(a.x + a.width, b.x + b.width) - x),
    height: Math.max(0, Math.min(a.y + a.height, b.y + b.height) - y),
  };
}
export function moveTargets(targets: MoveTarget[], dx: number, dy: number) {
  const x = Math.max(
    ...targets.map((t) => -t.x),
    Math.min(dx, ...targets.map((t) => Math.max(t.x, t.maxX) - t.x)),
  );
  const y = Math.max(
    ...targets.map((t) => -t.y),
    Math.min(dy, ...targets.map((t) => Math.max(t.y, t.maxY) - t.y)),
  );
  return Object.fromEntries(
    targets.map((t) => [t.id, { x: t.x + x, y: t.y + y }]),
  );
}
export function resizeRect(
  start: Rect,
  direction: ResizeDirection,
  dx: number,
  dy: number,
  parent: { width: number; height: number },
  unbounded = false,
): Rect {
  const west = direction.includes("w"),
    north = direction.includes("n");
  const horizontal = west || direction.includes("e"),
    vertical = north || direction.includes("s");
  const maxWidth = Math.max(
    1,
    unbounded
      ? Infinity
      : west
        ? start.x + start.width
        : parent.width - start.x,
  );
  const maxHeight = Math.max(
    1,
    unbounded
      ? Infinity
      : north
        ? start.y + start.height
        : parent.height - start.y,
  );
  const width = horizontal
    ? Math.max(
        Math.min(24, maxWidth),
        Math.min(maxWidth, start.width + (west ? -dx : dx)),
      )
    : start.width;
  const height = vertical
    ? Math.max(
        Math.min(18, maxHeight),
        Math.min(maxHeight, start.height + (north ? -dy : dy)),
      )
    : start.height;
  return {
    x: west ? Math.max(0, start.x + start.width - width) : start.x,
    y: north ? Math.max(0, start.y + start.height - height) : start.y,
    width,
    height,
  };
}
