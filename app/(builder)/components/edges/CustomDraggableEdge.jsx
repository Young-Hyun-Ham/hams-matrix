import { BaseEdge, EdgeLabelRenderer } from "reactflow";

function CustomDraggableEdge(props) {
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

  const controlX = data?.controlX ?? (sourceX + targetX) / 2;
  const controlY = data?.controlY ?? (sourceY + targetY) / 2;

  const edgePath = `M ${sourceX},${sourceY} Q ${controlX},${controlY} ${targetX},${targetY}`;

  const onMouseDown = (event) => {
    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const startY = event.clientY;
    const initialX = controlX;
    const initialY = controlY;

    const updateEdgeControlPoint = data?.updateEdgeControlPoint;
    if (typeof updateEdgeControlPoint !== "function") {
      return;
    }

    const onMouseMove = (moveEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;

      updateEdgeControlPoint(id, {
        controlX: initialX + dx,
        controlY: initialY + dy,
      });
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
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${controlX}px, ${controlY}px)`,
              pointerEvents: "all",
              width: 14,
              height: 14,
              borderRadius: "9999px",
              background: "#2563eb",
              border: "2px solid #ffffff",
              cursor: "grab",
              boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
              zIndex: 30,
            }}
            onMouseDown={onMouseDown}
            title="Drag edge"
          />
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export default CustomDraggableEdge;
