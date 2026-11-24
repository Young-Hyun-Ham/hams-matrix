// builder/components/NodesTree.tsx
"use client";

import { useState, useMemo, useEffect } from "react";
import { Box } from "@mui/material";
import NodeTypeIcon from "./icons/NodeTypeIcon";
import paletteStyles from "../react-flow/scenario-flow/ScenarioFlow.module.css";

import { TreeItem } from "../types/types";
import { useBuilderStore } from "../store/index";

type Props = {
  variant?: "scenario";
  data: TreeItem[];
  isDragMode?: boolean;
  onScenarioGroupClick?: () => void;
  onNodesSettingClick?: () => void;
};

export default function NodesTree({
  variant,
  data,
  isDragMode,
  onScenarioGroupClick,
  onNodesSettingClick,
}: Props) {
  const { addNode, treeNodes, loadTreeNodes } = useBuilderStore() as any;

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const loadingTreeNodes = async () => {
      await loadTreeNodes();
    };

    loadingTreeNodes();
  }, [loadTreeNodes]);

  const sections = useMemo(
    () => treeNodes.slice().sort((a: any, b: any) => a.index - b.index),
    [treeNodes],
  );

  const toggle = (id: string) =>
    setOpenSections((prev) => ({ ...prev, [id]: !(prev[id] ?? true) }));

  // scenario group node 추가
  const addNodeEvent = async (
    e: React.MouseEvent<HTMLDivElement> | React.DragEvent<HTMLDivElement>,
    section: TreeItem,
    item: TreeItem,
  ) => {
    switch (section.id) {
      case "sec-biz":
        // console.log('sec-biz  ======>', e.type, section, item);
        // 시나리오 그룹 모달 팝업 오픈
        if ("dataTransfer" in e) {
          if (!isDragMode) return;

          // 일반 노드와 구분하기 위한 Scenario Group 드래그 타입
          e.dataTransfer.setData(
            "application/reactflow",
            item.type ?? "scenarioGroup",
          );
          e.dataTransfer.effectAllowed = "move";
          return;
        }
        // 기존 클릭 동작
        onScenarioGroupClick?.();
        break;
      case "sec-user":
        // console.log('sec-user ======>', e.type, section, item);
        if ("dataTransfer" in e) return;
        if (item.type === "settingNodes") {
          // 노드 설정 페이지로 이동
          onNodesSettingClick?.();
        }
        break;
      case "sec-default":
      default:
        if ("dataTransfer" in e) {
          // drag
          if (!isDragMode) return;
          // DnD payload: application/json
          const payload = {
            id: item.id,
            label: item.label,
            index: item.index,
          };
          // e.dataTransfer.setData(
          //   'application/json',
          //   JSON.stringify(payload)
          // );
          // e.dataTransfer.effectAllowed = 'copyMove';
          e.dataTransfer.setData("application/reactflow", item.type ?? "");
          e.dataTransfer.effectAllowed = "move";
          // onItemDragStart?.(item);
        } else {
          // click
          if (isDragMode) return;

          setSelectedId(item.id);
          addNode(item.type);
        }
    }
  };

  if (variant === "scenario") {
    const items = sections.flatMap((section: TreeItem) =>
      section.children
        .slice()
        .sort((a, b) => a.index - b.index)
        .map((item) => ({ section, item })),
    );
    const groups = [
      { label: "Chat", types: ["message", "form"] },
      { label: "Flow control", types: ["branch", "link", "ynBranch", "delay"] },
      { label: "Data", types: ["setSlot", "api", "slotfilling"] },
      { label: "Embed", types: ["iframe"] },
      { label: "Reuse", types: ["scenarioGroup", "scenario"] },
      { label: "More", types: [] as string[] },
    ];
    const knownTypes = groups.flatMap((group) => group.types);
    const visuals: Record<string, { color: string; label?: string }> = {
      message: { color: "#ee9900" },
      form: { color: "#f16b6b" },
      branch: { color: "#6288f6", label: "Branch" },
      link: { color: "#00a9d1" },
      setSlot: { color: "#00b9bc" },
      api: { color: "#65ad55" },
      iframe: { color: "#9767ef", label: "Iframe" },
      scenarioGroup: { color: "#cf69ba", label: "Sub Agent" },
      settingNodes: { color: "#8b8b8b" },
    };
    return (
      <div className={paletteStyles.palette}>
        {groups.map((group) => {
          const children = items.filter(({ item }: { item: TreeItem }) =>
            group.label === "More"
              ? !knownTypes.includes(item.type || "")
              : group.types.includes(item.type || ""),
          );
          if (!children.length) return null;
          return (
            <section key={group.label} className={paletteStyles.paletteGroup}>
              <h3>{group.label}</h3>
              <div className={paletteStyles.paletteGrid}>
                {children.map(
                  ({
                    section,
                    item,
                  }: {
                    section: TreeItem;
                    item: TreeItem;
                  }) => {
                    const visual = visuals[item.type || ""] || {
                      color: "#8b8b8b",
                    };
                    return (
                      <Box
                        key={`${section.id}-${item.id}`}
                        role="button"
                        tabIndex={0}
                        title={item.label}
                        draggable={isDragMode}
                        onDragStart={(e: React.DragEvent<HTMLDivElement>) =>
                          addNodeEvent(e, section, item)
                        }
                        onClick={(e: React.MouseEvent<HTMLDivElement>) =>
                          addNodeEvent(e, section, item)
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            e.currentTarget.click();
                          }
                        }}
                        className={paletteStyles.paletteItem}
                        style={
                          {
                            "--node-accent": visual.color,
                          } as React.CSSProperties
                        }
                      >
                        <NodeTypeIcon type={item.type || ""} size={17} />
                        <span>{visual.label || item.label}</span>
                      </Box>
                    );
                  },
                )}
              </div>
            </section>
          );
        })}
      </div>
    );
  }

  return (
    <Box
      sx={{
        width: 260,
        // bgcolor: '#1b1c48',
        bgcolor: "var(--builder-surface)",
        color: "#fff",
        borderRadius: 1.5,
        overflow: "hidden",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 6px 20px rgba(0,0,0,0.25)",
      }}
    >
      {/* Sections */}
      <Box sx={{ overflowY: "auto", flex: 1 }}>
        {sections.map((section: any) => (
          <Box
            key={section.id}
            sx={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}
          >
            {/* Section header (accordion) */}
            <Box
              role="button"
              onClick={() => toggle(section.id)}
              sx={{
                px: 2,
                py: 1.2,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                bgcolor: "#25275a",
                cursor: "pointer",
                "&:hover": { bgcolor: "#555679ff" },
                userSelect: "none",
              }}
            >
              <Box component="span">{section.label}</Box>
              <Box component="span" sx={{ fontSize: 12 }}>
                {(openSections[section.id] ?? true) ? "v" : ">"}
              </Box>
            </Box>

            {/* Items */}
            {(openSections[section.id] ?? true) && (
              <Box
                sx={{
                  p: 1.5,
                  bgcolor: "var(--builder-surface)",
                  // bgcolor: '#21224d',
                  display: "grid",
                  gap: 1,
                }}
              >
                {section.children.length === 0 ? (
                  <Box sx={{ fontSize: 12, color: "#000", px: 1 }}>
                    No items
                  </Box>
                ) : (
                  section.children
                    .slice()
                    .sort((a: any, b: any) => a.index - b.index)
                    .map((item: any) => (
                      <Box
                        key={item.id}
                        draggable={isDragMode}
                        onDragStart={(e: React.DragEvent<HTMLDivElement>) =>
                          addNodeEvent(e, section, item)
                        }
                        onClick={(e: React.MouseEvent<HTMLDivElement>) =>
                          addNodeEvent(e, section, item)
                        }
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: 1.2,
                          px: 1.5,
                          py: 1,
                          bgcolor: "#E9ECF3",
                          borderRadius: 2,
                          border: "1px solid transparent",
                          outline:
                            selectedId === item.id
                              ? "2px solid #7a7cff"
                              : "none",
                          outlineOffset: 0,
                          "&:hover": {
                            // bgcolor: '#3a3b7e',
                            bgcolor: "#aeaeca",
                            borderColor: "#7a7cff",
                          },
                          transition: "all .12s ease",
                          cursor: "grab",
                        }}
                      >
                        <Box
                          component="span"
                          sx={{
                            bgcolor: "var(--builder-surface)",
                            color: "#9cc2ff",
                            alignItems: "center",
                            alignContent: "center",
                            borderRadius: 1,
                          }}
                        >
                          &nbsp;★&nbsp;
                        </Box>
                        <Box
                          component="span"
                          sx={{
                            flex: 1,
                            textAlign: "center",
                            fontSize: 14,
                            color: "#000000",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {item.label}
                        </Box>
                      </Box>
                    ))
                )}
              </Box>
            )}
          </Box>
        ))}
      </Box>
    </Box>
  );
}
