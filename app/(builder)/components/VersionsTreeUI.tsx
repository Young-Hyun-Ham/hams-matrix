// @/components/VersionsTreeUI.tsx
"use client";

import { Box, IconButton, Typography } from "@mui/material";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { memo, useEffect, useEffectEvent, useState } from "react";
import { useTranslation } from "@/app/(builder)/hooks/useTranslation";

import VersionsTree from "./VersionsTree";
import { getScenarioVersions } from "../services/backendService";
import { useBuilderStore } from "../store";

import { useModal } from "@/app/(builder)/providers/ModalProvider";

type Props = {
  props?: { isMenuView?: boolean };
  scenarioId: string;
  selectedVersionId?: number | null;
  onSelectVersion: (versionId: number) => void;
};

const expandedWidth = 132;
const collapsedWidth = 46;

function VersionsTreeUI({
  props,
  scenarioId,
  selectedVersionId,
  onSelectVersion,
}: Props) {
  const { t } = useTranslation();
  const { showAlert } = useModal();
  const backend = useBuilderStore((state) => state.backend);
  const [versionList, setVersionList] = useState<{
    version_list: { ver_id: number }[];
    deployed_version: number | null;
  } | null>(null);
  const reportLoadError = useEffectEvent(() =>
    showAlert(t("Failed to load versions")),
  );
  const [isUserCollapsed, setIsUserCollapsed] = useState(false);
  const isMenuCollapsed = Boolean(props?.isMenuView) || isUserCollapsed;

  useEffect(() => {
    if (!scenarioId) return;

    let active = true;
    void getScenarioVersions(backend, { scenario_id: scenarioId })
      .then((data) => {
        if (active) setVersionList(data);
      })
      .catch(() => {
        if (active) void reportLoadError();
      });

    return () => {
      active = false;
    };
  }, [backend, scenarioId]);

  return (
    <Box
      aria-label="Version Tree"
      aria-expanded={!isMenuCollapsed}
      sx={{
        borderRight: 1,
        borderColor: "var(--builder-border)",
        bgcolor: "var(--builder-surface)",
        width: isMenuCollapsed ? collapsedWidth : expandedWidth,
        boxSizing: "border-box",
        flexShrink: 0,
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
            isMenuCollapsed ? "Expand Version Tree" : "Collapse Version Tree"
          }
          size="small"
          sx={{ color: "var(--builder-text)", flexShrink: 0 }}
          onClick={() => setIsUserCollapsed((prev) => !prev)}
        >
          {isMenuCollapsed ? (
            <PanelLeftOpen size={16} />
          ) : (
            <PanelLeftClose size={16} />
          )}
        </IconButton>
        <Typography
          sx={{
            fontSize: 14,
            fontWeight: 500,
            color: "var(--builder-text)",
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
          {t("Verions")}
        </Typography>
        <Box sx={{ flex: 0.5 }} />
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }} />
      </Box>
      <Box
        sx={{
          flex: 1,
          width: expandedWidth - 1,
          minHeight: 0,
          overflowY: "auto",
          overflowX: "hidden",
          transition: "opacity 200ms ease, transform 200ms ease",
          willChange: "transform, opacity",
          opacity: isMenuCollapsed ? 0 : 1,
          transform: isMenuCollapsed
            ? `translateX(-${expandedWidth - collapsedWidth}px)`
            : "none",
          pointerEvents: isMenuCollapsed ? "none" : "auto",
        }}
        aria-hidden={isMenuCollapsed}
        inert={isMenuCollapsed}
      >
        <VersionsTree
          versions={
            versionList?.version_list.map((version) => version.ver_id) ?? []
          }
          deployedVersionId={versionList?.deployed_version}
          selectedVersionId={selectedVersionId}
          onSelectVersion={onSelectVersion}
        />
      </Box>
    </Box>
  );
}

export default memo(VersionsTreeUI);
