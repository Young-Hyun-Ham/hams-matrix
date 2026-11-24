import {
  Typography,
  Box,
  TextField,
  Paper,
  Chip,
  Stack,
  FormControlLabel,
  Checkbox,
  Radio,
  FormControl,
  FormHelperText,
  Select,
  MenuItem,
  Divider,
  ListItemText,
  Tooltip,
  IconButton,
} from "@mui/material";
import { Search as SearchIcon } from "@mui/icons-material";
import HelpOutlineIcon from "@mui/icons-material/HelpOutlineOutlined";
import { useTranslation } from "@/app/(builder)/hooks/useTranslation";
import { useState } from "react";

import { FormElement } from "../type";
import { toLocaleTimeValue } from "../../utils/util";

function ElementPreview({
  element,
  onElementEvent,
}: {
  element: FormElement;
  onElementEvent?: (element: FormElement, value?: unknown) => void;
}) {
  const { t } = useTranslation();
  const initialValue =
    element.type === "date"
      ? element.value || element.defaultValue
      : "defaultValue" in element
        ? (element.defaultValue ?? "")
        : "";
  const [value, setValue] = useState<unknown>(initialValue);
  const [fromDateValue, setFromDateValue] = useState<unknown>(
    element.type === "date"
      ? element.hasFromTo
        ? element.fromDateValue ||
          element.defaultFromValue ||
          element.defaultValue
        : element.dateValue || element.defaultValue
      : "",
  );
  const [toDateValue, setToDateValue] = useState<unknown>(
    element.type === "date"
      ? element.toDateValue || element.defaultToValue || ""
      : "",
  );
  const [fromTimeValue, setFromTimeValue] = useState<unknown>(
    element.type === "date"
      ? element.fromTimeValue ||
          element.defaultFromTimeValue ||
          element.defaultTimeValue
      : "",
  );
  const [toTimeValue, setToTimeValue] = useState<unknown>(
    element.type === "date"
      ? element.toTimeValue ||
          element.defaultToTimeValue ||
          element.defaultTimeValue
      : "",
  );
  const [touched, setTouched] = useState(false);

  const isEmpty = (currentValue: unknown) =>
    Array.isArray(currentValue)
      ? currentValue.length === 0
      : String(currentValue ?? "").trim() === "";

  const getErrorMessage = (currentValue: unknown) => {
    if (element.requires && isEmpty(currentValue)) {
      return t("This field is required.");
    }

    if (element.type !== "input" || isEmpty(currentValue)) return "";

    const textValue = String(currentValue);

    if (
      element.validation.type === "email" &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(textValue)
    ) {
      return t("Please enter a valid email address.");
    }

    if (
      element.validation.type === "number" &&
      !Number.isFinite(Number(textValue))
    ) {
      return t("Please enter a valid number.");
    }

    // minLength, maxLength validation
    if (element.minLength && textValue.length < Number(element.minLength)) {
      return t("Please enter at least {{minLength}} characters.", {
        minLength: element.minLength,
      });
    }
    if (element.maxLength && textValue.length > Number(element.maxLength)) {
      return t("Please enter no more than {{maxLength}} characters.", {
        maxLength: element.maxLength,
      });
    }

    // regex validation
    if (element.validation.type === "custom" && element.regex) {
      const regex = new RegExp(element.regex);
      if (!regex.test(textValue)) {
        return t("Please enter a valid value.");
      }
    }

    return "";
  };

  const updatePreviewValue = (nextValue: unknown) => {
    const textValue = String(nextValue ?? "");
    // transformTextType validation
    if (element.type === "input") {
      if (element.transformTextType === "uppercase") {
        nextValue = textValue.toUpperCase();
      }
      if (element.transformTextType === "lowercase") {
        nextValue = textValue.toLowerCase();
      }
      if (element.transformTextType === "capitalize") {
        nextValue = textValue.replace(
          /\w\S*/g,
          (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase(),
        );
      }
    }

    setValue(nextValue);
    setTouched(true);
    onElementEvent?.(element, nextValue);
  };

  const addDaysToDateString = (dateString: string, days: number): string => {
    const [year, month, day] = dateString.split("-").map(Number);

    const date = new Date(Date.UTC(year, month - 1, day));
    date.setUTCDate(date.getUTCDate() + days);

    return date.toISOString().slice(0, 10);
  };

  const updatePreviewValueOptions = (
    nextValue: string,
    options: {
      flag?: "from" | "to" | "";
      type?: "date" | "time" | "";
    },
  ) => {
    if (element.type !== "date") return;

    let nextFromDateValue = String(fromDateValue ?? "");
    let nextToDateValue = String(toDateValue ?? "");
    let nextFromTimeValue = String(fromTimeValue ?? "");
    let nextToTimeValue = String(toTimeValue ?? "");

    if (options?.flag === "from") {
      if (options?.type === "date") {
        nextFromDateValue = nextValue;
        setFromDateValue(nextValue);
        if (element.defaultToDateOffset && element.defaultToDateOffset > 0) {
          nextToDateValue = addDaysToDateString(
            nextValue,
            element.defaultToDateOffset,
          );
          setToDateValue(nextToDateValue);
        }
      } else if (options?.type === "time") {
        nextFromTimeValue = nextValue;
        setFromTimeValue(nextValue);
      }
    } else if (options?.flag === "to") {
      if (options?.type === "date") {
        nextToDateValue = nextValue;
        setToDateValue(nextValue);
      } else if (options?.type === "time") {
        nextToTimeValue = nextValue;
        setToTimeValue(nextValue);
      }
    } else {
      nextFromDateValue = "";
      nextToDateValue = "";
      nextFromTimeValue = "";
      nextToTimeValue = "";
      setFromDateValue("");
      setToDateValue("");
      setFromTimeValue("");
      setToTimeValue("");
    }
    setTouched(true);
    onElementEvent?.(
      {
        ...element,
        dateValue: element.hasFromTo ? element.dateValue : nextFromDateValue,
        value: element.hasFromTo
          ? element.value
          : toLocaleTimeValue(
              nextFromDateValue,
              nextFromTimeValue,
              element.hasTime,
              element.locale,
            ),
        fromValue: element.hasFromTo
          ? toLocaleTimeValue(
              nextFromDateValue,
              nextFromTimeValue,
              element.hasTime,
              element.locale,
            )
          : undefined,
        toValue: element.hasFromTo
          ? toLocaleTimeValue(
              nextToDateValue,
              nextToTimeValue,
              element.hasTime,
              element.locale,
            )
          : undefined,
        timeValue: element.hasFromTo ? element.timeValue : nextFromTimeValue,
        fromDateValue: nextFromDateValue,
        toDateValue: nextToDateValue,
        fromTimeValue: nextFromTimeValue,
        toTimeValue: nextToTimeValue,
      },
      nextValue,
    );
  };

  const errorMessage = touched ? getErrorMessage(value) : "";
  const normalizeOption = (
    option: string | { value: string; label: string; param?: string },
  ) => (typeof option === "string" ? { value: option, label: option } : option);

  const createOptionParams = (selectedValues: string[]) =>
    "options" in element
      ? Object.fromEntries(
          element.options.map((item) => {
            const option = normalizeOption(item);
            return [
              option.param?.trim() || option.value,
              selectedValues.includes(option.value) ? "Y" : "N",
            ];
          }),
        )
      : {};

  switch (element.type) {
    case "input":
      return (
        <TextField
          fullWidth
          size="small"
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => updatePreviewValue(event.target.value)}
          onBlur={() => setTouched(true)}
          placeholder={element.placeholder}
          value={String(value ?? "")}
          error={Boolean(errorMessage)}
          helperText={errorMessage}
        />
      );
    case "date":
      return (
        <Stack
          direction="row"
          spacing={1}
          useFlexGap
          sx={{
            width: "100%",
            minWidth: 0,
            flexWrap: "wrap",
          }}
        >
          {element.hasFromTo ? (
            <Stack
              direction="row"
              spacing={1}
              sx={{ flex: "1 1 260px", minWidth: 0 }}
            >
              <TextField
                size="small"
                type="date"
                onClick={(event) => event.stopPropagation()}
                onChange={(event) =>
                  updatePreviewValueOptions(event.target.value, {
                    flag: "from",
                    type: "date",
                  })
                }
                onBlur={() => setTouched(true)}
                value={String(fromDateValue ?? "")}
                error={Boolean(errorMessage)}
                helperText={errorMessage}
                sx={{ flex: "1 1 140px", minWidth: 0 }}
              />
              {element.hasTime ? (
                <TextField
                  slotProps={{ htmlInput: { step: 60 } }}
                  size="small"
                  type="time"
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) =>
                    updatePreviewValueOptions(event.target.value, {
                      flag: "from",
                      type: "time",
                    })
                  }
                  value={fromTimeValue}
                  sx={{ flex: "1 1 140px", minWidth: 0 }}
                />
              ) : null}
              <TextField
                size="small"
                type="date"
                onClick={(event) => event.stopPropagation()}
                onChange={(event) =>
                  updatePreviewValueOptions(event.target.value, {
                    flag: "to",
                    type: "date",
                  })
                }
                onBlur={() => setTouched(true)}
                value={String(toDateValue ?? "")}
                error={Boolean(errorMessage)}
                helperText={errorMessage}
                sx={{ flex: "1 1 140px", minWidth: 0 }}
              />
              {element.hasTime ? (
                <TextField
                  slotProps={{ htmlInput: { step: 60 } }}
                  size="small"
                  type="time"
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) =>
                    updatePreviewValueOptions(event.target.value, {
                      flag: "to",
                      type: "time",
                    })
                  }
                  value={toTimeValue}
                  sx={{ flex: "1 1 140px", minWidth: 0 }}
                />
              ) : null}
            </Stack>
          ) : (
            <Stack
              direction="row"
              spacing={1}
              sx={{ flex: "1 1 260px", minWidth: 0 }}
            >
              <TextField
                fullWidth
                size="small"
                type="date"
                onClick={(event) => event.stopPropagation()}
                onChange={(event) =>
                  updatePreviewValueOptions(event.target.value, {
                    flag: "from",
                    type: "date",
                  })
                }
                onBlur={() => setTouched(true)}
                value={String(fromDateValue ?? "")}
                error={Boolean(errorMessage)}
                helperText={errorMessage}
              />
              {element.hasTime ? (
                <TextField
                  slotProps={{ htmlInput: { step: 60 } }}
                  size="small"
                  type="time"
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) =>
                    updatePreviewValueOptions(event.target.value, {
                      flag: "from",
                      type: "time",
                    })
                  }
                  value={fromTimeValue}
                  sx={{ minWidth: 130 }}
                />
              ) : null}
            </Stack>
          )}
        </Stack>
      );
    case "checkbox":
      return (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns:
              element.optionLayout === "horizontal"
                ? `repeat(${Math.max(1, element.optionsPerRow ?? 2)}, minmax(0, 1fr))`
                : "minmax(0, 1fr)",
            columnGap: 1,
            rowGap: 0.5,
          }}
        >
          {element.options.map((item) => {
            const option = normalizeOption(item);
            const selectedValues = Array.isArray(value) ? value : [];

            return (
              <FormControlLabel
                key={option.value}
                control={
                  <Checkbox
                    size="small"
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) => {
                      const nextSelectedValues = event.target.checked
                        ? [...selectedValues, option.value]
                        : selectedValues.filter(
                            (itemValue) => itemValue !== option.value,
                          );
                      setValue(nextSelectedValues);
                      setTouched(true);
                      onElementEvent?.(
                        element,
                        element.sendByOption
                          ? createOptionParams(nextSelectedValues)
                          : nextSelectedValues,
                      );
                    }}
                    checked={selectedValues.includes(option.value)}
                  />
                }
                label={<Typography variant="body2">{option.label}</Typography>}
              />
            );
          })}
          {errorMessage ? (
            <FormHelperText error sx={{ gridColumn: "1 / -1" }}>
              {errorMessage}
            </FormHelperText>
          ) : null}
        </Box>
      );
    case "radio":
      return (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns:
              element.optionLayout === "horizontal"
                ? `repeat(${Math.max(1, element.optionsPerRow ?? 2)}, minmax(0, 1fr))`
                : "minmax(0, 1fr)",
            columnGap: 1,
            rowGap: 0.5,
          }}
        >
          {element.options.map((item) => {
            const option = normalizeOption(item);

            return (
              <FormControlLabel
                key={option.value}
                control={
                  <Radio
                    size="small"
                    onClick={(event) => {
                      event.stopPropagation();
                      const nextValue =
                        element.allowDeselection && value === option.value
                          ? ""
                          : option.value;
                      setValue(nextValue);
                      setTouched(true);
                      onElementEvent?.(
                        element,
                        element.sendByOption
                          ? createOptionParams(nextValue ? [nextValue] : [])
                          : nextValue,
                      );
                    }}
                    checked={value === option.value}
                  />
                }
                label={<Typography variant="body2">{option.label}</Typography>}
              />
            );
          })}
          {errorMessage ? (
            <FormHelperText error sx={{ gridColumn: "1 / -1" }}>
              {errorMessage}
            </FormHelperText>
          ) : null}
        </Box>
      );
    case "dropbox": {
      const options = element.options.map(normalizeOption);
      const isMultiSelect = element.selectKind === "multi";
      const selectedValues = Array.isArray(value)
        ? value
        : value
          ? [String(value)]
          : [];
      const optionLabels = new Map(
        options.map((option) => [option.value, option.label]),
      );

      return (
        <Stack spacing={0.75}>
          <FormControl fullWidth size="small" error={Boolean(errorMessage)}>
            <Select
              multiple={isMultiSelect}
              value={isMultiSelect ? selectedValues : (selectedValues[0] ?? "")}
              displayEmpty
              onClick={(event) => event.stopPropagation()}
              onChange={(event) => updatePreviewValue(event.target.value)}
              renderValue={(selected) => {
                const values = Array.isArray(selected)
                  ? selected
                  : selected
                    ? [String(selected)]
                    : [];

                if (!values.length) return <em>{t("Select option")}</em>;

                if (!isMultiSelect) {
                  return optionLabels.get(values[0]) ?? values[0];
                }

                return (
                  <Box
                    sx={{
                      display: "flex",
                      flexWrap: "nowrap",
                      gap: 0.5,
                      minWidth: 0,
                      overflow: "hidden",
                    }}
                  >
                    {values.slice(0, 3).map((value) => (
                      <Chip
                        key={value}
                        size="small"
                        label={optionLabels.get(value) ?? value}
                        sx={{
                          flexShrink: 1,
                          minWidth: 0,
                          "& .MuiChip-label": {
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          },
                        }}
                      />
                    ))}
                    {values.length > 3 ? (
                      <Typography
                        variant="caption"
                        sx={{ alignSelf: "center" }}
                      >
                        +{values.length - 3}
                      </Typography>
                    ) : null}
                  </Box>
                );
              }}
            >
              {!isMultiSelect ? (
                <MenuItem value="">
                  <em>{t("Select option")}</em>
                </MenuItem>
              ) : null}
              {options.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {isMultiSelect ? (
                    <Checkbox
                      size="small"
                      checked={selectedValues.includes(option.value)}
                    />
                  ) : null}
                  <ListItemText
                    slotProps={{
                      primary: {
                        noWrap: true,
                        title: option.label,
                      },
                    }}
                    primary={option.label}
                  />
                </MenuItem>
              ))}
            </Select>
            {errorMessage ? (
              <FormHelperText>{errorMessage}</FormHelperText>
            ) : null}
          </FormControl>

          {/* 동적 옵션 목록  */}
          <Box
            sx={{
              border: 1,
              borderColor: "divider",
              borderRadius: 0.75,
              px: 1,
              py: 0.75,
            }}
          >
            {options.map((option) => (
              <Box
                key={option.value}
                sx={{
                  display: "grid",
                  gridTemplateColumns: "24px minmax(0, 1fr)",
                  columnGap: 1,
                  alignItems: "center",
                  minHeight: 24,
                }}
              >
                <Checkbox
                  size="small"
                  checked={selectedValues.includes(option.value)}
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) => {
                    if (!isMultiSelect) {
                      updatePreviewValue(
                        event.target.checked ? option.value : "",
                      );
                      return;
                    }

                    updatePreviewValue(
                      event.target.checked
                        ? [...selectedValues, option.value]
                        : selectedValues.filter(
                            (selectedValue) => selectedValue !== option.value,
                          ),
                    );
                  }}
                  sx={{ p: 0 }}
                />
                <Typography
                  variant="body2"
                  title={option.label}
                  noWrap
                  sx={{ minWidth: 0 }}
                >
                  {option.label}
                </Typography>
              </Box>
            ))}
          </Box>
        </Stack>
      );
    }
    case "search":
      return (
        <Box
          sx={{
            bgcolor: "#ddd",
            borderRadius: 1,
            px: 2.5,
            py: 2,
            textAlign: "center",
          }}
        >
          <Typography
            variant="subtitle1"
            sx={{ fontWeight: 700, ...{ color: "#2d4558", mb: 1 } }}
          >
            {element.label || "(No label)"}
          </Typography>

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) auto",
              alignItems: "center",
              gap: 2,
            }}
          >
            <TextField
              fullWidth
              size="small"
              onClick={(event) => event.stopPropagation()}
              onChange={(event) => updatePreviewValue(event.target.value)}
              onBlur={() => setTouched(true)}
              placeholder={element.placeholder}
              value={String(value ?? "")}
              error={Boolean(errorMessage)}
              helperText={errorMessage}
              sx={{
                "& .MuiInputBase-root": {
                  bgcolor: "background.paper",
                  borderRadius: 0.75,
                  fontSize: 22,
                },
                "& .MuiInputBase-input": {
                  py: 1,
                },
              }}
            />
            <SearchIcon
              sx={{
                color: "#1f7fd1",
                fontSize: 36,
                filter: "drop-shadow(3px 3px 0 #7b4f96)",
              }}
            />
          </Box>

          <Typography
            variant="body2"
            sx={{
              fontStyle: "italic",
              ...{ mt: 0.75, color: "#006cff", fontSize: 16 },
            }}
          >
            {t("Result Slot")}:{" "}
            {`{${element.resultSlot || "(No result slot)"}}`}
          </Typography>
        </Box>
      );
    case "grid":
      return (
        <>
          {element.selectable && (
            <Typography
              variant="caption"
              sx={{
                color: "primary.main",
                ...{ mb: 0.5, display: "block", fontWeight: 600 },
              }}
            >
              [{t("Selectable Enabled")}]
            </Typography>
          )}
          {element.hasHeader && (
            <Typography
              variant="caption"
              sx={{
                color: "secondary.main",
                ...{ mb: 0.5, display: "block", fontWeight: 600 },
              }}
            >
              [{t("Header Row Enabled")}]
            </Typography>
          )}
          {element.optionsSlot ? (
            // 바인딩 된 데이터
            <>
              <Box sx={{ mb: 1, color: "text.secondary" }}>
                {t("Bound to")} :{" "}
                {`{${element.optionsSlot || "(No data slot)"}}`}
              </Box>

              <Divider />

              <Box sx={{ mb: 1, color: "text.secondary" }}>
                {t("Columns Count")} : {element.displayKeys.length}
                {element.displayKeys.length ? (
                  <>
                    <Box
                      sx={{
                        display: "grid",
                        gridTemplateColumns: `${element.selectable ? "30px " : ""}repeat(${element.displayKeys.length}, minmax(0, 1fr))`,
                        gap: 0.75,
                      }}
                    >
                      {element.selectable && (
                        <Box
                          sx={{
                            minHeight: 34,
                            border: 1,
                            borderColor: "divider",
                            borderRadius: 0.75,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            bgcolor: "var(--builder-surface)",
                          }}
                        >
                          <Checkbox
                            size="small"
                            disabled
                            readOnly
                            sx={{ p: 0 }}
                          />
                        </Box>
                      )}
                      {element.displayKeys.map((item, index) => (
                        <Box
                          key={index}
                          sx={{
                            minHeight: 34,
                            border: 1,
                            borderColor: "divider",
                            borderRadius: 0.75,
                            px: 1,
                            display: "flex",
                            alignItems: "center",
                            color: "text.primary",
                            bgcolor: "var(--builder-surface)",
                            fontSize: 13,
                          }}
                        >
                          {item.label}
                        </Box>
                      ))}
                      {element.selectable && (
                        <Box
                          sx={{
                            minHeight: 34,
                            border: 1,
                            borderColor: "divider",
                            borderRadius: 0.75,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            bgcolor: "var(--builder-surface)",
                          }}
                        >
                          <Checkbox
                            size="small"
                            disabled
                            readOnly
                            sx={{ p: 0 }}
                          />
                        </Box>
                      )}
                      {element.displayKeys.map((item, index) => (
                        <Box
                          key={index}
                          sx={{
                            minHeight: 34,
                            border: 1,
                            borderColor: "divider",
                            borderRadius: 0.75,
                            px: 1,
                            display: "flex",
                            alignItems: "center",
                            color: "text.disabled",
                            bgcolor: "var(--builder-surface)",
                            fontSize: 13,
                          }}
                        >
                          {/* {item.label} ({item.key}) */}
                          {`${element.optionsSlot}[0].${item.key}`}
                        </Box>
                      ))}
                    </Box>
                  </>
                ) : (
                  t("(No display value)")
                )}
              </Box>
            </>
          ) : (
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: `repeat(${element.columns}, minmax(0, 1fr))`,
                gap: 0.75,
              }}
            >
              {element.data.map((cell, index) => (
                <Box
                  key={index}
                  sx={{
                    minHeight: 34,
                    border: 1,
                    borderColor: "divider",
                    borderRadius: 0.75,
                    px: 1,
                    display: "flex",
                    alignItems: "center",
                    color: cell ? "text.primary" : "text.disabled",
                    bgcolor: "var(--builder-surface)",
                    fontSize: 13,
                  }}
                >
                  {cell || `Cell ${index + 1}`}
                </Box>
              ))}
            </Box>
          )}
        </>
      );
    default:
      return null;
  }
}

function CanvasElement({
  element,
  selected,
  onSelect,
  onElementEvent,
}: {
  element: FormElement;
  selected: boolean;
  onSelect: (event: React.MouseEvent<HTMLDivElement>) => void;
  onElementEvent?: (element: FormElement, value?: unknown) => void;
}) {
  return (
    <Paper
      variant="outlined"
      onClick={(event) => {
        onSelect(event);
        onElementEvent?.(element);
      }}
      sx={{
        p: 1.5,
        position: "relative",
        cursor: "pointer",
        transition: "all 0.2s",
        borderWidth: 2,
        borderStyle: selected ? "solid" : "dashed",
        borderColor: selected ? "primary.main" : "divider",
        bgcolor: selected ? "primary.50" : "background.paper",
        "&:hover": {
          borderColor: selected ? "primary.main" : "primary.light",
        },
      }}
    >
      <Chip
        label={element.type.toUpperCase()}
        size="small"
        sx={{
          position: "absolute",
          top: -10,
          left: 10,
          height: 20,
          fontSize: 10,
          fontWeight: 700,
          bgcolor: "background.paper",
          color: "primary.main",
        }}
      />

      {element.type !== "search" ? (
        <Stack sx={{ alignItems: "center" }} spacing={1} direction="row">
          <Typography
            variant="body2"
            sx={{ fontWeight: 600, ...{ mb: 1, mt: 0.5 } }}
          >
            {element.label || "(No label)"}
          </Typography>
          {element.description && (
            <Tooltip title={element.description} arrow placement="top">
              <IconButton size="small">
                <HelpOutlineIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Stack>
      ) : null}
      <ElementPreview
        key={`${element.id}:${"defaultValue" in element ? JSON.stringify(element.defaultValue) : ""}:${element.type === "date" ? JSON.stringify([element.hasTime, element.defaultTimeValue, element.defaultFromValue, element.defaultToValue, element.defaultFromTimeValue, element.defaultToTimeValue]) : ""}`}
        element={element}
        onElementEvent={onElementEvent}
      />
    </Paper>
  );
}

export default CanvasElement;
