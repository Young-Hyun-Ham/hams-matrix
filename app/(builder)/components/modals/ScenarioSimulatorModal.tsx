"use client";

import { useCallback, useState } from "react";
import {
  Box,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Typography,
} from "@mui/material";
import { Maximize2, Minimize2 } from "lucide-react";
import CloseIcon from "@mui/icons-material/Close";
import ScenarioEmulator, {
  type ScenarioEmulatorProps,
} from "@/app/(builder)/components/emulator/ScenarioEmulator";

type ScenarioSimulatorModalProps = Pick<
  ScenarioEmulatorProps,
  "scenarioKey" | "scenarioTitle" | "scenarioRunId" | "definitionOverride"
> & {
  open: boolean;
  onClose: () => void;
};

export default function ScenarioSimulatorModal({
  open,
  onClose,
  ...emulatorProps
}: ScenarioSimulatorModalProps) {
  const [slots, setSlots] = useState<Record<string, unknown>>({});
  const [isExpanded, setIsExpanded] = useState(false);
  const handleProgress = useCallback<
    NonNullable<ScenarioEmulatorProps["onProgress"]>
  >(({ slotValues }) => setSlots(slotValues), []);
  const handleReset = useCallback(() => setSlots({}), []);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="xl"
      aria-labelledby="scenario-simulator-title"
      slotProps={{
        paper: {
          sx: {
            width: isExpanded ? "calc(100% - 64px)" : 850,
            maxWidth: (theme) =>
              `min(${theme.breakpoints.values.xl}px, calc(100% - 32px))`,
            height: "85dvh",
            maxHeight: "calc(100dvh - 32px)",
            transition: "width 200ms ease",
            "@media (prefers-reduced-motion: reduce)": { transition: "none" },
          },
        },
      }}
    >
      <DialogTitle
        id="scenario-simulator-title"
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 2,
          px: 2,
          py: 0.75,
          minHeight: 48,
          flexShrink: 0,
          position: "relative",
          zIndex: 2,
          boxShadow: "0 3px 10px rgba(15, 23, 42, 0.10)",
        }}
      >
        <Typography component="span" sx={{ flex: 1, fontWeight: 600 }}>
          시나리오 시뮬레이터
          {emulatorProps.scenarioTitle
            ? ` · ${emulatorProps.scenarioTitle}`
            : ""}
        </Typography>
        <IconButton size="small" aria-label="시뮬레이터 닫기" onClick={onClose}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent
        sx={{
          p: 0,
          display: "flex",
          flexDirection: { xs: "column", md: "row" },
          minHeight: 0,
          "&.MuiDialogContent-root": { pt: 0 },
        }}
      >
        <Box
          component="aside"
          aria-label="실행 slot 값"
          sx={{
            width: { xs: "100%", md: 340 },
            flexShrink: 0,
            overflow: "auto",
            maxHeight: { xs: "30%", md: "none" },
            p: 2,
            position: "relative",
            zIndex: 1,
            boxShadow: {
              xs: "0 4px 12px -4px rgba(15, 23, 42, 0.18)",
              md: "4px 0 12px -4px rgba(15, 23, 42, 0.18)",
            },
            bgcolor: "var(--builder-surface)",
          }}
        >
          <Typography
            variant="subtitle1"
            sx={{ fontWeight: 600, ...{ mb: 2 } }}
          >
            실행 slot 값
          </Typography>
          {Object.keys(slots).length === 0 ? (
            <Typography sx={{ color: "text.secondary" }} variant="body2">
              아직 설정된 slot 값이 없습니다.
            </Typography>
          ) : (
            Object.entries(slots).map(([name, value]) => (
              <Box key={name} sx={{ mb: 2 }}>
                <Typography
                  variant="body2"
                  sx={{ fontWeight: 600, ...{ overflowWrap: "anywhere" } }}
                >
                  {name}
                </Typography>
                <Box
                  component="pre"
                  sx={{
                    m: 0,
                    mt: 0.5,
                    p: 1,
                    bgcolor: "background.paper",
                    border: 1,
                    borderColor: "divider",
                    borderRadius: 1,
                    whiteSpace: "pre-wrap",
                    overflowWrap: "anywhere",
                    fontSize: 12,
                  }}
                >
                  {typeof value === "string"
                    ? value
                    : (JSON.stringify(value, null, 2) ?? String(value))}
                </Box>
              </Box>
            ))
          )}
        </Box>
        <Box
          sx={{ flex: 1, minWidth: 0, minHeight: 0, overflow: "auto", p: 2 }}
        >
          {open && (
            <ScenarioEmulator
              {...emulatorProps}
              onProgress={handleProgress}
              onResetRun={handleReset}
              headerActions={
                <IconButton
                  size="small"
                  aria-label={
                    isExpanded ? "시뮬레이터 축소" : "시뮬레이터 확장"
                  }
                  title={isExpanded ? "시뮬레이터 축소" : "시뮬레이터 확장"}
                  aria-pressed={isExpanded}
                  onClick={() => setIsExpanded((expanded) => !expanded)}
                  sx={{ p: 0.25 }}
                >
                  {isExpanded ? (
                    <Minimize2 size={16} />
                  ) : (
                    <Maximize2 size={16} />
                  )}
                </IconButton>
              }
            />
          )}
        </Box>
      </DialogContent>
    </Dialog>
  );
}
