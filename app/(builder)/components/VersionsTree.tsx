// builder/components/VersionTree.tsx
"use client";

import { useState, useMemo } from "react";
import { Box } from "@mui/material";

import { TreeItem, VersionTreeItem } from "../types/types";
import { useBuilderStore } from "../store/index";
import ScenarioGroupModal from "./modals/ScenarioGroupModal";
import { getScenarioVersion } from "../services/backendService";

type Props = {
  data: VersionTreeItem[];
  isDragMode?: boolean;
};

export default function VersionsTree({ data, isDragMode }: Props) {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(
    () => Object.fromEntries(data.map((sec) => [sec.id, true])),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { setNodes, setEdges, setStartNodeId, setSelectedVersionId } =
    useBuilderStore() as any;

  const sections = useMemo(
    () => data.slice().sort((a, b) => a.index - b.index),
    [data],
  );

  const toggle = (id: string) =>
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }));

  // scenario group node 추가
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);

  const { backend, scenario, scenarios, fetchScenarioData } =
    useBuilderStore() as any;

  const addNodeEvent = async (
    e: React.MouseEvent<HTMLDivElement> | React.DragEvent<HTMLDivElement>,
    section: TreeItem,
    item: VersionTreeItem,
  ) => {
    switch (section.id) {
      case "sec-biz":
        break;
      case "sec-user":
        break;
      case "sec-default":
      default:
        if ("dataTransfer" in e) {
          // drag
          if (!isDragMode) return;
          e.dataTransfer.setData("application/reactflow", item.type ?? "");
          e.dataTransfer.effectAllowed = "move";
        } else {
          // click
          if (isDragMode) return;
          // console.log('Item clicked:', item);
          const payload = {
            scenario_id: item.snro_id,
            version_id: item.ver_id,
          };
          const data: any = await getScenarioVersion(backend, payload);
          setSelectedVersionId(item.ver_id);
          setNodes(data.nodes || []);
          setEdges(data.edges || []);
          setStartNodeId(data.start_node_id || null);
        }
    }
  };

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
        {sections.map((section) => (
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
                {openSections[section.id] ? "▾" : "▸"}
              </Box>
            </Box>

            {/* Items */}
            {openSections[section.id] && (
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
                    .sort((a, b) => a.index - b.index)
                    .map((item) => (
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
                          &nbsp;
                          {item.depn_yn === "Y" ? (
                            <>★</>
                          ) : (
                            <>&nbsp;&nbsp;&nbsp;&nbsp;</>
                          )}
                          &nbsp;
                        </Box>
                        <Box
                          component="span"
                          sx={{
                            flex: 1,
                            textAlign: "left",
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
