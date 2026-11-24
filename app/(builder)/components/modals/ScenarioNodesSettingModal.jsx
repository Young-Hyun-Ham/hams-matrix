import React, { useMemo, useState } from "react";
import {
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  List,
  ListItemIcon,
  ListItemText,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { Palette, Visibility, VisibilityOff } from "@mui/icons-material";
import { useTranslation } from "@/app/(builder)/hooks/useTranslation";
import { MOCK_UP_TREE_DATA, useBuilderStore } from "../../store";
import { useBuilderRuntime } from "../../providers/runtime";
import { useModal } from "../../providers/ModalProvider";

const getNodeItems = () =>
  MOCK_UP_TREE_DATA.flatMap((section) =>
    section.children.map((item) => ({
      ...item,
      sectionLabel: section.label,
    })),
  );

const getLabelByType = (items, type) => {
  const item = items.find((nodeItem) => nodeItem.type === type);
  return item?.label ?? type;
};

function ScenarioNodesSettingModal({ isOpen, onClose }) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState(0);
  const [saving, setSaving] = useState(false);
  const { showAlert } = useModal();
  const { user } = useBuilderRuntime();

  const nodeColors = useBuilderStore((state) => state.nodeColors);
  const setNodeColors = useBuilderStore((state) => state.setNodeColors);
  const userInfoJson = useBuilderStore((state) => state.userInfoJson);
  const setUserInfoJson = useBuilderStore((state) => state.setUserInfoJson);
  const loadTreeNodes = useBuilderStore((state) => state.loadTreeNodes);

  const isAdmin = useMemo(
    () =>
      ["master", "admin", "biz_admin", "team_admin"].includes(user.accountRole),
    [user.accountRole],
  );
  const selectedTab = isAdmin ? activeTab : 0;
  const nodeItems = useMemo(() => getNodeItems(), []);
  const nodeUseSections = useMemo(
    () => MOCK_UP_TREE_DATA.filter((section) => section.id !== "sec-user"),
    [],
  );
  const colorItems = useMemo(
    () =>
      Object.keys(nodeColors ?? {}).map((type) => ({
        type,
        label: getLabelByType(nodeItems, type),
        color: nodeColors[type],
      })),
    [nodeColors, nodeItems],
  );

  const updateNodeColor = (type, color) => {
    const nextNodeColors = {
      ...nodeColors,
      [type]: color,
    };

    setNodeColors(nextNodeColors);
    setUserInfoJson({
      ...userInfoJson,
      nodeColors: nextNodeColors,
    });
  };

  const updateNodeUseStatus = (nodeId, checked) => {
    const currentUnuseNodes = Array.isArray(userInfoJson?.unuseNodes)
      ? userInfoJson.unuseNodes
      : [];
    const nextUnuseNodes = checked
      ? currentUnuseNodes.filter((item) => item !== nodeId)
      : Array.from(new Set([...currentUnuseNodes, nodeId]));

    setUserInfoJson({
      ...userInfoJson,
      unuseNodes: nextUnuseNodes,
    });
    void loadTreeNodes();
  };

  return (
    <Dialog
      slotProps={{
        paper: {
          sx: {
            height: 600,
            maxHeight: 600,
          },
        },
      }}
      open={isOpen}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
    >
      <DialogTitle sx={{ fontWeight: 700 }}>
        {t("Scenario Nodes Settings")}
      </DialogTitle>
      <DialogContent dividers sx={{ p: 0, overflow: "hidden" }}>
        <Tabs
          value={selectedTab}
          onChange={(_, value) => setActiveTab(value)}
          sx={{
            px: 2,
            borderBottom: 1,
            borderColor: "divider",
            "& .MuiTab-root": {
              minHeight: 48,
              textTransform: "none",
              fontWeight: 700,
            },
          }}
        >
          <Tab label="Node Color" />
          {isAdmin ? <Tab label="Node Use Status" /> : null}
        </Tabs>

        {selectedTab === 0 ? (
          <List
            disablePadding
            sx={{
              display: "flex",
              flexDirection: "column",
              gap: 1,
              height: "calc(100% - 49px)",
              overflowY: "auto",
              p: 2,
            }}
          >
            {colorItems.map((item) => (
              <Box
                key={item.type}
                sx={{
                  border: 1,
                  borderColor: "divider",
                  borderRadius: 1,
                  px: 1.5,
                  py: 1,
                  display: "flex",
                  alignItems: "center",
                  gap: 1.25,
                }}
              >
                <ListItemIcon sx={{ minWidth: 32, color: item.color }}>
                  <Palette fontSize="small" />
                </ListItemIcon>
                <ListItemText
                  slotProps={{
                    primary: {
                      fontSize: "0.875rem",
                      fontWeight: 700,
                      noWrap: true,
                    },
                    secondary: {
                      fontSize: "0.75rem",
                      noWrap: true,
                    },
                  }}
                  primary={item.label}
                  secondary={item.type}
                  sx={{ flex: 1, minWidth: 0 }}
                />
                <Box
                  sx={{
                    width: 30,
                    height: 30,
                    borderRadius: 1,
                    border: 1,
                    borderColor: "divider",
                    bgcolor: item.color,
                    flexShrink: 0,
                  }}
                />
                <TextField
                  type="color"
                  size="small"
                  value={item.color}
                  onChange={(event) =>
                    updateNodeColor(item.type, event.target.value)
                  }
                  sx={{
                    width: 52,
                    flexShrink: 0,
                    "& input": {
                      p: 0.5,
                      height: 28,
                      cursor: "pointer",
                    },
                  }}
                />
              </Box>
            ))}
          </List>
        ) : (
          <Stack
            spacing={1}
            sx={{
              height: "calc(100% - 49px)",
              overflowY: "auto",
              p: 2,
            }}
          >
            {nodeUseSections.map((section) => (
              <Box key={section.id}>
                <Typography
                  variant="subtitle2"
                  sx={{ mb: 0.75, fontWeight: 700, color: "text.secondary" }}
                >
                  {section.label}
                </Typography>
                <List
                  disablePadding
                  sx={{ display: "flex", flexDirection: "column", gap: 1 }}
                >
                  {section.children.map((item) => {
                    const checked = !userInfoJson?.unuseNodes?.includes(
                      item.id,
                    );

                    return (
                      <Box
                        key={item.id}
                        sx={{
                          border: 1,
                          borderColor: "divider",
                          borderRadius: 1,
                          px: 1.5,
                          py: 0.75,
                          display: "flex",
                          alignItems: "center",
                          gap: 1,
                        }}
                      >
                        <ListItemIcon
                          sx={{
                            minWidth: 30,
                            color: checked ? "primary.main" : "text.disabled",
                          }}
                        >
                          {checked ? (
                            <Visibility fontSize="small" />
                          ) : (
                            <VisibilityOff fontSize="small" />
                          )}
                        </ListItemIcon>
                        <ListItemText
                          slotProps={{
                            primary: {
                              fontSize: "0.875rem",
                              fontWeight: 600,
                              noWrap: true,
                            },
                            secondary: {
                              fontSize: "0.75rem",
                              noWrap: true,
                            },
                          }}
                          primary={item.label}
                          secondary={item.id}
                          sx={{ flex: 1, minWidth: 0 }}
                        />
                        <Checkbox
                          size="small"
                          checked={checked}
                          onChange={(_, nextChecked) =>
                            updateNodeUseStatus(item.id, nextChecked)
                          }
                          sx={{ p: 0.5, flexShrink: 0 }}
                        />
                      </Box>
                    );
                  })}
                </List>
              </Box>
            ))}
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button disabled={saving} onClick={onClose}>
          {t("Close")}
        </Button>
        <Button
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            try {
              await useBuilderStore.getState().saveUserSettings();
              onClose();
            } catch (error) {
              await showAlert(error.message ?? "설정을 저장하지 못했습니다.");
            } finally {
              setSaving(false);
            }
          }}
        >
          {t("Save")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default ScenarioNodesSettingModal;
