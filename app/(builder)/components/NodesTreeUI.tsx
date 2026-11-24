"use client";
import { PanelLeftClose } from "lucide-react";

import {
  Box,
  FormControlLabel,
  IconButton,
  Switch,
  Typography,
} from "@mui/material";
import { memo, useState } from "react";
import { useTranslation } from "@/app/(builder)/hooks/useTranslation";

import NodesTree from "./NodesTree";
import { MOCK_UP_TREE_DATA } from "../store";

import { COLORS } from "@/app/(builder)/constants/color";

//

// [인수인계 메모]
// - 역할: 좌측 카테고리 메뉴 트리 렌더링.
function NodesTreeUI({
  props,
  variant,
  onScenarioGroupClick,
  onNodesSettingClick,
}: any) {
  const { t } = useTranslation();
  const [isDragMode, setIsDragMode] = useState(true);
  const [isUserCollapsed, setIsUserCollapsed] = useState(false);
  const isMenuCollapsed =
    props?.isCollapsed !== undefined
      ? props.isCollapsed
      : Boolean(props?.isMenuView) || isUserCollapsed;

  if (variant === "scenario") {
    return (
      <Box
        aria-label="Nodes Tree"
        aria-expanded={!isMenuCollapsed}
        sx={{
          width: isMenuCollapsed ? 40 : 218,
          flexShrink: 0,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          bgcolor: "var(--builder-surface)",
          borderRight: "1px solid var(--builder-border)",
          overflow: "hidden",
        }}
      >
        <Box
          sx={{
            height: 34,
            px: 1.25,
            display: "flex",
            alignItems: "center",
            borderBottom: "1px solid var(--builder-border)",
            flexShrink: 0,
          }}
        >
          {!isMenuCollapsed && (
            <Typography
              sx={{
                flex: 1,
                fontSize: 12,
                fontWeight: 500,
                color: "var(--builder-text)",
              }}
            >
              {t("Node type")}
            </Typography>
          )}
          <IconButton
            size="small"
            sx={{ color: "var(--builder-muted)" }}
            aria-label={
              isMenuCollapsed ? "Expand Nodes Tree" : "Collapse Nodes Tree"
            }
            onClick={() =>
              props?.onToggleCollapse
                ? props.onToggleCollapse(!isMenuCollapsed)
                : setIsUserCollapsed((prev) => !prev)
            }
          >
            <PanelLeftClose size={16} aria-hidden="true" />
          </IconButton>
        </Box>
        <Box
          hidden={isMenuCollapsed}
          sx={{ flex: 1, minHeight: 0, overflowY: "auto", width: 217 }}
        >
          <NodesTree
            variant="scenario"
            data={MOCK_UP_TREE_DATA}
            isDragMode={isDragMode}
            onScenarioGroupClick={onScenarioGroupClick}
            onNodesSettingClick={onNodesSettingClick}
          />
          <FormControlLabel
            sx={{
              mx: 1,
              "& .MuiFormControlLabel-label": {
                fontSize: 11,
                color: "var(--builder-muted)",
              },
            }}
            control={
              <Switch
                size="small"
                checked={isDragMode}
                onChange={(_, checked) => setIsDragMode(checked)}
              />
            }
            label={t("Drag & Drop")}
          />
        </Box>
      </Box>
    );
  }

  return (
    <Box
      aria-label="Nodes Tree"
      aria-expanded={!isMenuCollapsed}
      sx={{
        borderRight: 1,
        borderColor: "var(--builder-border)",
        width: isMenuCollapsed ? "46px" : "264px",
        ...{
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          minHeight: 0,
          transition: "width 240ms ease-in-out",
          willChange: "width",
        },
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.5,
          px: 0.5,
          py: 1,
          borderBottom: isMenuCollapsed ? 0 : 1,
          borderColor: "var(--builder-border)",
        }}
      >
        <IconButton
          aria-label={
            isMenuCollapsed ? "Expand Nodes Tree" : "Collapse Nodes Tree"
          }
          onClick={() => {
            if (props?.onToggleCollapse) {
              props.onToggleCollapse(!isMenuCollapsed);
            } else {
              setIsUserCollapsed((prev) => !prev);
            }
          }}
        >
          <PanelLeftClose size={16} aria-hidden="true" />
        </IconButton>
        <Typography
          sx={{
            fontSize: 14,
            fontWeight: 500,
            color: "text.primary",
            ...{
              transition: "opacity 200ms ease, transform 200ms ease",
              opacity: isMenuCollapsed ? 0 : 1,
              transform: isMenuCollapsed ? "translateX(-4px)" : "none",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            },
          }}
        >
          {t("Node Library")}
        </Typography>
        <Box sx={{ flex: 0.5 }} />
        {!isMenuCollapsed && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={isDragMode}
                  onChange={(_, checked) => setIsDragMode(checked)}
                  // disabled={selectedChunk != null}
                />
              }
              label={t("Drag & Drop")}
              sx={{
                mr: 0,
                "& .MuiFormControlLabel-label": {
                  fontSize: 12,
                  fontWeight: 500,
                  color: "text.primary",
                },
              }}
            />
          </Box>
        )}
      </Box>
      <Box
        sx={{
          flex: 1,
          width: "264px",
          minWidth: "264px",
          overflowY: "auto",
          overflowX: "hidden",
          transition: "opacity 200ms ease, transform 200ms ease",
          willChange: "transform, opacity",
          opacity: isMenuCollapsed ? 0 : 1,
          transform: isMenuCollapsed ? "translateX(-218px)" : "none",
          pointerEvents: isMenuCollapsed ? "none" : "auto",
        }}
        aria-hidden={isMenuCollapsed}
      >
        <NodesTree
          data={MOCK_UP_TREE_DATA}
          isDragMode={isDragMode}
          onScenarioGroupClick={onScenarioGroupClick}
          onNodesSettingClick={onNodesSettingClick}
        />
      </Box>
    </Box>
  );
}

export default memo(NodesTreeUI);
