import styles from "./ChatNodes.module.css";
import React, { memo, useLayoutEffect, useState } from "react";
import { Handle, Position, useUpdateNodeInternals } from "reactflow";
import {
  Box,
  Button,
  MenuItem,
  Popover,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useBuilderStore } from "../../store";
import { useModal } from "@/app/(builder)/providers/ModalProvider";
import { useTranslation } from "@/app/(builder)/hooks/useTranslation";
import { useBuilderAppearance } from "../BuilderAppearance";
import appearanceStyles from "../BuilderAppearance.module.css";
import {
  DELAY_UNITS,
  getDelayUnit,
  parseDelayDuration,
  formatDelayDuration,
} from "../../utils/delayDuration";

const DelayNode = ({ id, data, selected }) => {
  const appearance = useBuilderAppearance();
  const isGroupChild = useBuilderStore((state) => {
    const node = state.nodes.find((item) => item.id === id);
    return state.nodes.some(
      (item) => item.id === node?.parentNode && item.type === "selectionGroup",
    );
  });
  const updateNodeInternals = useUpdateNodeInternals();
  const { t } = useTranslation();
  const { showAlert } = useModal();
  const updateNodeData = useBuilderStore((state) => state.updateNodeData);
  const loadingUserData = useBuilderStore((state) => state.loadingUserData);
  const [anchor, setAnchor] = useState(null);
  const [amount, setAmount] = useState("");
  const [unit, setUnit] = useState("S");
  const [touched, setTouched] = useState(false);
  const parsed = parseDelayDuration(amount, unit);
  const unitLabels = { S: t("seconds"), M: t("minutes"), H: t("hours") };
  const errors = {
    digits: t("Enter a value of 9999 or less."),
    positive: t("Enter a number greater than 0."),
    minimum: t("Enter a duration of at least 1 millisecond."),
    maximum: t("Enter a duration of 24.8 days or less."),
  };

  const openEditor = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    const element = event.currentTarget;
    const userInfo = await loadingUserData();
    const node = useBuilderStore
      .getState()
      .nodes.find((item) => item.id === id);
    if (!node || !element.isConnected) return;
    if (userInfo?.unuseNodes?.includes("delay")) {
      showAlert(t("The node does not have modification privileges"));
      return;
    }
    const savedUnit = getDelayUnit(node.data?.durationUnit);
    setAmount(
      String((Number(node.data?.duration) || 0) / DELAY_UNITS[savedUnit]),
    );
    setUnit(savedUnit);
    setTouched(false);
    setAnchor(element);
  };

  const applyDuration = () => {
    setTouched(true);
    if (parsed.error) return;
    const node = useBuilderStore
      .getState()
      .nodes.find((item) => item.id === id);
    if (
      node &&
      (node.data?.duration !== parsed.duration ||
        node.data?.durationUnit !== unit)
    ) {
      updateNodeData(id, { duration: parsed.duration, durationUnit: unit });
    }
    setAnchor(null);
  };

  const inputPos = data?.inputPosition === "top" ? Position.Top : Position.Left;
  const outputPos =
    data?.outputPosition === "bottom" ||
    data?.outputPositions?.["default"] === "bottom"
      ? Position.Bottom
      : Position.Right;

  useLayoutEffect(() => {
    updateNodeInternals(id);
  }, [id, inputPos, outputPos, isGroupChild, updateNodeInternals]);

  const displayTime = formatDelayDuration(
    Number(data?.duration),
    getDelayUnit(data?.durationUnit),
  );

  return (
    <>
      <Box
        className={`${isGroupChild ? styles.groupChildNode : ""} ${appearance ? styles.publishingCompact : ""}`}
        data-node-type="delay"
        onDoubleClick={openEditor}
        title={t("Double-click to edit delay")}
        sx={{
          width: 36,
          height: 36,
          borderRadius: "50%",
          bgcolor: "var(--builder-surface)",
          border: selected ? "2px solid #f59e0b" : "2px solid #d97706",
          boxShadow: selected
            ? "0 0 0 3px rgba(245, 158, 11, 0.25), 0 4px 10px rgba(0,0,0,0.15)"
            : "0 2px 6px rgba(0,0,0,0.12)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          cursor: "pointer",
          transition: "all 0.15s ease",
          "&:hover": {
            transform: "scale(1.1)",
            borderColor: "#f59e0b",
          },
        }}
      >
        {/* Target handle */}
        <Handle
          type="target"
          position={inputPos}
          id={inputPos === Position.Top ? "input-top" : "input"}
          style={{
            width: 8,
            height: 8,
            background: "#d97706",
            border: "1.5px solid #ffffff",
            zIndex: 10,
            ...(inputPos === Position.Top ? { top: -4 } : { left: -4 }),
          }}
        />

        {/* Time Label inside node */}
        <Typography
          variant="caption"
          sx={{
            fontSize: "10px",
            fontWeight: 800,
            color: "#92400e",
            userSelect: "none",
            letterSpacing: "-0.3px",
            lineHeight: 1,
          }}
        >
          {displayTime}
        </Typography>

        {/* Source handle */}
        <Handle
          type="source"
          position={outputPos}
          id={outputPos === Position.Bottom ? "output-bottom" : "default"}
          style={{
            width: 8,
            height: 8,
            background: "#d97706",
            border: "1.5px solid #ffffff",
            zIndex: 10,
            ...(outputPos === Position.Bottom ? { bottom: -4 } : { right: -4 }),
          }}
        />
      </Box>
      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        transformOrigin={{ vertical: "top", horizontal: "center" }}
        disableScrollLock
        slotProps={{
          paper: {
            className: appearance
              ? `${appearanceStyles.surface} ${appearanceStyles.popover}`
              : undefined,
            "data-builder-theme": appearance || undefined,
          },
        }}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.nativeEvent.isComposing) return;
          if (event.target.closest('[role="listbox"]')) return;
          if (
            event.key === "Enter" &&
            event.target.closest('[role="combobox"]')
          )
            return;
          if (event.key === "Escape") {
            event.preventDefault();
            setAnchor(null);
          } else if (
            event.key === "Enter" &&
            event.target.tagName === "INPUT"
          ) {
            event.preventDefault();
            applyDuration();
          }
        }}
      >
        <Box
          className="nodrag nopan nowheel"
          sx={{
            p: 2,
            width: 300,
            maxWidth: "calc(100vw - 32px)",
            boxSizing: "border-box",
          }}
        >
          <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
            {t("Delay Duration")}
          </Typography>
          <Stack sx={{ alignItems: "flex-start" }} direction="row" spacing={1}>
            <TextField
              slotProps={{ htmlInput: { min: 0, max: 9999, step: "any" } }}
              autoFocus
              type="number"
              size="small"
              label={t("Value")}
              value={amount}
              error={touched && Boolean(parsed.error)}
              helperText={
                touched && parsed.error ? errors[parsed.error] : undefined
              }
              onFocus={(event) => event.target.select()}
              onBlur={() => setTouched(true)}
              onChange={(event) => {
                const value = event.target.value;
                if (!/^\d{0,4}(\.\d*)?$/.test(value) || Number(value) > 9999)
                  return;
                setAmount(value);
                setTouched(true);
              }}
              onKeyDown={(event) => {
                if (["e", "E", "+", "-"].includes(event.key))
                  event.preventDefault();
              }}
              sx={{ flex: "0 1 88px", minWidth: 0 }}
            />
            <TextField
              select
              size="small"
              label={t("Unit")}
              value={unit}
              SelectProps={
                appearance
                  ? {
                      MenuProps: {
                        slotProps: {
                          paper: {
                            className: `${appearanceStyles.surface} ${appearanceStyles.popover}`,
                            "data-builder-theme": appearance,
                          },
                        },
                      },
                    }
                  : undefined
              }
              onChange={(event) => setUnit(event.target.value)}
              sx={{ flex: "1 0 156px", minWidth: 0 }}
            >
              {Object.keys(DELAY_UNITS).map((key) => (
                <MenuItem key={key} value={key}>
                  {key} ({unitLabels[key]})
                </MenuItem>
              ))}
            </TextField>
          </Stack>
          <Typography
            variant="caption"
            sx={{ color: "text.secondary", ...{ display: "block", mt: 1 } }}
          >
            {!parsed.error
              ? `${t("Total delay")}: ${amount} ${unitLabels[unit]}`
              : "\u00a0"}
          </Typography>
          <Stack
            direction="row"
            spacing={1}
            sx={{ justifyContent: "flex-end", ...{ mt: 1.5 } }}
          >
            <Button size="small" onClick={() => setAnchor(null)}>
              {t("Cancel")}
            </Button>
            <Button
              size="small"
              variant="contained"
              disabled={Boolean(parsed.error)}
              onClick={applyDuration}
            >
              {t("Apply")}
            </Button>
          </Stack>
        </Box>
      </Popover>
    </>
  );
};

export default memo(DelayNode);
