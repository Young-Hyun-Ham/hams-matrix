import {
  Box,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
} from "@mui/material";
import { ArrowDropDown as ChevronDownIcon } from "@mui/icons-material";
import { useTranslation } from "@/app/(builder)/hooks/useTranslation";

import { ElementType } from "../type";
import {
  FORM_ELEMENT_REGISTRY,
  FORM_ELEMENT_TYPES,
} from "../stores/elementRegistry";

type LeftPanelProps = {
  addComponent: (type: ElementType) => void;
  elementTypes: ElementType[];
  loading?: boolean;
  error?: string | null;
};

function LeftPanel({
  addComponent,
  elementTypes,
  loading = false,
  error = null,
}: LeftPanelProps) {
  const { t } = useTranslation();
  return (
    <Box sx={{ flex: 1, overflow: "auto", p: 2 }}>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 2,
        }}
      >
        <Typography sx={{ fontWeight: 700 }} variant="subtitle2">
          {t("Basic")}
        </Typography>
        <ChevronDownIcon fontSize="small" />
      </Box>

      {loading ? (
        <Typography sx={{ color: "text.secondary" }} variant="body2">
          {t("Loading element types")}...
        </Typography>
      ) : null}

      {error ? (
        <Typography sx={{ color: "error" }} variant="body2">
          {error}
        </Typography>
      ) : null}

      <List
        disablePadding
        sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}
      >
        {elementTypes.map((type) => {
          const comp = FORM_ELEMENT_REGISTRY[type];

          return (
            <ListItemButton
              key={type}
              draggable
              onDragStart={(event) => {
                event.dataTransfer.setData(
                  "application/x-form-component",
                  type,
                );
                event.dataTransfer.effectAllowed = "copy";
              }}
              onClick={() => addComponent(type)}
              sx={{
                border: 1,
                borderColor: "primary.light",
                borderRadius: 1,
                color: "primary.main",
                py: 0.75,
                "&:hover": { bgcolor: "primary.50" },
              }}
            >
              <ListItemIcon sx={{ minWidth: 32, color: "inherit" }}>
                {comp.icon}
              </ListItemIcon>
              <ListItemText
                slotProps={{
                  primary: {
                    sx: {
                      fontSize: "0.875rem",
                      fontWeight: 500,
                    },
                  },
                }}
                primary={comp.label}
              />
            </ListItemButton>
          );
        })}
      </List>
    </Box>
  );
}

export default LeftPanel;
