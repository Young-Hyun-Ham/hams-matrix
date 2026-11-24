import { Box, Paper, Stack, Typography } from "@mui/material";
import { DndContext, useSensors, type DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Add as PlusIcon } from "@mui/icons-material";
import { useTranslation } from "@/app/(builder)/hooks/useTranslation";

import SortableCanvasElement from "./SortableCanvasElement";
import { FormElement } from "../type";

type CanvasProps = {
  elements: FormElement[];
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  handleDrop: (event: React.DragEvent<HTMLDivElement>) => void;
  handleElementDragEnd: (event: DragEndEvent) => void;
  setIsElementDialogOpen: (open: boolean) => void;
  isDragOver: boolean;
  setIsDragOver: (over: boolean) => void;
  sensors: ReturnType<typeof useSensors>;
  onElementEvent?: (element: FormElement, value?: unknown) => void;
};

function Canvas({
  elements,
  selectedId,
  setSelectedId,
  handleDrop,
  handleElementDragEnd,
  setIsElementDialogOpen,
  isDragOver,
  setIsDragOver,
  sensors,
  onElementEvent,
}: CanvasProps) {
  const { t } = useTranslation();

  return (
    <Box
      onClick={() => setSelectedId(null)}
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
      sx={{
        flex: 1,
        overflow: "auto",
        p: 4,
        display: "flex",
        justifyContent: "center",
      }}
    >
      <Paper
        variant="outlined"
        sx={{
          width: "90%",
          minHeight: 120,
          height: "fit-content",
          p: 2.5,
          borderRadius: 1,
          borderStyle: elements.length === 0 ? "dashed" : "solid",
          borderWidth: 2,
          borderColor: isDragOver ? "primary.main" : "divider",
          bgcolor: isDragOver ? "primary.50" : "background.paper",
          transition: "border-color 0.2s, background-color 0.2s",
        }}
      >
        <DndContext sensors={sensors} onDragEnd={handleElementDragEnd}>
          <SortableContext
            items={elements.map((element) => element.id)}
            strategy={verticalListSortingStrategy}
          >
            <Stack spacing={1.5}>
              {elements.map((element) => (
                <SortableCanvasElement
                  key={element.id}
                  element={element}
                  selected={element.id === selectedId}
                  onSelect={(event) => {
                    event.stopPropagation();
                    setSelectedId(element.id);
                  }}
                  onElementEvent={onElementEvent}
                />
              ))}

              {/* {elements.length === 0 && ( */}
              <Paper
                variant="outlined"
                onClick={(event) => {
                  event.stopPropagation();
                  setIsElementDialogOpen(true);
                }}
                sx={{
                  minHeight: 96,
                  p: 3,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  borderStyle: "dashed",
                  borderWidth: 2,
                  borderColor: isDragOver ? "primary.main" : "divider",
                  color: "text.disabled",
                  cursor: "pointer",
                  bgcolor: isDragOver ? "primary.50" : "transparent",
                  "&:hover": {
                    bgcolor: "var(--builder-surface)",
                    borderColor: "grey.400",
                  },
                }}
              >
                <PlusIcon sx={{ mb: 1 }} />
                <Typography
                  sx={{ fontWeight: 500 }}
                  variant="body2"
                  align="center"
                >
                  {t("Drag or click components here to add")}
                </Typography>
              </Paper>
              {/* )} */}
            </Stack>
          </SortableContext>
        </DndContext>
      </Paper>
    </Box>
  );
}

export default Canvas;
