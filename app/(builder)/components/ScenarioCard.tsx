import {
  Box,
  Card,
  CardContent,
  IconButton,
  Typography,
  Popover,
  MenuItem,
  ListItemText,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { MoreVert } from "@mui/icons-material";
import { useState } from "react";
import { useTranslation } from "@/app/(builder)/hooks/useTranslation";

import { Scenario } from "../types/types";
import { ScenarioTypeBadge } from "./ScenarioType";

import { formatDateTime } from "../utils/util";

export function ScenarioCard({
  scenario,
  selected = false,
  focused = false,
  showProgressId = true,
  onSelect,
  onEdit,
  onDelete,
  onMove,
  onClone,
  disableClick = false,
  disableActions = false,
  mode = "default",
  versionChips,
}: {
  scenario: Scenario;
  selected?: boolean;
  focused?: boolean;
  mode?: "default" | "popup";
  showProgressId?: boolean;
  onSelect?: (scenario: Scenario) => void;
  onEdit?: (scenario: Scenario) => void;
  onDelete?: (scenario: Scenario) => void;
  onMove?: (scenario: Scenario) => void;
  onClone?: (scenario: Scenario) => void;
  disableClick?: boolean;
  disableActions?: boolean;
  versionChips?: Array<{
    key: string;
    label: string;
    active?: boolean;
  }>;
}) {
  const { t } = useTranslation();
  const { palette } = useTheme();

  const [menuAnchorEl, setMenuAnchorEl] = useState<HTMLElement | null>(null);
  const isMenuOpen = Boolean(menuAnchorEl);
  const openMenu = (e: React.MouseEvent<HTMLElement>) => {
    e.stopPropagation();
    setMenuAnchorEl(e.currentTarget as HTMLElement);
  };
  const closeMenu = () => setMenuAnchorEl(null);

  const isDeployed = Boolean(scenario.depn_ver_id);
  const isPopupSelected = mode === "popup" && selected;
  const isHighlighted = selected || focused;
  const successColor = palette.success.main;
  const deployedBackground = `color-mix(in srgb, ${successColor} 12%, var(--builder-surface))`;

  return (
    <Card
      key={scenario.id}
      sx={{
        border: selected ? 2 : 1,
        borderColor: isPopupSelected
          ? successColor
          : isHighlighted
            ? "var(--builder-accent)"
            : "var(--builder-border)",
        color: "var(--builder-text)",
        borderRadius: 2,
        minWidth: 0,
        width: "100%",
        cursor: disableClick ? "grab" : "pointer",
        height: "100%",
        backgroundColor: isPopupSelected
          ? deployedBackground
          : isHighlighted
            ? "var(--builder-accent-soft)"
            : isDeployed
              ? deployedBackground
              : "var(--builder-surface)",
        boxShadow: isPopupSelected
          ? `0 0 0 3px color-mix(in srgb, ${successColor} 15%, transparent)`
          : isHighlighted
            ? "0 0 0 2px var(--builder-accent-soft)"
            : undefined,
        transition:
          "background-color .2s ease, border-color .2s ease, box-shadow .2s ease",
      }}
      elevation={2}
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.(scenario);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        // console.log('떠블클릭 : >', scenario);
        onMove?.(scenario);
      }}
    >
      <CardContent
        sx={{
          "&.MuiCardContent-root": {
            p: 1.5,
            height: "100%",
            boxSizing: "border-box",
          },
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 1,
            ...{ minWidth: 0 },
          }}
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.5,
              ...{ flex: "0 0 auto", minWidth: 0 },
            }}
          >
            <ScenarioTypeBadge scenario={scenario} />
            {scenario.depn_ver_id && (
              <Typography
                variant="caption"
                sx={{
                  color: "var(--builder-muted)",
                  fontSize: "11px",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {`v.${scenario.depn_ver_id}`}
              </Typography>
            )}
          </Box>
          {(scenario.updated_at || scenario.updatedAt) && (
            <Typography
              variant="caption"
              sx={{
                color: "var(--builder-muted)",
                fontSize: "11px",
                whiteSpace: "nowrap",
                flexShrink: 1,
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {formatDateTime(scenario.updated_at || scenario.updatedAt)}
            </Typography>
          )}
          <IconButton
            aria-label="More Options"
            sx={{
              p: 0.5,
              flexShrink: 0,
            }}
            disabled={disableActions}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onClick={disableActions ? undefined : openMenu}
          >
            <MoreVert sx={{ fontSize: "16px" }} />
          </IconButton>
          <Popover
            open={isMenuOpen}
            anchorEl={menuAnchorEl}
            onClose={closeMenu}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
            transformOrigin={{ vertical: "top", horizontal: "right" }}
            slotProps={{
              paper: {
                ...{ "data-builder-theme": palette.mode },
                elevation: 1,
                sx: {
                  border: "1px solid",
                  borderColor: "var(--builder-border)",
                  borderRadius: 2,
                  bgcolor: "var(--builder-surface)",
                  color: "var(--builder-text)",
                  overflow: "visible",
                },
              },
            }}
          >
            <MenuItem
              onClick={(e) => {
                e.stopPropagation();
                closeMenu();
                onClone?.(scenario);
              }}
              sx={{
                "&.MuiMenuItem-root": {
                  borderRadius: 2,
                },
              }}
            >
              <ListItemText
                sx={{
                  "& .MuiListItemText-primary": {
                    fontSize: 12,
                    lineHeight: "16px",
                  },
                }}
              >
                {t("Clone")}
              </ListItemText>
            </MenuItem>
            <MenuItem
              onClick={(e) => {
                e.stopPropagation();
                closeMenu();
                onEdit?.(scenario);
              }}
              sx={{
                "&.MuiMenuItem-root": {
                  borderRadius: 2,
                },
              }}
            >
              <ListItemText
                sx={{
                  "& .MuiListItemText-primary": {
                    fontSize: 12,
                    lineHeight: "16px",
                  },
                }}
              >
                {t("Edit")}
              </ListItemText>
            </MenuItem>
            <MenuItem
              onClick={(e) => {
                e.stopPropagation();
                closeMenu();
                onDelete?.(scenario);
              }}
              sx={{
                "&.MuiMenuItem-root": {
                  borderRadius: 2,
                },
              }}
            >
              <ListItemText
                sx={{
                  "& .MuiListItemText-primary": {
                    fontSize: 12,
                    lineHeight: "16px",
                  },
                }}
              >
                {t("Delete")}
              </ListItemText>
            </MenuItem>
          </Popover>
        </Box>
        <Typography
          sx={{
            mt: "10px",
            fontSize: 14,
            fontWeight: 400,
            lineHeight: 1.2,
            ...{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              minWidth: 0,
            },
          }}
        >
          {scenario.name ?? ""}
        </Typography>
      </CardContent>
    </Card>
  );
}
