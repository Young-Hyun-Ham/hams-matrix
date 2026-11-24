import {
  Typography,
  Button,
  Chip,
  Box,
  TextField,
  Stack,
  IconButton,
} from "@mui/material";
import {
  Settings as SettingsIcon,
  DeleteOutlined as DeleteIcon,
} from "@mui/icons-material";
import { useEffect, useState } from "react";
import { useTranslation } from "@/app/(builder)/hooks/useTranslation";

import ElementPropertyEditor from "./ElementPropertyEditor";
import { useFormEditorStore } from "../stores/useFormEditorStore";
import { FORM_ELEMENT_REGISTRY } from "../stores/elementRegistry";
import { useBuilderStore } from "../../store";
import CustomElementPropertyEditor from "./CustomElementPropertyEditor";
import ElementDefaultProperty from "./ElementDefaultProperty";

function SectionHeader({
  color,
  title,
  resetForm,
  resetElement,
}: {
  color: string;
  title: string;
  resetForm?: () => void;
  resetElement?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        mb: 2,
        pb: 1,
        borderBottom: 1,
        borderColor: "grey.100",
      }}
    >
      <Box sx={{ width: 6, height: 16, bgcolor: color, borderRadius: 4 }} />
      <Typography sx={{ fontWeight: 700 }} variant="subtitle2">
        {title}
      </Typography>
      {resetForm && (
        <>
          <Box sx={{ flex: 1 }} />
          <Button
            variant="outlined"
            size="small"
            onClick={resetForm}
            sx={{
              minHeight: 30,
              textTransform: "none",
              borderColor: "divider",
              bgcolor: "background.paper",
            }}
          >
            {t("Reset")}
          </Button>
        </>
      )}
      {resetElement && (
        <>
          <Box sx={{ flex: 1 }} />
          <Button
            variant="outlined"
            size="small"
            onClick={resetElement}
            sx={{
              minHeight: 30,
              textTransform: "none",
              borderColor: "divider",
              bgcolor: "background.paper",
            }}
          >
            {t("Reset")}
          </Button>
        </>
      )}
    </Box>
  );
}

type RightPanelProps = {
  setIsJsonDialogOpen?: (open: boolean) => void;
  showHeader?: boolean;
  onResetForm?: () => void;
};

function RightPanel({
  setIsJsonDialogOpen,
  showHeader = true,
  onResetForm,
}: RightPanelProps) {
  const { t } = useTranslation();
  const formId = useFormEditorStore((state) => state.formId);
  const title = useFormEditorStore((state) => state.title);
  const elements = useFormEditorStore((state) => state.elements);
  const selectedElementId = useFormEditorStore(
    (state) => state.selectedElementId,
  );
  const setTitle = useFormEditorStore((state) => state.setTitle);
  const updateElement = useFormEditorStore((state) => state.updateElement);
  const updateElementField = useFormEditorStore(
    (state) => state.updateElementField,
  );
  const removeElement = useFormEditorStore((state) => state.removeElement);
  const resizeGrid = useFormEditorStore((state) => state.resizeGrid);
  const resetForm = useFormEditorStore((state) => state.resetForm);

  const [unuseFormElements, setUnuseFormElements] = useState<string[]>([]);
  const { loadingUserData } = useBuilderStore() as any;

  const formElementTypesJson = useFormEditorStore(
    (state) => state.formElementTypesJson,
  );

  useEffect(() => {
    let mounted = true;

    const loadData = async () => {
      const userInfo = await loadingUserData();

      if (mounted) {
        setUnuseFormElements(userInfo.unuseFormElements ?? []);

        formElementTypesJson.forEach((type) => {
          if (type.visible === false) {
            setUnuseFormElements((prev) => [...prev, type.type_cd]);
          }
        });
      }
    };

    void loadData();

    return () => {
      mounted = false;
    };
  }, [loadingUserData, formElementTypesJson]);

  const handleResetForm = onResetForm ?? resetForm;

  const resetElement = () => {
    if (selectedElementId) {
      const selectedElementType: keyof typeof FORM_ELEMENT_REGISTRY =
        selectedElementId.split("-")[0] as keyof typeof FORM_ELEMENT_REGISTRY;
      const defaultElement =
        FORM_ELEMENT_REGISTRY[selectedElementType].create();

      updateElement({
        ...defaultElement,
        id: selectedElementId,
      });
    }
  };

  const selectedElement =
    elements.find((element) => element.id === selectedElementId) ?? null;

  const isSelectedElementReadonly =
    selectedElement != null && unuseFormElements.includes(selectedElement.type);

  return (
    <>
      {showHeader && (
        <Box
          sx={{
            height: 56,
            display: "flex",
            alignItems: "center",
            px: 2,
            borderBottom: 1,
            borderColor: "divider",
            bgcolor: "var(--builder-surface)",
          }}
        >
          <SettingsIcon
            fontSize="small"
            sx={{ color: "text.secondary", mr: 1 }}
          />
          <Typography sx={{ fontWeight: 700 }} variant="subtitle2">
            {t("Properties Settings")}
          </Typography>
          <Box sx={{ flex: 1 }} />
          <Button
            variant="outlined"
            size="small"
            onClick={() => setIsJsonDialogOpen?.(true)}
            sx={{
              minHeight: 30,
              textTransform: "none",
              borderColor: "divider",
              bgcolor: "background.paper",
            }}
          >
            {t("Form JSON")}
          </Button>
        </Box>
      )}

      <Box sx={{ flex: 1, overflow: "auto" }}>
        {selectedElement ? (
          <Box
            sx={{
              p: 2.5,
              display: "flex",
              flexDirection: "column",
              gap: 3,
            }}
          >
            <Box>
              <Stack
                direction="row"
                sx={{
                  alignItems: "center",
                  justifyContent: "space-between",
                  ...{ mb: 2 },
                }}
              >
                <Chip
                  label={selectedElement.type.toUpperCase()}
                  size="small"
                  color="primary"
                  variant="outlined"
                  sx={{ fontWeight: 700 }}
                />
                <IconButton
                  aria-label="Delete selected element"
                  size="small"
                  onClick={() => removeElement(selectedElement.id)}
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Stack>

              <SectionHeader
                color="primary.main"
                title={`${t("Default Properties")} (Common)`}
                resetElement={resetElement}
              />

              <ElementDefaultProperty
                element={selectedElement}
                onChange={updateElementField}
                isReadonly={isSelectedElementReadonly}
              />
            </Box>

            <Box>
              <SectionHeader
                color="secondary.main"
                title={`${t("Unique Properties")} (${selectedElement.type})`}
              />
              <ElementPropertyEditor
                element={selectedElement}
                onChange={updateElement}
                onGridSizeChange={resizeGrid}
                isReadonly={isSelectedElementReadonly}
              />
            </Box>

            <Box>
              <SectionHeader
                color="text.secondary"
                title={`${t("Custom Properties")} (${selectedElement.type})`}
              />
              <CustomElementPropertyEditor
                element={selectedElement}
                elements={elements}
                onChange={updateElement}
                onGridSizeChange={resizeGrid}
                isReadonly={isSelectedElementReadonly}
              />
            </Box>
          </Box>
        ) : (
          <Box sx={{ p: 2.5 }}>
            <SectionHeader
              color="primary.main"
              title={t("Form Properties")}
              resetForm={handleResetForm}
            />
            <Stack spacing={2}>
              <TextField
                label={t("ID")}
                size="small"
                fullWidth
                value={formId ?? " "}
                disabled
              />
              <TextField
                label={t("Form Title")}
                size="small"
                fullWidth
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </Stack>
          </Box>
        )}
      </Box>
    </>
  );
}

export default RightPanel;
