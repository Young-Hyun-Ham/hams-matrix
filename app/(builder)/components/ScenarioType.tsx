import {
  Box,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { Layers, Square, Workflow } from "lucide-react";
import { useTranslation } from "@/app/(builder)/hooks/useTranslation";
import type { ScenarioType } from "../types/types";
import { getScenarioType, SCENARIO_TYPE_OPTIONS } from "../utils/scenarioTypes";

const ICONS = { agent: Square, multi: Layers, sub: Workflow };

export function ScenarioTypeBadge({
  scenario,
}: {
  scenario?: { scenario_type?: unknown; kind?: unknown; type?: unknown };
}) {
  const type = getScenarioType(scenario);
  const Icon = ICONS[type];
  const label = SCENARIO_TYPE_OPTIONS.find(
    (option) => option.value === type,
  )!.label;
  return (
    <Box
      component="span"
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: 0.5,
        px: 0.75,
        py: 0.25,
        border: "1px solid",
        borderColor: "divider",
        borderRadius: "4px",
        color: "text.secondary",
        fontSize: 10,
        lineHeight: 1.4,
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      <Icon size={11} aria-hidden="true" />
      {label}
    </Box>
  );
}

export function ScenarioTypeSelector({
  value,
  onChange,
}: {
  value?: ScenarioType;
  onChange: (value: ScenarioType) => void;
}) {
  const { t } = useTranslation();
  return (
    <Box>
      <Typography sx={{ fontSize: 12, fontWeight: 500, mb: 1 }}>
        {t("Scenario type")}
      </Typography>
      <ToggleButtonGroup
        exclusive
        value={value || "sub"}
        aria-label={t("Scenario type")}
        onChange={(_, next: ScenarioType | null) => {
          if (next) onChange(next);
        }}
        sx={{
          display: "flex",
          gap: 1,
          "& .MuiToggleButtonGroup-grouped": {
            flex: 1,
            minWidth: 0,
            height: 44,
            gap: 0.75,
            border: "1px solid",
            borderColor: "divider",
            borderRadius: "6px !important",
            textTransform: "none",
            color: "text.secondary",
            fontSize: 12,
          },
          "& .MuiToggleButton-root.Mui-selected, & .MuiToggleButton-root.Mui-selected:hover":
            {
              bgcolor: "action.selected",
              borderColor: "primary.main",
              color: "primary.main",
            },
        }}
      >
        {SCENARIO_TYPE_OPTIONS.map((option) => {
          const Icon = ICONS[option.value];
          return (
            <ToggleButton
              key={option.value}
              value={option.value}
              aria-label={option.label}
            >
              <Icon size={16} />
              {option.label}
            </ToggleButton>
          );
        })}
      </ToggleButtonGroup>
    </Box>
  );
}
