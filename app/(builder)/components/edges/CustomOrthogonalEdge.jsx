import { BaseEdge, EdgeLabelRenderer } from "reactflow";
import { useBuilderStore } from "../../store/index";
import { useBuilderAppearance } from "../BuilderAppearance";

const MIN_SEGMENT_LENGTH = 24;

function clonePoint(point) {
  return { x: point.x, y: point.y };
}

function samePoint(a, b) {
  return a.x === b.x && a.y === b.y;
}

function dedupe(points) {
  const result = [];
  for (const point of points) {
    const prev = result[result.length - 1];
    if (!prev || !samePoint(prev, point)) {
      result.push(clonePoint(point));
    }
  }
  return result;
}

function compressCollinear(points) {
  if (points.length <= 2) return points.map(clonePoint);

  const result = [clonePoint(points[0])];

  for (let i = 1; i < points.length - 1; i += 1) {
    const prev = result[result.length - 1];
    const curr = points[i];
    const next = points[i + 1];

    const sameVertical = prev.x === curr.x && curr.x === next.x;
    const sameHorizontal = prev.y === curr.y && curr.y === next.y;

    if (sameVertical || sameHorizontal) continue;
    result.push(clonePoint(curr));
  }

  result.push(clonePoint(points[points.length - 1]));
  return result;
}

function expandDiagonalPairs(points) {
  if (!Array.isArray(points)) return [];
  return points.map(clonePoint);
}

function normalize(points) {
  return compressCollinear(dedupe(expandDiagonalPairs(points)));
}

function getInitialBendPoints(
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
) {
  const isSourceBottom = sourcePosition === "bottom";
  const isTargetTop = targetPosition === "top";

  if (isSourceBottom && isTargetTop) {
    const midY = (sourceY + targetY) / 2;
    return [
      { x: sourceX, y: midY },
      { x: targetX, y: midY },
    ];
  }

  if (isSourceBottom) {
    return [{ x: sourceX, y: targetY }];
  }

  if (isTargetTop) {
    return [{ x: targetX, y: sourceY }];
  }

  const MIN_EXIT_SPACE = 40; // 노드에서 빠져나올 최소 거리

  // 상황 판별: 타겟이 소스보다 우측에 여유 있게(최소 공간 이상) 있는가?
  const isTargetFarRight = targetX > sourceX + MIN_EXIT_SPACE * 2;

  if (isTargetFarRight) {
    /**
     * CASE 1: 일반적인 Z자 연결 (이미지의 왼쪽 두 노드 형태)
     * 소스와 타겟 사이의 중간 지점에서 한 번 꺾입니다.
     */
    const midX = (sourceX + targetX) / 2;
    return [
      { x: midX, y: sourceY },
      { x: midX, y: targetY },
    ];
  } else {
    /**
     * CASE 2: 노드 수직 배치 또는 역방향 배치 (이미지의 오른쪽 두 노드 형태)
     * 노드를 관통하지 않도록 오른쪽으로 나갔다가 타겟 왼쪽으로 돌아 들어갑니다.
     */
    const safeExitX = sourceX + MIN_EXIT_SPACE;
    const safeEntryX = targetX - MIN_EXIT_SPACE;
    const midY = (sourceY + targetY) / 2;

    return [
      { x: safeExitX, y: sourceY }, // 1. 소스에서 오른쪽으로 나감
      { x: safeExitX, y: midY }, // 2. 중간 높이까지 내려감
      { x: safeEntryX, y: midY }, // 3. 타겟의 왼쪽 뒤편으로 이동
      { x: safeEntryX, y: targetY }, // 4. 타겟 높이로 맞춤
    ];
  }
}

function getBendPoints(
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  storedPoints,
) {
  if (Array.isArray(storedPoints) && storedPoints.length > 0) {
    return normalize(storedPoints);
  }

  return getInitialBendPoints(
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  );
}

function buildFullPoints(sourceX, sourceY, targetX, targetY, bendPoints) {
  return normalize([
    { x: sourceX, y: sourceY },
    ...bendPoints.map(clonePoint),
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
      isHorizontal,
      isVertical,
      centerX: (start.x + end.x) / 2,
      centerY: (start.y + end.y) / 2,
    });
  }

  return segments;
}

function moveSegment(fullPoints, segmentIndex, dx, dy) {
  const points = fullPoints.map(clonePoint);
  const lastSegmentIndex = points.length - 2;

  const start = points[segmentIndex];
  const end = points[segmentIndex + 1];
  if (!start || !end) return points;

  const isHorizontal = start.y === end.y;
  const isVertical = start.x === end.x;

  // 1) straight line
  if (points.length === 2) {
    if (isHorizontal) {
      const newY = start.y + dy;
      return normalize([
        points[0],
        { x: points[0].x, y: newY },
        { x: points[1].x, y: newY },
        points[1],
      ]);
    }

    if (isVertical) {
      const newX = start.x + dx;
      return normalize([
        points[0],
        { x: newX, y: points[0].y },
        { x: newX, y: points[1].y },
        points[1],
      ]);
    }

    return points;
  }

  // 2) first segment
  if (segmentIndex === 0) {
    if (isHorizontal) {
      const newY = start.y + dy;
      const inserted = { x: points[0].x, y: newY };
      const movedCorner = { ...points[1], y: newY };
      return normalize([points[0], inserted, movedCorner, ...points.slice(2)]);
    }

    if (isVertical) {
      const newX = start.x + dx;
      const inserted = { x: newX, y: points[0].y };
      const movedCorner = { ...points[1], x: newX };
      return normalize([points[0], inserted, movedCorner, ...points.slice(2)]);
    }
  }

  // 3) last segment
  if (segmentIndex === lastSegmentIndex) {
    if (isHorizontal) {
      const newY = start.y + dy;
      const movedCorner = { ...points[lastSegmentIndex], y: newY };
      const inserted = { x: points[points.length - 1].x, y: newY };
      return normalize([
        ...points.slice(0, lastSegmentIndex),
        movedCorner,
        inserted,
        points[points.length - 1],
      ]);
    }

    if (isVertical) {
      const newX = start.x + dx;
      const movedCorner = { ...points[lastSegmentIndex], x: newX };
      const inserted = { x: newX, y: points[points.length - 1].y };
      return normalize([
        ...points.slice(0, lastSegmentIndex),
        movedCorner,
        inserted,
        points[points.length - 1],
      ]);
    }
  }

  // 4) middle segment
  if (isHorizontal) {
    points[segmentIndex].y += dy;
    points[segmentIndex + 1].y += dy;
  }

  if (isVertical) {
    points[segmentIndex].x += dx;
    points[segmentIndex + 1].x += dx;
  }

  return normalize(points);
}

function CustomOrthogonalEdge(props) {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    markerEnd,
    selected,
    data,
    style,
    label,
  } = props;

  const updateEdgePoints = useBuilderStore((state) => state.updateEdgePoints);
  const appearance = useBuilderAppearance();

  const bendPoints = getBendPoints(
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data?.points,
  );

  const fullPoints = buildFullPoints(
    sourceX,
    sourceY,
    targetX,
    targetY,
    bendPoints,
  );

  const edgePath = buildPath(fullPoints);
  const segments = getSegments(fullPoints);

  const displayLabel = label || data?.label;
  const midSegment =
    segments && segments.length > 0
      ? segments[Math.floor(segments.length / 2)]
      : null;
  const labelX = midSegment ? midSegment.centerX : (sourceX + targetX) / 2;
  const labelY = midSegment ? midSegment.centerY : (sourceY + targetY) / 2;

  const createMouseDownHandler = (segment) => (event) => {
    event.preventDefault();
    event.stopPropagation();

    const startClientX = event.clientX;
    const startClientY = event.clientY;
    const initialFullPoints = fullPoints.map(clonePoint);

    const onMouseMove = (moveEvent) => {
      const dx = moveEvent.clientX - startClientX;
      const dy = moveEvent.clientY - startClientY;

      const movedFullPoints = moveSegment(
        initialFullPoints,
        segment.index,
        segment.isVertical ? dx : 0,
        segment.isHorizontal ? dy : 0,
      );

      updateEdgePoints(id, normalize(movedFullPoints).slice(1, -1));
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

      {displayLabel && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              background: appearance
                ? "var(--builder-edge)"
                : displayLabel === "Y"
                  ? "#16a34a"
                  : displayLabel === "N"
                    ? "#dc2626"
                    : displayLabel === "Default"
                      ? "#ef4444"
                      : "#2563eb",
              color: appearance ? "var(--builder-surface)" : "#ffffff",
              padding: appearance
                ? "1px 5px"
                : displayLabel === "Default"
                  ? "3px 9px"
                  : "2px 8px",
              borderRadius: "12px",
              fontSize: appearance ? "10px" : "11px",
              fontWeight: appearance ? 500 : 700,
              boxShadow: appearance ? "none" : "0 2px 6px rgba(0,0,0,0.18)",
              pointerEvents: "all",
              zIndex: 25,
            }}
          >
            {displayLabel}
          </div>
        </EdgeLabelRenderer>
      )}

      {selected && (
        <EdgeLabelRenderer>
          <>
            {segments.map((segment) => (
              <div
                key={`${id}-segment-${segment.index}`}
                onMouseDown={createMouseDownHandler(segment)}
                title={
                  segment.isHorizontal ? "Move vertical" : "Move horizontal"
                }
                style={{
                  position: "absolute",
                  transform: `translate(-50%, -50%) translate(${segment.centerX}px, ${segment.centerY}px)`,
                  width: 14,
                  height: 14,
                  borderRadius: 9999,
                  background: "#2563eb",
                  border: "2px solid #ffffff",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
                  cursor: segment.isHorizontal ? "ns-resize" : "ew-resize",
                  pointerEvents: "all",
                  zIndex: 30,
                }}
              />
            ))}
          </>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export default CustomOrthogonalEdge;
