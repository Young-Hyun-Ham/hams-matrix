import { forwardRef, MouseEventHandler } from "react";
import { Box, TextField, TextFieldProps } from "@mui/material";
import { Typography } from "@mui/material";
import { SxProps } from "@mui/system";

import type { Theme } from "@mui/material/styles";

export interface InputWithLabelProps extends Omit<TextFieldProps, "size"> {
  label?: string;
  size?: "small" | "medium";
  noLabel?: boolean;
  sx?: SxProps<Theme>;
  maxLengthInput?: number;
  fullHeight?: boolean;
  onClick?: MouseEventHandler<HTMLDivElement>;
}

const InputWithLabel = forwardRef<HTMLInputElement, InputWithLabelProps>(
  function InputWithLabel(
    {
      label,
      size = "medium",
      noLabel,
      sx,
      maxLengthInput,
      fullHeight,
      ...props
    },
    ref,
  ) {
    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          width: props.fullWidth ? "100%" : "fit-content",
          height: fullHeight ? "100%" : "auto",
          ...{
            ...(fullHeight && {
              flex: 1,
              minHeight: 0,
            }),
          },
        }}
      >
        {!noLabel && (
          <Typography
            sx={{
              color: "text.primary",
              lineHeight: size === "small" ? 1 : 1.3,
              fontWeight: size === "small" ? 400 : 500,
              m: "2px",
            }}
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
        )}
        <TextField
          variant="outlined"
          inputRef={ref}
          {...props}
          slotProps={{
            ...props.slotProps,
            htmlInput: {
              ...props.slotProps?.htmlInput,
              maxLength: maxLengthInput ?? undefined,
            },
          }}
          sx={{
            height: fullHeight
              ? "100%"
              : props.multiline
                ? "auto"
                : size === "small"
                  ? 24
                  : 36,
            ...(fullHeight && {
              flex: 1,
              minHeight: 0,
            }),
            "& .MuiOutlinedInput-root": {
              height: "100%",
              display: "flex",
              alignItems: props.multiline ? "stretch" : "center",
              padding: props.multiline ? "8px 12px" : "0px",
              fontSize: size === "small" ? "12px" : "13px",
              backgroundColor: props.disabled
                ? "action.disabledBackground"
                : "background.paper",
              color: "text.primary",
            },
            "& .MuiOutlinedInput-input": {
              padding: props.multiline ? "0px" : "0px 12px",
              height: props.multiline ? "100% !important" : "auto",
            },
            "& .MuiOutlinedInput-root.Mui-disabled .MuiOutlinedInput-notchedOutline":
              {
                borderColor: "divider",
              },
            ...(sx as SxProps),
          }}
        />
      </Box>
    );
  },
);

export default InputWithLabel;
