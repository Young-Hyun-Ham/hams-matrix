import { forwardRef } from "react";
import { Box, Chip, MenuItem, Select, SelectProps } from "@mui/material";
import { Typography } from "@mui/material";
import { lighten, SxProps } from "@mui/system";

import type { Theme } from "@mui/material/styles";
import { COLORS } from "@/app/(builder)/constants/color";

export interface SelectWithLabelOption {
  label: string;
  value: string;
  code?: string;
}
export interface SelectWithLabelProps extends Omit<SelectProps, "size"> {
  label: string;
  size?: "small" | "medium";
  options: SelectWithLabelOption[];
  sx?: SxProps<Theme>;
}

const SelectWithLabel = forwardRef<HTMLDivElement, SelectWithLabelProps>(
  function SelectWithLabel(
    { label, size = "medium", options, sx, ...props },
    ref,
  ) {
    const renderCodePill = (code?: string) =>
      code ? (
        <Chip
          label={code}
          size="small"
          sx={{
            height: size === "small" ? 16 : 24,
            borderRadius: 9999,
            px: 1,
            fontWeight: 400,
            fontSize: size === "small" ? "12px" : "13px",
            bgcolor: (t) => lighten(t.palette.info.light, 0.35),
            color: (t) => t.palette.getContrastText(t.palette.info.light),
          }}
        />
      ) : null;

    const renderValue =
      props.renderValue ??
      ((selected: unknown) => {
        const v = String(selected ?? "");
        const opt = options.find((o) => o.value === v);
        if (!opt) return null;
        return (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            {renderCodePill(opt.code)}
            <Box component="span">{opt.label}</Box>
          </Box>
        );
      });
    return (
      <Box sx={{ display: "flex", flexDirection: "column" }}>
        <Typography
          sx={{
            color: "text.primary",
            lineHeight: size === "small" ? 1 : 1.3,
            fontWeight: size === "small" ? 400 : 500,
            m: "2px",
          }}
          id={props.id ? `${props.id}-label` : undefined}
          variant="caption"
        >
          {label}
          {props.required && (
            <span
              style={{
                marginLeft: "2px",
                color: "#D32F2F",
              }}
            >
              *
            </span>
          )}
        </Typography>
        <Select
          {...props}
          ref={ref}
          labelId={props.id ? `${props.id}-label` : undefined}
          aria-labelledby={props.id ? `${props.id}-label` : undefined}
          renderValue={renderValue}
          MenuProps={{
            disablePortal: false,
            anchorOrigin: {
              vertical: "bottom",
              horizontal: "left",
            },
            transformOrigin: {
              vertical: "top",
              horizontal: "left",
            },
            ...props.MenuProps,
            slotProps: {
              paper: {
                sx: {
                  maxHeight: 350,
                  maxWidth: 400,
                  marginTop: "4px",
                  "& .MuiList-root": {
                    paddingTop: 0,
                    paddingBottom: 0,
                  },
                  ...((props.MenuProps?.slotProps?.paper as any)?.sx ?? {}),
                },
              },
            },
          }}
          sx={{
            height: size === "small" ? 24 : 36,
            ".MuiOutlinedInput-input": {
              height: "100%",
              display: "flex",
              alignItems: "center",
              padding: size === "small" ? "0 8px" : "0 12px",
              fontSize: size === "small" ? "12px" : "13px",
            },
            ...(sx as SxProps),
          }}
        >
          {options.map((option) => (
            <MenuItem
              key={option.value}
              value={option.value}
              sx={{
                fontSize: 13,
                lineHeight: 1.3,
                fontWeight: 400,
                p: 1,
                gap: 2,
                "&.Mui-selected": {
                  backgroundColor: COLORS.text.states.selected,
                },
                "&:hover": {
                  backgroundColor: COLORS.text.states.hover,
                },
              }}
            >
              {option.code && renderCodePill(option.code)}
              {option.label}
            </MenuItem>
          ))}
        </Select>
      </Box>
    );
  },
);

export default SelectWithLabel;
