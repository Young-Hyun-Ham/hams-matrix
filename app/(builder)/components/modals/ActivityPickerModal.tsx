"use client";

import { useEffect, useMemo, useRef } from "react";
import { Box, Button, IconButton, Typography } from "@mui/material";
import {
  CirclePlus,
  ExternalLink,
  FileText,
  FormInput,
  Globe,
  Layers,
  Link as LinkIcon,
  MessageSquare,
  PlugZap,
  Search,
  Split,
  SquareFunction,
  X,
} from "lucide-react";
import { useTranslation } from "@/app/(builder)/hooks/useTranslation";

export type ActivityType =
  | "message"
  | "setSlot"
  | "branch"
  | "form"
  | "link"
  | "api"
  | "iframe"
  | "scenario"
  | "selectionGroup";

type ActivityDefinition = {
  type: ActivityType;
  title: string;
  description: string;
  category: string;
};

const uiPathBlue = "#0f6cbd";
const panelBorder = "#d6dde5";

const activityList: ActivityDefinition[] = [
  {
    type: "message",
    title: "Message Box",
    description: "Displays a message box with a specified text and buttons.",
    category: "Control",
  },
  {
    type: "setSlot",
    title: "Set Slot",
    description: "Assigns values to scenario slots.",
    category: "Control",
  },
  {
    type: "branch",
    title: "Branch",
    description: "Models an If-Then-Else condition.",
    category: "Control",
  },
  {
    type: "form",
    title: "Form",
    description: "Collects structured inputs with form elements.",
    category: "UI Automation",
  },
  {
    type: "link",
    title: "Link",
    description: "Shows a clickable external link.",
    category: "UI Automation",
  },
  {
    type: "api",
    title: "HTTP Request",
    description: "Composes a request to an endpoint url and maps the response.",
    category: "Web API",
  },
  {
    type: "iframe",
    title: "iFrame",
    description: "Embeds an external web page.",
    category: "UI Automation",
  },
  {
    type: "scenario",
    title: "Scenario Group",
    description: "Runs or groups an imported scenario workflow.",
    category: "Control",
  },
  {
    type: "selectionGroup",
    title: "Group",
    description: "Groups activities into a visual container.",
    category: "Control",
  },
];

const getActivityIcon = (type: ActivityType) => {
  switch (type) {
    case "message":
      return <MessageSquare size={17} />;
    case "setSlot":
      return <SquareFunction size={17} />;
    case "branch":
      return <Split size={17} />;
    case "form":
      return <FormInput size={17} />;
    case "link":
      return <LinkIcon size={17} />;
    case "api":
      return <Globe size={17} />;
    case "iframe":
      return <ExternalLink size={17} />;
    case "scenario":
      return <FileText size={17} />;
    case "selectionGroup":
      return <Layers size={17} />;
    default:
      return <CirclePlus size={17} />;
  }
};

type ActivityPickerModalProps = {
  open: boolean;
  search: string;
  recentTypes: ActivityType[];
  hiddenTypes?: ActivityType[];
  onSearchChange: (value: string) => void;
  onClose: () => void;
  onSelect: (type: ActivityType) => void;
};

export default function ActivityPickerModal({
  open,
  search,
  recentTypes,
  hiddenTypes = [],
  onSearchChange,
  onClose,
  onSelect,
}: ActivityPickerModalProps) {
  const { t } = useTranslation();

  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;

    searchInputRef.current?.focus({ preventScroll: true });
  }, [open]);

  const availableActivities = useMemo(
    () => activityList.filter((item) => !hiddenTypes.includes(item.type)),
    [hiddenTypes],
  );

  const filteredActivities = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    if (!keyword) return availableActivities.slice(0, 4);

    return availableActivities.filter((item) =>
      [item.title, item.description, item.category, item.type]
        .join(" ")
        .toLowerCase()
        .includes(keyword),
    );
  }, [search, availableActivities]);

  const recentActivities = useMemo(
    () =>
      recentTypes
        .map((type) =>
          availableActivities.find((activity) => activity.type === type),
        )
        .filter(Boolean) as ActivityDefinition[],
    [recentTypes],
  );

  if (!open) return null;

  return (
    <Box
      sx={{
        position: "fixed",
        inset: 0,
        zIndex: 1500,
        bgcolor: "rgba(15, 23, 42, 0.18)",
        display: "grid",
        placeItems: "center",
      }}
      onClick={onClose}
    >
      <Box
        sx={{
          width: 750,
          maxWidth: "calc(100vw - 40px)",
          maxHeight: "calc(100vh - 56px)",
          bgcolor: "var(--builder-surface)",
          border: "1px solid #aeb8c2",
          boxShadow: "0 18px 42px rgba(15, 23, 42, 0.2)",
          p: 2.5,
          overflow: "hidden",
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 2 }}>
          <IconButton size="small" aria-label="Close" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </Box>

        <Box
          sx={{
            height: 40,
            border: `2px solid ${uiPathBlue}`,
            display: "flex",
            alignItems: "center",
            px: 1,
            mb: 1,
          }}
        >
          <Search size={17} color="#31556f" />
          <Box
            component="input"
            ref={searchInputRef}
            value={search}
            placeholder={t("Search for an activity")}
            onChange={(event) => onSearchChange(event.target.value)}
            sx={{
              border: 0,
              outline: 0,
              flex: 1,
              height: "100%",
              ml: 1.5,
              fontSize: 16,
              color: "#33424f",
            }}
          />
        </Box>

        <Box sx={{ maxHeight: 222, overflowY: "auto", pr: 0.5 }}>
          {filteredActivities.map((activity) => (
            <Box
              key={activity.type}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(activity.type)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  onSelect(activity.type);
                }
              }}
              sx={{
                minHeight: 60,
                display: "grid",
                gridTemplateColumns: "38px 1fr 150px",
                alignItems: "center",
                columnGap: 1.5,
                borderBottom: `1px solid ${panelBorder}`,
                cursor: "pointer",
                "&:hover": {
                  bgcolor: "#f6f9fc",
                },
              }}
            >
              <Box
                sx={{ color: "#536675", display: "grid", placeItems: "center" }}
              >
                {getActivityIcon(activity.type)}
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography
                  sx={{ fontSize: 14, fontWeight: 700, color: "#4a5661" }}
                >
                  {activity.title}
                </Typography>
                <Typography
                  sx={{
                    fontSize: 12,
                    color: "#54616d",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {activity.description}
                </Typography>
              </Box>
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  justifyContent: "flex-start",
                }}
              >
                <PlugZap size={20} color="#ff4f1f" />
                <Typography
                  sx={{ fontSize: 14, fontWeight: 700, color: "#3c4650" }}
                >
                  {activity.category}
                </Typography>
              </Box>
            </Box>
          ))}
        </Box>

        <Box>
          <Typography
            sx={{
              textAlign: "center",
              fontSize: 14,
              fontWeight: 700,
              color: "#53616d",
              mb: 2,
            }}
          >
            {t("Browse by category")}
          </Typography>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(9, minmax(58px, 1fr))",
              gap: 1.25,
              borderBottom: `1px solid ${panelBorder}`,
              pb: 2,
            }}
          >
            {availableActivities.map((activity) => (
              <Box
                key={activity.type}
                role="button"
                tabIndex={0}
                onClick={() => onSelect(activity.type)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    onSelect(activity.type);
                  }
                }}
                sx={{
                  display: "grid",
                  justifyItems: "center",
                  gap: 0.75,
                  cursor: "pointer",
                  color: "#52616e",
                  "&:hover": {
                    color: uiPathBlue,
                  },
                }}
              >
                <Box
                  sx={{
                    width: 42,
                    height: 40,
                    bgcolor: "#f1f4f7",
                    display: "grid",
                    placeItems: "center",
                    color: uiPathBlue,
                  }}
                >
                  {getActivityIcon(activity.type)}
                </Box>
                <Typography
                  sx={{
                    fontSize: 12,
                    fontWeight: 700,
                    lineHeight: 1.15,
                    textAlign: "center",
                    wordBreak: "break-word",
                  }}
                >
                  {activity.title}
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
