"use client";

import { Box, ButtonBase } from "@mui/material";
import { Check } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "@/app/(builder)/hooks/useTranslation";

type Props = {
  versions: number[];
  deployedVersionId?: number | null;
  selectedVersionId?: number | null;
  onSelectVersion: (versionId: number) => void;
};

export default function VersionsTree({
  versions,
  deployedVersionId,
  selectedVersionId,
  onSelectVersion,
}: Props) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(true);

  return (
    <Box>
      <ButtonBase
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
        sx={{
          width: "100%",
          px: 1,
          py: 1.2,
          fontWeight: 700,
          justifyContent: "space-between",
          bgcolor: "var(--builder-muted-surface)",
          color: "var(--builder-text)",
        }}
      >
        {t("Default")}
        <Box component="span" aria-hidden="true" sx={{ fontSize: 12 }}>
          {isOpen ? "▾" : "▸"}
        </Box>
      </ButtonBase>
      {isOpen && (
        <Box sx={{ p: 1, display: "grid", gap: 1 }}>
          {versions.length === 0 && (
            <Box sx={{ fontSize: 12, color: "var(--builder-muted)", px: 1 }}>
              {t("No items")}
            </Box>
          )}
          {versions.map((versionId) => {
            const isSelected = selectedVersionId === versionId;
            return (
              <ButtonBase
                key={versionId}
                aria-pressed={isSelected}
                onClick={() => onSelectVersion(versionId)}
                sx={{
                  justifyContent: "flex-start",
                  gap: 0.75,
                  px: 1,
                  py: 1,
                  fontSize: 14,
                  color: "var(--builder-text)",
                  bgcolor: isSelected
                    ? "var(--builder-accent-soft)"
                    : "var(--builder-canvas)",
                  borderRadius: 2,
                  border: "1px solid",
                  borderColor: isSelected
                    ? "var(--builder-accent)"
                    : "var(--builder-border)",
                  "&:hover, &.Mui-focusVisible": {
                    bgcolor: "var(--builder-accent-soft)",
                    borderColor: "var(--builder-accent)",
                  },
                }}
              >
                <Box
                  component="span"
                  sx={{
                    width: 16,
                    flexShrink: 0,
                    display: "flex",
                    color: "var(--builder-accent)",
                  }}
                >
                  {deployedVersionId === versionId && (
                    <Check size={16} role="img" aria-label={t("Deployed")} />
                  )}
                </Box>
                {versionId}
              </ButtonBase>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
