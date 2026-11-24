import { BaseEdge, EdgeLabelRenderer } from "reactflow";

const MIN_SEGMENT_LENGTH = 36;

function clonePoint(point) {
  return { x: point.x, y: point.y };
}

function samePoint(a, b) {
  return a.x === b.x && a.y === b.y;
}

function ensureOrthogonal(points) {
  if (!Array.isArray(points) || points.length < 2) {
    return points ?? [];
  }

  const normalized = [clonePoint(points[0])];

  for (let i = 1; i < points.length; i += 1) {
    const prev = normalized[normalized.length - 1];
    const curr = clonePoint(points[i]);

    if (prev.x !== curr.x && prev.y !== curr.y) {
      normalized.push({ x: curr.x, y: prev.y });
    }

    normalized.push(curr);
  }

  return normalized;
}

function dedupePoints(points) {
  const next = [];

  for (const point of points) {
    const prev = next[next.length - 1];
    if (!prev || !samePoint(prev, point)) {
      next.push(clonePoint(point));
    }
  }

  return next;
}

function collapseCollinear(points) {
  if (points.length <= 2) return points.map(clonePoint);

  const next = [clonePoint(points[0])];

  for (let i = 1; i < points.length - 1; i += 1) {
    const prev = next[next.length - 1];
    const curr = points[i];
    const after = points[i + 1];

    const vertical = prev.x === curr.x && curr.x === after.x;
    const horizontal = prev.y === curr.y && curr.y === after.y;

    if (vertical || horizontal) {
      continue;
    }

    next.push(clonePoint(curr));
  }

  next.push(clonePoint(points[points.length - 1]));
  return next;
}

function normalizePolyline(points) {
  return collapseCollinear(dedupePoints(ensureOrthogonal(points)));
}

function buildStoredPoints(sourceX, sourceY, targetX, targetY, storedPoints) {
  if (Array.isArray(storedPoints) && storedPoints.length >= 2) {
    return normalizePolyline(storedPoints);
  }

  const gap = Math.max(Math.abs(targetX - sourceX) / 2, 60);

  return normalizePolyline([
    { x: sourceX + gap, y: sourceY },
    { x: sourceX + gap, y: targetY },
  ]);
}

function buildRenderPoints(sourceX, sourceY, targetX, targetY, storedPoints) {
  return normalizePolyline([
    { x: sourceX, y: sourceY },
    ...storedPoints.map(clonePoint),
    { x: targetX, y: targetY },
  ]);
}

function buildPath(points) {
  return points
    .map((point, index) =>
      index === 0 ? `M ${point.x},${point.y}` : `L ${point.x},${point.y}`,
    )
    .join(" ");
}

function getSegments(points) {
  const segments = [];

  for (let i = 0; i < points.length - 1; i += 1) {
    const start = points[i];
    const end = points[i + 1];

    const isHorizontal = start.y === end.y;
    const isVertical = start.x === end.x;

    if (!isHorizontal && !isVertical) continue;

    const length = isHorizontal
      ? Math.abs(end.x - start.x)
      : Math.abs(end.y - start.y);

    if (length < MIN_SEGMENT_LENGTH) continue;

    segments.push({
      index: i,
      start,
      end,
      isHorizontal,
      isVertical,
      centerX: (start.x + end.x) / 2,
      centerY: (start.y + end.y) / 2,
    });
  }

  return segments;
}

function moveSegment(points, segmentIndex, deltaX, deltaY) {
  const next = points.map(clonePoint);
  const start = next[segmentIndex];
  const end = next[segmentIndex + 1];

  if (!start || !end) return next;

  const isHorizontal = start.y === end.y;
  const isVertical = start.x === end.x;

  if (isHorizontal) {
    start.y += deltaY;
    end.y += deltaY;

    if (segmentIndex > 0) {
      next[segmentIndex - 1].y = start.y;
    }
    if (segmentIndex + 2 < next.length) {
      next[segmentIndex + 2].y = end.y;
    }
  }

  if (isVertical) {
    start.x += deltaX;
    end.x += deltaX;

    if (segmentIndex > 0) {
      next[segmentIndex - 1].x = start.x;
    }
    if (segmentIndex + 2 < next.length) {
      next[segmentIndex + 2].x = end.x;
    }
  }

  return normalizePolyline(next);
}

function CustomDraggableStepEdge(props) {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    markerEnd,
    selected,
    data,
    style,
  } = props;

  const updateEdgeSegment = data?.updateEdgeSegment;

  const storedPoints = buildStoredPoints(
    sourceX,
    sourceY,
    targetX,
    targetY,
    data?.points,
  );

  const renderPoints = buildRenderPoints(
    sourceX,
    sourceY,
    targetX,
    targetY,
    storedPoints,
  );

  const segments = getSegments(renderPoints);
  const edgePath = buildPath(renderPoints);

  const createMouseDownHandler = (segment) => (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (typeof updateEdgeSegment !== "function") {
      return;
    }

    const startClientX = event.clientX;
    const startClientY = event.clientY;
    const initialRenderPoints = renderPoints.map(clonePoint);

    const onMouseMove = (moveEvent) => {
      const dx = moveEvent.clientX - startClientX;
      const dy = moveEvent.clientY - startClientY;

      const moved = moveSegment(
        initialRenderPoints,
        segment.index,
        segment.isVertical ? dx : 0,
        segment.isHorizontal ? dy : 0,
      );

      const nextStoredPoints = normalizePolyline(moved.slice(1, -1));
      updateEdgeSegment(id, nextStoredPoints);
    };

    const onMouseUp = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} />

      {selected && (
        <EdgeLabelRenderer>
          <>
            {segments.map((segment) => (
              <div
                key={`${id}-segment-${segment.index}`}
                style={{
                  position: "absolute",
                  transform: `translate(-50%, -50%) translate(${segment.centerX}px, ${segment.centerY}px)`,
                  pointerEvents: "all",
                  width: 14,
                  height: 14,
                  borderRadius: "9999px",
                  background: "#2563eb",
                  border: "2px solid #ffffff",
                  cursor: segment.isHorizontal ? "ns-resize" : "ew-resize",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
                  zIndex: 30,
                }}
                onMouseDown={createMouseDownHandler(segment)}
                title={
                  segment.isHorizontal ? "Move vertical" : "Move horizontal"
                }
              />
            ))}
          </>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export default CustomDraggableStepEdge;
