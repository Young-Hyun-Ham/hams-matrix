import { Box } from "@mui/material";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { FormElement } from "../type";
import CanvasElement from "./CanvasElement";

// Canvas 내 요소를 드래그하여 순서를 변경할 수 있도록 하는 래퍼 컴포넌트
function SortableCanvasElement({
  element,
  selected,
  onSelect,
  onElementEvent,
}: {
  element: FormElement;
  selected: boolean;
  onSelect: (event: React.MouseEvent<HTMLDivElement>) => void;
  onElementEvent?: (element: FormElement, value?: unknown) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: element.id });

  return (
    <Box
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
      }}
      {...attributes}
      {...listeners}
    >
      <CanvasElement
        element={element}
        selected={selected}
        onSelect={onSelect}
        onElementEvent={onElementEvent}
      />
    </Box>
  );
}

export default SortableCanvasElement;
