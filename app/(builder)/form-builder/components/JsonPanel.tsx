import { useState } from "react";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import {
  Box,
  IconButton,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
} from "@mui/material";
import { useTranslation } from "@/app/(builder)/hooks/useTranslation";

type CopyMode = "singleLine" | "original";

type JsonPanelProps = {
  jsonText: string;
  applyJsonText: (text: string) => void;
  jsonError: string | null;
};

function JsonPanel({ jsonText, applyJsonText, jsonError }: JsonPanelProps) {
  const { t } = useTranslation();
  const [copyMode, setCopyMode] = useState<CopyMode>("singleLine");

  const getCopyText = () => {
    if (copyMode === "original") return jsonText;

    try {
      return JSON.stringify(JSON.parse(jsonText));
    } catch {
      return jsonText.replace(/\s+/g, " ").trim();
    }
  };

  const copyJsonText = async () => {
    const copyText = getCopyText();

    if (navigator.clipboard) {
      await navigator.clipboard.writeText(copyText);
      return;
    }

    const textarea = document.createElement("textarea");
    textarea.value = copyText;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
  };

  return (
    <Box
      sx={{
        flex: 1,
        overflow: "hidden",
        p: 3,
        bgcolor: "background.default",
        display: "flex",
        minHeight: 0,
      }}
    >
      <Box
        sx={{
          position: "relative",
          flex: 1,
          minHeight: 0,
        }}
      >
        <Box
          sx={{
            position: "absolute",
            top: 8,
            right: 10,
            zIndex: 1,
            display: "flex",
            alignItems: "center",
            gap: 0.75,
          }}
        >
          <ToggleButtonGroup
            exclusive
            size="small"
            value={copyMode}
            onChange={(_, nextMode: CopyMode | null) => {
              if (nextMode) setCopyMode(nextMode);
            }}
            sx={{
              bgcolor: "background.paper",
              "& .MuiToggleButton-root": {
                px: 1.25,
                py: 0.4,
                fontSize: 12,
              },
            }}
          >
            <ToggleButton value="singleLine">
              {t("a line of copy")}
            </ToggleButton>
            <ToggleButton value="original">{t("original copy")}</ToggleButton>
          </ToggleButtonGroup>

          <Tooltip title={t("Copy JSON")}>
            <IconButton
              aria-label="Copy JSON"
              size="small"
              onClick={copyJsonText}
              sx={{
                bgcolor: "background.paper",
                border: 1,
                borderColor: "divider",
                "&:hover": {
                  bgcolor: "action.hover",
                },
              }}
            >
              <ContentCopyIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>

        <TextField
          value={jsonText}
          onChange={(event) => applyJsonText(event.target.value)}
          multiline
          fullWidth
          error={Boolean(jsonError)}
          helperText={
            jsonError ||
            t(
              "If it is a valid JSON, it will immediately be reflected in the preview status",
            )
          }
          sx={{
            flex: 1,
            minHeight: 0,
            height: "100%",
            "& .MuiInputBase-root": {
              height: "calc(100% - 28px)",
              alignItems: "flex-start",
              bgcolor: "background.paper",
              fontFamily: "monospace",
              fontSize: 12,
              pt: 5,
            },
            "& textarea": {
              height: "100% !important",
              overflow: "auto !important",
              whiteSpace: "pre",
            },
          }}
        />
      </Box>
    </Box>
  );
}

export default JsonPanel;
