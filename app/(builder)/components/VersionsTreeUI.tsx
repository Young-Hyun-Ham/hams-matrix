// @/components/VersionsTreeUI.tsx
"use client";

import { Box, IconButton, Typography } from "@mui/material";
import { memo, useEffect, useMemo, useState } from "react";
import { useTranslation } from "@/app/(builder)/hooks/useTranslation";

import VersionsTree from "./VersionsTree";
import { TreeItem, VersionTreeItem } from "../types/types";
import { getScenarioVersions } from "../services/backendService";
import { useBuilderStore } from "../store";

import { COLORS } from "@/app/(builder)/constants/color";
import { useModal } from "@/app/(builder)/providers/ModalProvider";
import apiClient from "@/app/(builder)/services/apiClient";

export const MOCK_UP_TREE_DATA: TreeItem[] = [
  {
    id: "sec-default",
    index: 0,
    label: "Default",
    children: [
      // {
      //   id: 'DEV_1000_000025_15',
      //   type: 'version',
      //   index: 0,
      //   label: '1.0.1',
      //   children: [],
      // },
      // {
      //   id: 'DEV_1000_000025_33',
      //   type: 'version',
      //   index: 1,
      //   label: '1.0.2',
      //   children: [],
      // },
      // {
      //   id: 'DEV_1000_000025_34',
      //   type: 'version',
      //   index: 2,
      //   label: '1.0.3',
      //   children: [],
      // },
    ],
  },
];

// [인수인계 메모]
// - 역할: 좌측 카테고리 메뉴 트리 렌더링.
function VersionsTreeUI({ props, versions }: any) {
  const { t } = useTranslation();
  const { showAlert } = useModal();
  const [treeData, setTreeData] =
    useState<VersionTreeItem[]>(MOCK_UP_TREE_DATA);

  const { backend, scenario } = useBuilderStore() as any;

  const [isDragMode, setIsDragMode] = useState(true);
  const [isUserCollapsed, setIsUserCollapsed] = useState(false);
  const isMenuCollapsed = Boolean(props?.isMenuView) || isUserCollapsed;

  useEffect(() => {
    const loadVersions = async () => {
      try {
        const data: any = await getScenarioVersions(backend, {
          scenario_id: scenario.id,
        });
        console.log("VersionsTreeUI - loadVersions - data: ", data);
        // const versionList = Array.isArray(data) ? data : data?.version_list ?? [];

        const versionChildren: any = (data?.version_list ?? []).map(
          (item: any, index: number) => ({
            id: item.snro_id + ":" + item.ver_id + ":" + item.depn_yn,
            snro_id: item.snro_id,
            ver_id: item.ver_id,
            depn_yn: item.depn_yn,
            type: "version",
            index,
            label: item.ver_id ?? "",
          }),
        );

        setTreeData([
          {
            id: "sec-default",
            index: 0,
            label: t("Default"),
            children: versionChildren,
          },
        ]);
      } catch (error) {
        showAlert(t("Failed to load versions"));
      }
    };

    loadVersions();
  }, [backend, scenario.id, showAlert, t]);

  return (
    <Box
      aria-label="Version Tree"
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
            isMenuCollapsed ? "Expand Version Tree" : "Collapse Version Tree"
          }
          onClick={() => setIsUserCollapsed((prev) => !prev)}
        >
          {/* {isMenuCollapsed ? <LeftPanelOpenIcon /> : <LeftPanelCloseIcon />} */}
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
          {t("Verions")}
        </Typography>
        <Box sx={{ flex: 0.5 }} />
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }} />
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
        <VersionsTree data={treeData} isDragMode={false} />
      </Box>
    </Box>
  );
}

export default memo(VersionsTreeUI);
