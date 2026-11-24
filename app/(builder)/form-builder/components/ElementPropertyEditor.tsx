import { useState } from "react";
import {
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  InputLabel,
  ListItemText,
  MenuItem,
  Radio,
  RadioGroup,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { useTranslation } from "@/app/(builder)/hooks/useTranslation";

import {
  DisplayKey,
  DisplayValue,
  FormElement,
  GridElement,
  InputElement,
  LOCALE_LIST,
  LOCALE_TIME,
} from "../type";
import GridDataEditor from "./GridDataEditor";
import { toLocaleTimeValue } from "../utils/dateTimestamp";

const splitList = (value: string) =>
  value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);

const formatList = (items: string[] | string) =>
  (Array.isArray(items) ? items : items ? [items] : []).join("\n");

const INITIAL_GRID_SAMPLE_JSON = JSON.stringify(
  {
    data: [
      { id: "AL000000001", name: "ABC Corp" },
      { id: "AL000000002", name: "DEF Ltd" },
    ],
  },
  null,
  2,
);

const createEmptyGridSampleJson = (dataSlot: string): string => {
  const path = dataSlot
    .replace(/\[(\w+)\]/g, ".$1")
    .split(".")
    .map((item) => item.trim())
    .filter(Boolean);

  const emptySample = path.reduceRight<Record<string, unknown>>(
    (child, key, index) => ({ [key]: index === path.length - 1 ? [] : child }),
    {},
  );

  return JSON.stringify(emptySample, null, 2);
};

type DisplayOption = string | DisplayValue;

const normalizeDisplayValue = (
  option: DisplayOption,
  index: number,
): DisplayValue => {
  if (typeof option === "string") {
    return {
      value: option,
      label: option,
    };
  }

  const value = option.value || `Option ${index + 1}`;

  return {
    value,
    label: option.label || value,
    param: option.param,
  };
};

const getOptionValues = (options: DisplayOption[]) =>
  options.map((option, index) => normalizeDisplayValue(option, index).value);

const createDefaultOption = (index: number): DisplayValue => ({
  value: `Option ${index + 1}`,
  label: `Option ${index + 1}`,
});

const getDropboxDefaultValue = (value: string | string[]) =>
  Array.isArray(value) ? (value[0] ?? "") : value;

const getDropboxDefaultValues = (value: string | string[]) =>
  Array.isArray(value) ? value : value ? [value] : [];

const layoutColumnOptions = Array.from({ length: 20 }, (_, index) => index + 1);

function OptionLayoutEditor({
  element,
  onChange,
  isReadonly,
}: {
  element: Extract<FormElement, { type: "checkbox" | "radio" }>;
  onChange: (element: FormElement) => void;
  isReadonly: boolean;
}) {
  const { t } = useTranslation();
  const optionLayout = element.optionLayout ?? "vertical";

  return (
    <Stack spacing={2} direction="row">
      <FormControl fullWidth size="small">
        <InputLabel id={`${element.id}-option-layout-label`}>
          {t("Option Layout")}
        </InputLabel>
        <Select
          labelId={`${element.id}-option-layout-label`}
          label={t("Option Layout")}
          disabled={isReadonly}
          value={optionLayout}
          onChange={(event) =>
            onChange({
              ...element,
              optionLayout: event.target.value as "vertical" | "horizontal",
            })
          }
        >
          <MenuItem value="vertical">{t("Vertical")}</MenuItem>
          <MenuItem value="horizontal">{t("Horizontal")}</MenuItem>
        </Select>
      </FormControl>
      {optionLayout === "horizontal" ? (
        <FormControl fullWidth size="small">
          <InputLabel id={`${element.id}-options-per-row-label`}>
            {t("Items per Row")}
          </InputLabel>
          <Select
            labelId={`${element.id}-options-per-row-label`}
            label={t("Items per Row")}
            disabled={isReadonly}
            value={element.optionsPerRow ?? 2}
            onChange={(event) =>
              onChange({
                ...element,
                optionsPerRow: Number(event.target.value),
              })
            }
          >
            {layoutColumnOptions.map((count) => (
              <MenuItem key={count} value={count}>
                {count}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      ) : null}
    </Stack>
  );
}

const createDefaultDisplayKey = (): DisplayKey => ({
  key: "",
  label: "",
});

function DisplayKeysEditor({
  displayKeys,
  defaultCount,
  onChange,
  isReadonly,
}: {
  displayKeys: DisplayKey[];
  defaultCount: number;
  onChange: (displayKeys: DisplayKey[]) => void;
  isReadonly: boolean;
}) {
  const { t } = useTranslation();
  const count = displayKeys.length || defaultCount;
  const normalizedDisplayKeys = Array.from(
    { length: count },
    (_, index) => displayKeys[index] ?? createDefaultDisplayKey(),
  );
  const countOptions = Array.from({ length: 20 }, (_, index) => index + 1);

  const handleCountChange = (nextCount: number) => {
    onChange(
      Array.from(
        { length: nextCount },
        (_, index) => normalizedDisplayKeys[index] ?? createDefaultDisplayKey(),
      ),
    );
  };

  const handleDisplayKeyChange = (
    index: number,
    field: keyof DisplayKey,
    value: string,
  ) => {
    onChange(
      normalizedDisplayKeys.map((displayKey, displayKeyIndex) =>
        displayKeyIndex === index
          ? { ...displayKey, [field]: value }
          : displayKey,
      ),
    );
  };

  return (
    <Stack spacing={1.25}>
      <FormControl fullWidth size="small">
        <InputLabel id="grid-header-count-label">
          {t("Header Count")}
        </InputLabel>
        <Select
          labelId="grid-header-count-label"
          label={t("Header Count")}
          disabled={isReadonly}
          value={count}
          onChange={(event) => handleCountChange(Number(event.target.value))}
        >
          {countOptions.map((optionCount) => (
            <MenuItem key={optionCount} value={optionCount}>
              {optionCount}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <Typography variant="subtitle2">{t("Display Labels")}</Typography>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "32px minmax(0, 1fr) minmax(0, 1fr)",
          gap: 0.75,
          alignItems: "center",
        }}
      >
        {normalizedDisplayKeys.map((displayKey, index) => (
          <Box key={index} sx={{ display: "contents" }}>
            <TextField
              slotProps={{
                htmlInput: { sx: { textAlign: "center", px: 0.5 } },
              }}
              size="small"
              value={index + 1}
              disabled
            />
            <TextField
              size="small"
              label={t("Key")}
              disabled={isReadonly}
              value={displayKey.key}
              onChange={(event) =>
                handleDisplayKeyChange(index, "key", event.target.value)
              }
            />
            <TextField
              size="small"
              label={t("Label")}
              disabled={isReadonly}
              value={displayKey.label}
              onChange={(event) =>
                handleDisplayKeyChange(index, "label", event.target.value)
              }
            />
          </Box>
        ))}
      </Box>
    </Stack>
  );
}

const getValueAtPath = (value: unknown, path: string): unknown =>
  path
    .replace(/\[(\w+)\]/g, ".$1")
    .split(".")
    .filter(Boolean)
    .reduce<unknown>((current, key) => {
      if (current && typeof current === "object") {
        return (current as Record<string, unknown>)[key];
      }
      return undefined;
    }, value);

function GridSampleDataControls({
  element,
  onChange,
  isReadonly,
}: {
  element: GridElement;
  onChange: (element: GridElement) => void;
  isReadonly: boolean;
}) {
  const { t } = useTranslation();
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [sampleJsonError, setSampleJsonError] = useState("");
  const sampleJson = element.sampleJson ?? INITIAL_GRID_SAMPLE_JSON;

  let previewRows: Record<string, unknown>[] = [];
  let previewError = "";
  try {
    const parsedJson: unknown = JSON.parse(sampleJson);
    const data = getValueAtPath(parsedJson, element.optionsSlot?.trim() ?? "");
    if (!Array.isArray(data)) {
      previewError = t("Data Slot must point to an array in the sample JSON.");
    } else {
      previewRows = data.filter(
        (row): row is Record<string, unknown> =>
          Boolean(row) && typeof row === "object" && !Array.isArray(row),
      );
    }
  } catch {
    previewError = t("Invalid JSON format");
  }

  const previewKeys = element.displayKeys.length
    ? element.displayKeys
    : Object.keys(previewRows[0] ?? {}).map((key) => ({ key, label: key }));

  const handleFormatSampleJson = () => {
    try {
      onChange({
        ...element,
        sampleJson: JSON.stringify(JSON.parse(sampleJson), null, 2),
      });
      setSampleJsonError("");
    } catch {
      setSampleJsonError(t("Invalid JSON format"));
    }
  };

  return (
    <>
      <Stack direction="row" spacing={1}>
        <Button
          fullWidth
          variant="outlined"
          disabled={isReadonly}
          onClick={() => {
            setSampleJsonError("");
            setIsEditorOpen(true);
          }}
        >
          {t("Response Data")}
        </Button>
        <Button
          fullWidth
          variant="outlined"
          onClick={() => setIsPreviewOpen(true)}
        >
          {t("Preview")}
        </Button>
      </Stack>

      <Dialog
        open={isEditorOpen}
        onClose={() => setIsEditorOpen(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>{t("Sample JSON Data")}</DialogTitle>
        <DialogContent dividers>
          <TextField
            slotProps={{
              htmlInput: {
                spellCheck: false,
                sx: { fontFamily: "monospace", fontSize: 13 },
              },
            }}
            fullWidth
            multiline
            minRows={14}
            value={sampleJson}
            error={Boolean(sampleJsonError)}
            helperText={sampleJsonError}
            onChange={(event) => {
              onChange({ ...element, sampleJson: event.target.value });
              setSampleJsonError("");
            }}
            onKeyDown={(event) => event.stopPropagation()}
          />
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              onChange({ ...element, sampleJson: INITIAL_GRID_SAMPLE_JSON });
              setSampleJsonError("");
            }}
          >
            {t("Reset")}
          </Button>
          <Button onClick={handleFormatSampleJson}>
            {t("JSON Formatter")}
          </Button>
          <Button variant="contained" onClick={() => setIsEditorOpen(false)}>
            {t("Close")}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>{t("Grid Preview")}</DialogTitle>
        <DialogContent dividers>
          {previewError ? (
            <Typography sx={{ color: "error" }}>{previewError}</Typography>
          ) : (
            <TableContainer sx={{ maxHeight: 480 }}>
              <Table stickyHeader size="small">
                {element.hasHeader ? (
                  <TableHead>
                    <TableRow>
                      {element.selectable ? (
                        <TableCell padding="checkbox" />
                      ) : null}
                      {previewKeys.map((item, index) => (
                        <TableCell key={`${item.key}-${index}`}>
                          {item.label || item.key}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                ) : null}
                <TableBody>
                  {previewRows.map((row, rowIndex) => (
                    <TableRow key={rowIndex}>
                      {element.selectable ? (
                        <TableCell padding="checkbox">
                          <Checkbox size="small" disabled />
                        </TableCell>
                      ) : null}
                      {previewKeys.map((item, columnIndex) => (
                        <TableCell key={`${item.key}-${columnIndex}`}>
                          {typeof row[item.key] === "object"
                            ? JSON.stringify(row[item.key])
                            : String(row[item.key] ?? "")}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
        <DialogActions>
          <Button variant="contained" onClick={() => setIsPreviewOpen(false)}>
            {t("Close")}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

type OptionsElement = Extract<
  FormElement,
  { type: "checkbox" | "radio" | "dropbox" }
>;

function OptionsSampleDataControls({
  element,
  onChange,
  isReadonly,
}: {
  element: OptionsElement;
  onChange: (element: OptionsElement) => void;
  isReadonly: boolean;
}) {
  const { t } = useTranslation();
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [sampleJsonError, setSampleJsonError] = useState("");
  const sampleJson = element.sampleJson ?? "";
  let previewOptions: DisplayValue[] = [];
  let previewError = "";

  try {
    const parsedJson: unknown = sampleJson ? JSON.parse(sampleJson) : {};
    const rows = getValueAtPath(parsedJson, element.optionsSlot?.trim() ?? "");
    if (!Array.isArray(rows)) {
      previewError = t("Data Slot must point to an array in the sample JSON.");
    } else if (!element.optionLabelKey || !element.optionValueKey) {
      previewError = t("Label Key and Value Key are required.");
    } else {
      previewOptions = rows.flatMap((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return [];
        const row = item as Record<string, unknown>;
        return [
          {
            label: String(row[element.optionLabelKey!] ?? ""),
            value: String(row[element.optionValueKey!] ?? ""),
          },
        ];
      });
    }
  } catch {
    previewError = t("Invalid JSON format");
  }

  return (
    <Stack spacing={2}>
      <TextField
        label={t("Data Slot")}
        helperText={t("Bind to array in slot")}
        size="small"
        fullWidth
        disabled={isReadonly}
        value={element.optionsSlot ?? ""}
        onChange={(event) => {
          const optionsSlot = event.target.value;
          const changed = optionsSlot !== (element.optionsSlot ?? "");
          onChange({
            ...element,
            optionsSlot,
            options: changed ? [] : element.options,
            sampleJson: changed ? "" : element.sampleJson,
            optionLabelKey: changed ? "" : element.optionLabelKey,
            optionValueKey: changed ? "" : element.optionValueKey,
          });
        }}
      />
      {element.optionsSlot ? (
        <>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
            <TextField
              label={t("Label Key")}
              size="small"
              fullWidth
              disabled={isReadonly}
              value={element.optionLabelKey ?? ""}
              onChange={(event) =>
                onChange({ ...element, optionLabelKey: event.target.value })
              }
            />
            <TextField
              label={t("Value Key")}
              size="small"
              fullWidth
              disabled={isReadonly}
              value={element.optionValueKey ?? ""}
              onChange={(event) =>
                onChange({ ...element, optionValueKey: event.target.value })
              }
            />
          </Stack>
          <Stack direction="row" spacing={1}>
            <Button
              fullWidth
              variant="outlined"
              disabled={isReadonly}
              onClick={() => {
                setSampleJsonError("");
                setIsEditorOpen(true);
              }}
            >
              {t("Response Data")}
            </Button>
            <Button
              fullWidth
              variant="outlined"
              onClick={() => setIsPreviewOpen(true)}
            >
              {t("Preview")}
            </Button>
          </Stack>

          <Dialog
            open={isEditorOpen}
            onClose={() => setIsEditorOpen(false)}
            fullWidth
            maxWidth="sm"
          >
            <DialogTitle>{t("Sample JSON Data")}</DialogTitle>
            <DialogContent dividers>
              <TextField
                slotProps={{
                  htmlInput: {
                    spellCheck: false,
                    sx: { fontFamily: "monospace" },
                  },
                }}
                fullWidth
                multiline
                minRows={14}
                value={sampleJson}
                error={Boolean(sampleJsonError)}
                helperText={sampleJsonError}
                onChange={(event) => {
                  onChange({ ...element, sampleJson: event.target.value });
                  setSampleJsonError("");
                }}
              />
            </DialogContent>
            <DialogActions>
              <Button
                onClick={() => {
                  try {
                    onChange({
                      ...element,
                      sampleJson: JSON.stringify(
                        JSON.parse(sampleJson),
                        null,
                        2,
                      ),
                    });
                    setSampleJsonError("");
                  } catch {
                    setSampleJsonError(t("Invalid JSON format"));
                  }
                }}
              >
                {t("JSON Formatter")}
              </Button>
              <Button
                variant="contained"
                onClick={() => setIsEditorOpen(false)}
              >
                {t("Close")}
              </Button>
            </DialogActions>
          </Dialog>

          <Dialog
            open={isPreviewOpen}
            onClose={() => setIsPreviewOpen(false)}
            fullWidth
            maxWidth="sm"
          >
            <DialogTitle>{t("Options Preview")}</DialogTitle>
            <DialogContent dividers>
              {previewError ? (
                <Typography sx={{ color: "error" }}>{previewError}</Typography>
              ) : (
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>label</TableCell>
                        <TableCell>value</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {previewOptions.map((option, index) => (
                        <TableRow key={`${option.value}-${index}`}>
                          <TableCell>{option.label}</TableCell>
                          <TableCell>{option.value}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setIsPreviewOpen(false)}>
                {t("Close")}
              </Button>
            </DialogActions>
          </Dialog>
        </>
      ) : null}
    </Stack>
  );
}

function DraftTextField({
  label,
  helperText,
  minRows,
  value,
  onCommit,
  hidden = false,
  isReadonly = false,
}: {
  label: string;
  helperText: string;
  minRows: number;
  value: string;
  onCommit: (value: string) => void;
  hidden?: boolean;
  isReadonly?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  const [prevValue, setPrevValue] = useState(value);

  if (value !== prevValue) {
    setDraft(value);
    setPrevValue(value);
  }

  if (hidden) return null;

  return (
    <TextField
      label={label}
      helperText={helperText}
      size="small"
      fullWidth
      multiline
      minRows={minRows}
      disabled={isReadonly}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => onCommit(draft)}
      onKeyDown={(event) => event.stopPropagation()}
    />
  );
}

function DisplayOptionsEditor({
  options,
  onOptionsChange,
  isReadonly,
  sendByOption = false,
  onSendByOptionChange,
}: {
  options: DisplayOption[];
  onOptionsChange: (options: DisplayValue[]) => void;
  isReadonly: boolean;
  sendByOption?: boolean;
  onSendByOptionChange?: (checked: boolean) => void;
}) {
  const { t } = useTranslation();
  const normalizedOptions = options.map(normalizeDisplayValue);
  const countOptions = Array.from({ length: 21 }, (_, index) => index);

  const handleCountChange = (count: number) => {
    const nextOptions = Array.from({ length: count }, (_, index) => {
      const currentOption = normalizedOptions[index];

      return currentOption ?? createDefaultOption(index);
    });

    onOptionsChange(nextOptions);
  };

  const handleOptionChange = (
    index: number,
    key: keyof DisplayValue,
    value: string,
  ) => {
    const nextOptions = normalizedOptions.map((option, optionIndex) =>
      optionIndex === index ? { ...option, [key]: value } : option,
    );

    onOptionsChange(nextOptions);
  };

  return (
    <Stack spacing={1.25}>
      <FormControl fullWidth size="small">
        <InputLabel id="checkbox-options-count-label">{t("Count")}</InputLabel>
        <Select
          labelId="checkbox-options-count-label"
          label={t("Count")}
          disabled={isReadonly}
          value={normalizedOptions.length}
          onChange={(event) => handleCountChange(Number(event.target.value))}
        >
          {countOptions.map((count) => (
            <MenuItem key={count} value={count}>
              {count}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      {onSendByOptionChange ? (
        <FormControlLabel
          control={
            <Checkbox
              size="small"
              disabled={isReadonly}
              checked={sendByOption}
              onChange={(event) => onSendByOptionChange(event.target.checked)}
            />
          }
          label={t("Send by option")}
          sx={{ mx: 0 }}
        />
      ) : null}

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "32px minmax(0, 1fr) 72px",
          gap: 0.75,
          alignItems: "center",
        }}
      >
        <Typography sx={{ color: "text.secondary" }} variant="caption">
          No
        </Typography>
        <Typography sx={{ color: "text.secondary" }} variant="caption">
          Display
        </Typography>
        <Typography sx={{ color: "text.secondary" }} variant="caption">
          {sendByOption ? "Param" : "Value"}
        </Typography>

        {normalizedOptions.map((option, index) => (
          <Box key={index} sx={{ display: "contents" }}>
            <TextField
              slotProps={{
                htmlInput: {
                  sx: {
                    textAlign: "center",
                    px: 0.5,
                  },
                },
              }}
              size="small"
              value={index + 1}
              disabled
            />
            <TextField
              size="small"
              disabled={isReadonly}
              value={option.label}
              onChange={(event) =>
                handleOptionChange(index, "label", event.target.value)
              }
            />
            <TextField
              size="small"
              disabled={isReadonly}
              value={sendByOption ? (option.param ?? "") : option.value}
              onChange={(event) =>
                handleOptionChange(
                  index,
                  sendByOption ? "param" : "value",
                  event.target.value,
                )
              }
            />
          </Box>
        ))}
      </Box>
    </Stack>
  );
}

function ElementPropertyEditor({
  element,
  onChange,
  onGridSizeChange,
  isReadonly = false,
}: {
  element: FormElement;
  onChange: (element: FormElement) => void;
  onGridSizeChange: (
    element: GridElement,
    key: "rows" | "columns",
    value: number,
  ) => void;
  isReadonly?: boolean;
}) {
  const { t } = useTranslation();

  switch (element.type) {
    case "input":
      return (
        <Stack spacing={2}>
          <TextField
            label={t("Default Value")}
            size="small"
            fullWidth
            disabled={isReadonly}
            value={element.defaultValue}
            onChange={(event) =>
              onChange({ ...element, defaultValue: event.target.value })
            }
          />
          <Typography sx={{ color: "text.secondary" }} variant="caption">
            {t(
              `Use {slotName} to reference a slot value, otherwise treated as literal text.`,
            )}
          </Typography>
          <TextField
            label={t("Placeholder")}
            size="small"
            fullWidth
            disabled={isReadonly}
            value={element.placeholder}
            onChange={(event) =>
              onChange({ ...element, placeholder: event.target.value })
            }
          />
          {/* Minimum Length, Maximum Length */}
          <TextField
            label={t("Minimum Text Length")}
            size="small"
            type="number"
            fullWidth
            disabled={isReadonly}
            value={element.minLength ?? ""}
            onChange={(event) =>
              onChange({ ...element, minLength: event.target.value })
            }
          />
          <TextField
            label={t("Maximum Text Length")}
            size="small"
            type="number"
            fullWidth
            disabled={isReadonly}
            value={element.maxLength ?? ""}
            onChange={(event) =>
              onChange({ ...element, maxLength: event.target.value })
            }
          />
          <FormControl fullWidth size="small">
            <InputLabel id="transformTextType-label">
              {t("Transform Text")}
            </InputLabel>
            <Select
              labelId="transformTextType-label"
              label={t("Transform Text")}
              disabled={isReadonly}
              value={element.transformTextType ?? ""}
              onChange={(event) =>
                onChange({
                  ...element,
                  transformTextType: event.target
                    .value as InputElement["transformTextType"],
                })
              }
            >
              <MenuItem value="">{t("None")}</MenuItem>
              <MenuItem value="uppercase">{t("Uppercase")}</MenuItem>
              <MenuItem value="lowercase">{t("Lowercase")}</MenuItem>
              <MenuItem value="capitalize">{t("Capitalize")}</MenuItem>
            </Select>
          </FormControl>
          <FormControl fullWidth size="small">
            <InputLabel id="validation-label">{t("validation")}</InputLabel>
            <Select
              labelId="validation-label"
              label={t("validation")}
              disabled={isReadonly}
              value={element.validation.type}
              onChange={(event) =>
                onChange({
                  ...element,
                  validation: {
                    type: event.target
                      .value as InputElement["validation"]["type"],
                  },
                })
              }
            >
              <MenuItem value="text">{t("text")}</MenuItem>
              <MenuItem value="email">{t("email")}</MenuItem>
              <MenuItem value="number">{t("number")}</MenuItem>
              <MenuItem value="custom">{t("custom")}</MenuItem>
            </Select>
          </FormControl>
          {element.validation.type === "custom" && (
            <TextField
              label={t("Regex")}
              size="small"
              fullWidth
              disabled={isReadonly}
              value={element.regex}
              onChange={(event) =>
                onChange({ ...element, regex: event.target.value })
              }
            />
          )}
        </Stack>
      );
    case "date":
      return (
        <Stack spacing={2}>
          {/* 라디오 버튼 그룹 (가로 배치: row 속성) */}
          <RadioGroup
            row={true}
            aria-labelledby="date-type-radio-group-label"
            name="hasFromTo"
            value={element.hasFromTo ?? false}
            onChange={(event) =>
              onChange({ ...element, hasFromTo: event.target.value === "true" })
            }
          >
            <FormControlLabel
              value={false}
              control={<Radio size="small" />}
              label={t("Single")}
            />
            <FormControlLabel
              value={true}
              control={<Radio size="small" />}
              label={t("From-To")}
            />
          </RadioGroup>
          {element.hasFromTo && (
            <TextField
              label={t("auto set to today")}
              size="small"
              type="number"
              fullWidth
              disabled={isReadonly}
              value={element.defaultToDateOffset ?? 0}
              onChange={(event) =>
                onChange({
                  ...element,
                  defaultToDateOffset: Number(event.target.value),
                })
              }
            />
          )}
          {element.hasFromTo ? (
            <>
              <Stack sx={{ alignItems: "center" }} spacing={1} direction="row">
                <TextField
                  slotProps={{ inputLabel: { shrink: true } }}
                  label={t("Default From Value")}
                  size="small"
                  fullWidth
                  type="date"
                  disabled={isReadonly}
                  value={element.defaultFromValue ?? ""}
                  onChange={(event) => {
                    const nextDefaultValue = event.target.value;
                    onChange({
                      ...element,
                      defaultFromValue: nextDefaultValue,
                      fromDateValue: element.fromDateValue || nextDefaultValue,
                      fromValue: toLocaleTimeValue(
                        nextDefaultValue,
                        element.fromTimeValue ||
                          element.defaultFromTimeValue ||
                          element.defaultTimeValue,
                        element.hasTime,
                        element.locale,
                      ),
                    });
                  }}
                />
                {element.hasTime ? (
                  <TextField
                    label={t("Default From Time")}
                    size="small"
                    fullWidth
                    type="time"
                    disabled={isReadonly}
                    value={element.defaultFromTimeValue ?? ""}
                    onChange={(event) => {
                      const nextDefaultValue = event.target.value;
                      onChange({
                        ...element,
                        defaultFromTimeValue: nextDefaultValue,
                        fromTimeValue:
                          element.fromTimeValue || nextDefaultValue,
                        fromValue: toLocaleTimeValue(
                          element.fromDateValue ||
                            element.defaultFromValue ||
                            element.defaultValue,
                          nextDefaultValue,
                          element.hasTime,
                          element.locale,
                        ),
                      });
                    }}
                    slotProps={{
                      htmlInput: { step: 60 },
                      ...{ inputLabel: { shrink: true } },
                    }}
                  />
                ) : null}
              </Stack>
              <Stack sx={{ alignItems: "center" }} spacing={1} direction="row">
                <TextField
                  slotProps={{ inputLabel: { shrink: true } }}
                  label={t("Default To Value")}
                  size="small"
                  fullWidth
                  type="date"
                  disabled={isReadonly}
                  value={element.defaultToValue ?? ""}
                  onChange={(event) => {
                    const nextDefaultValue = event.target.value;
                    onChange({
                      ...element,
                      defaultToValue: nextDefaultValue,
                      toDateValue: element.toDateValue || nextDefaultValue,
                      toValue: toLocaleTimeValue(
                        nextDefaultValue,
                        element.toTimeValue ||
                          element.defaultToTimeValue ||
                          element.defaultTimeValue,
                        element.hasTime,
                        element.locale,
                      ),
                    });
                  }}
                />
                {element.hasTime ? (
                  <TextField
                    label={t("Default To Time")}
                    size="small"
                    fullWidth
                    type="time"
                    disabled={isReadonly}
                    value={element.defaultToTimeValue ?? ""}
                    onChange={(event) => {
                      const nextDefaultValue = event.target.value;
                      onChange({
                        ...element,
                        defaultToTimeValue: nextDefaultValue,
                        toTimeValue: element.toTimeValue || nextDefaultValue,
                        toValue: toLocaleTimeValue(
                          element.toDateValue || element.defaultToValue || "",
                          nextDefaultValue,
                          element.hasTime,
                          element.locale,
                        ),
                      });
                    }}
                    slotProps={{
                      htmlInput: { step: 60 },
                      ...{ inputLabel: { shrink: true } },
                    }}
                  />
                ) : null}
              </Stack>
            </>
          ) : (
            <Stack sx={{ alignItems: "center" }} spacing={1} direction="row">
              <TextField
                slotProps={{ inputLabel: { shrink: true } }}
                label={t("Default Value")}
                size="small"
                fullWidth
                type="date"
                disabled={isReadonly}
                value={element.defaultValue}
                onChange={(event) => {
                  const nextDefaultValue = event.target.value;
                  onChange({
                    ...element,
                    defaultValue: nextDefaultValue,
                    dateValue: element.dateValue || nextDefaultValue,
                    value: toLocaleTimeValue(
                      element.dateValue || nextDefaultValue,
                      element.timeValue || element.defaultTimeValue,
                      element.hasTime,
                      element.locale,
                    ),
                    fromDateValue: element.fromDateValue || nextDefaultValue,
                  });
                }}
              />
              {element.hasTime ? (
                <TextField
                  label={t("Default Time")}
                  size="small"
                  fullWidth
                  type="time"
                  disabled={isReadonly}
                  value={element.defaultTimeValue ?? ""}
                  onChange={(event) => {
                    const nextDefaultValue = event.target.value;
                    onChange({
                      ...element,
                      defaultTimeValue: nextDefaultValue,
                      timeValue: element.timeValue || nextDefaultValue,
                      fromTimeValue: element.fromTimeValue || nextDefaultValue,
                      value: toLocaleTimeValue(
                        element.dateValue || element.defaultValue,
                        nextDefaultValue,
                        element.hasTime,
                        element.locale,
                      ),
                    });
                  }}
                  slotProps={{
                    htmlInput: { step: 60 },
                    ...{ inputLabel: { shrink: true } },
                  }}
                />
              ) : null}
            </Stack>
          )}
          <FormControlLabel
            control={
              <Checkbox
                size="small"
                disabled={isReadonly}
                checked={element.hasTime ?? false}
                onChange={(event) => {
                  const hasTime = event.target.checked;
                  const fromDate = element.hasFromTo
                    ? element.fromDateValue ||
                      element.defaultFromValue ||
                      element.defaultValue
                    : element.dateValue || element.defaultValue;
                  const toDate =
                    element.toDateValue || element.defaultToValue || "";
                  const fromTime =
                    element.fromTimeValue ||
                    element.defaultFromTimeValue ||
                    element.defaultTimeValue;
                  const toTime =
                    element.toTimeValue ||
                    element.defaultToTimeValue ||
                    element.defaultTimeValue;

                  onChange({
                    ...element,
                    hasTime,
                    value: toLocaleTimeValue(
                      fromDate,
                      fromTime,
                      hasTime,
                      element.locale,
                    ),
                    fromValue: element.hasFromTo
                      ? toLocaleTimeValue(
                          fromDate,
                          fromTime,
                          hasTime,
                          element.locale,
                        )
                      : undefined,
                    toValue: element.hasFromTo
                      ? toLocaleTimeValue(
                          toDate,
                          toTime,
                          hasTime,
                          element.locale,
                        )
                      : undefined,
                  });
                }}
              />
            }
            label={t("Use Time")}
          />
          {element.hasTime ? (
            <FormControl fullWidth size="small">
              <InputLabel id="date-locale-label">{t("Locale")}</InputLabel>
              <Select
                labelId="date-locale-label"
                label={t("Locale")}
                disabled={isReadonly}
                value={element.locale}
                onChange={(event) => {
                  const locale = event.target.value as LOCALE_TIME;
                  const fromDate = element.hasFromTo
                    ? element.fromDateValue ||
                      element.defaultFromValue ||
                      element.defaultValue
                    : element.dateValue || element.defaultValue;
                  const toDate =
                    element.toDateValue || element.defaultToValue || "";
                  const fromTime =
                    element.fromTimeValue ||
                    element.defaultFromTimeValue ||
                    element.defaultTimeValue;
                  const toTime =
                    element.toTimeValue ||
                    element.defaultToTimeValue ||
                    element.defaultTimeValue;

                  onChange({
                    ...element,
                    locale,
                    value: toLocaleTimeValue(
                      fromDate,
                      fromTime,
                      element.hasTime,
                      locale,
                    ),
                    fromValue: element.hasFromTo
                      ? toLocaleTimeValue(
                          fromDate,
                          fromTime,
                          element.hasTime,
                          locale,
                        )
                      : undefined,
                    toValue: element.hasFromTo
                      ? toLocaleTimeValue(
                          toDate,
                          toTime,
                          element.hasTime,
                          locale,
                        )
                      : undefined,
                  });
                }}
              >
                {LOCALE_LIST.map((item) => (
                  <MenuItem key={item.value} value={item.value}>
                    {item.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          ) : null}
        </Stack>
      );
    case "checkbox":
      return (
        <Stack spacing={2}>
          <OptionLayoutEditor
            element={element}
            onChange={onChange}
            isReadonly={isReadonly}
          />
          <OptionsSampleDataControls
            element={element}
            onChange={onChange}
            isReadonly={isReadonly}
          />

          {!element.optionsSlot ? (
            <DisplayOptionsEditor
              options={element.options}
              sendByOption={element.sendByOption}
              onSendByOptionChange={(checked) =>
                onChange({
                  ...element,
                  sendByOption: checked,
                  defaultValue: [],
                  options: element.options.map((option, index) => {
                    const normalized = normalizeDisplayValue(option, index);
                    return {
                      ...normalized,
                      param: normalized.param || normalized.value,
                    };
                  }),
                })
              }
              onOptionsChange={(options) => {
                const optionValues = options.map((option) => option.value);
                onChange({
                  ...element,
                  options,
                  defaultValue: element.defaultValue.filter((item) =>
                    optionValues.includes(item),
                  ),
                });
              }}
              isReadonly={isReadonly}
            />
          ) : null}

          {!element.sendByOption && (
            <DraftTextField
              label={t("Default Value")}
              helperText={t(
                "Enter the value of the option to check in comma or line-up",
              )}
              minRows={2}
              isReadonly={isReadonly}
              value={formatList(element.defaultValue)}
              onCommit={(value) =>
                onChange({
                  ...element,
                  defaultValue: splitList(value).filter((item) =>
                    getOptionValues(element.options).includes(item),
                  ),
                })
              }
            />
          )}
        </Stack>
      );
    case "radio": {
      return (
        <Stack spacing={2}>
          <FormControlLabel
            control={
              <Checkbox
                size="small"
                disabled={isReadonly}
                checked={element.allowDeselection ?? false}
                onChange={(event) =>
                  onChange({
                    ...element,
                    allowDeselection: event.target.checked,
                  })
                }
              />
            }
            label={t("Allow Deselection")}
            sx={{ mx: 0 }}
          />
          <OptionLayoutEditor
            element={element}
            onChange={onChange}
            isReadonly={isReadonly}
          />
          <OptionsSampleDataControls
            element={element}
            onChange={onChange}
            isReadonly={isReadonly}
          />

          {!element.optionsSlot ? (
            <DisplayOptionsEditor
              options={element.options}
              sendByOption={element.sendByOption}
              onSendByOptionChange={(checked) =>
                onChange({
                  ...element,
                  sendByOption: checked,
                  defaultValue: [],
                  options: element.options.map((option, index) => {
                    const normalized = normalizeDisplayValue(option, index);
                    return {
                      ...normalized,
                      param: normalized.param || normalized.value,
                    };
                  }),
                })
              }
              onOptionsChange={(options) => {
                const optionValues = options.map((option) => option.value);
                onChange({
                  ...element,
                  options,
                  defaultValue: element.defaultValue.filter((item) =>
                    optionValues.includes(item),
                  ),
                });
              }}
              isReadonly={isReadonly}
            />
          ) : null}

          {!element.sendByOption && (
            <DraftTextField
              label={t("Default Value")}
              helperText={t(
                "Enter the value of the option to check in comma or line-up",
              )}
              minRows={2}
              isReadonly={isReadonly}
              value={formatList(element.defaultValue)}
              onCommit={(value) =>
                onChange({
                  ...element,
                  defaultValue: splitList(value).filter((item) =>
                    getOptionValues(element.options).includes(item),
                  ),
                })
              }
            />
          )}
        </Stack>
      );
    }
    case "dropbox": {
      const isMultiSelect = element.selectKind === "multi";
      const normalizedOptions = element.options.map(normalizeDisplayValue);
      const optionLabels = new Map(
        normalizedOptions.map((option) => [option.value, option.label]),
      );

      return (
        <Stack spacing={2}>
          <FormControl fullWidth size="small">
            <InputLabel id="dropbox-select-kind-label">
              {t("Select Kind")}
            </InputLabel>
            <Select
              labelId="dropbox-select-kind-label"
              label={t("Select Kind")}
              disabled={isReadonly}
              value={element.selectKind}
              onChange={(event) => {
                const selectKind = event.target.value as "single" | "multi";

                onChange({
                  ...element,
                  selectKind,
                  defaultValue:
                    selectKind === "multi"
                      ? getDropboxDefaultValues(element.defaultValue)
                      : getDropboxDefaultValue(element.defaultValue),
                });
              }}
            >
              <MenuItem value="single">{t("single select")}</MenuItem>
              <MenuItem value="multi">{t("multi select")}</MenuItem>
            </Select>
          </FormControl>
          <OptionsSampleDataControls
            element={element}
            onChange={onChange}
            isReadonly={isReadonly}
          />

          {!element.optionsSlot ? (
            <DisplayOptionsEditor
              options={element.options}
              onOptionsChange={(options) => {
                const optionValues = options.map((option) => option.value);
                onChange({
                  ...element,
                  options,
                  defaultValue: isMultiSelect
                    ? getDropboxDefaultValues(element.defaultValue).filter(
                        (item) => optionValues.includes(item),
                      )
                    : optionValues.includes(
                          getDropboxDefaultValue(element.defaultValue),
                        )
                      ? getDropboxDefaultValue(element.defaultValue)
                      : "",
                });
              }}
              isReadonly={isReadonly}
            />
          ) : null}
          <FormControl fullWidth size="small">
            <InputLabel id="dropbox-default-label">
              {t("Default Value")}
            </InputLabel>
            <Select
              labelId="dropbox-default-label"
              label={t("Default Value")}
              disabled={isReadonly}
              multiple={isMultiSelect}
              value={
                isMultiSelect
                  ? getDropboxDefaultValues(element.defaultValue)
                  : getDropboxDefaultValue(element.defaultValue)
              }
              renderValue={(selected) => {
                const selectedValues = Array.isArray(selected)
                  ? selected
                  : selected
                    ? [String(selected)]
                    : [];

                if (!selectedValues.length) return <em>{t("None")}</em>;

                if (!isMultiSelect) {
                  return (
                    optionLabels.get(selectedValues[0]) ?? selectedValues[0]
                  );
                }

                return (
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                    {selectedValues.map((value) => (
                      <Chip
                        key={value}
                        label={optionLabels.get(value) ?? value}
                        size="small"
                      />
                    ))}
                  </Box>
                );
              }}
              onChange={(event) => {
                const value = event.target.value;

                onChange({
                  ...element,
                  defaultValue: isMultiSelect
                    ? typeof value === "string"
                      ? value.split(",").filter(Boolean)
                      : value
                    : String(value),
                });
              }}
            >
              {!isMultiSelect ? (
                <MenuItem value="">
                  <em>{t("None")}</em>
                </MenuItem>
              ) : null}
              {normalizedOptions.map((option, index) => (
                <MenuItem key={option.value || index} value={option.value}>
                  {isMultiSelect ? (
                    <Checkbox
                      size="small"
                      checked={getDropboxDefaultValues(
                        element.defaultValue,
                      ).includes(option.value)}
                    />
                  ) : null}
                  <ListItemText primary={option.label} />
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Stack>
      );
    }
    case "search":
      return (
        <Stack spacing={2}>
          <TextField
            label={t("Default Value")}
            size="small"
            fullWidth
            disabled={isReadonly}
            value={element.defaultValue}
            onChange={(event) =>
              onChange({ ...element, defaultValue: event.target.value })
            }
          />
          <TextField
            label={t("Placeholder")}
            size="small"
            fullWidth
            disabled={isReadonly}
            value={element.placeholder}
            onChange={(event) =>
              onChange({ ...element, placeholder: event.target.value })
            }
          />
          <TextField
            label={t("API URL")}
            size="small"
            fullWidth
            disabled={isReadonly}
            value={element.apiConfig.url}
            onChange={(event) =>
              onChange({
                ...element,
                apiConfig: {
                  ...element.apiConfig,
                  url: event.target.value,
                },
              })
            }
          />
          <FormControl fullWidth size="small">
            <InputLabel id="search-method-label">{t("Method")}</InputLabel>
            <Select
              labelId="search-method-label"
              label={t("Method")}
              disabled={isReadonly}
              value={element.apiConfig.method}
              onChange={(event) =>
                onChange({
                  ...element,
                  apiConfig: {
                    ...element.apiConfig,
                    method: event.target.value,
                  },
                })
              }
            >
              <MenuItem value="GET">GET</MenuItem>
              <MenuItem value="POST">POST</MenuItem>
            </Select>
          </FormControl>
          <DraftTextField
            label={t("Headers")}
            helperText={t(
              "Use {{slotName}} for dynamic values in JSON header strings",
            )}
            minRows={3}
            isReadonly={isReadonly}
            value={element.apiConfig.headers}
            onCommit={(value) =>
              onChange({
                ...element,
                apiConfig: {
                  ...element.apiConfig,
                  headers: value,
                },
              })
            }
          />
          <DraftTextField
            label={t("Body Template")}
            helperText={t(
              "Use {{value}} to insert the search term. You can also use other slots like {{slotName}}",
            )}
            minRows={4}
            isReadonly={isReadonly}
            value={element.apiConfig.bodyTemplate}
            onCommit={(value) =>
              onChange({
                ...element,
                apiConfig: {
                  ...element.apiConfig,
                  bodyTemplate: value,
                },
              })
            }
          />
          <TextField
            label={t("Input Fill Key")}
            helperText={t(
              "Key from the selected grid row to fill the search input field. (Defaults to the first column if empty)",
            )}
            size="small"
            fullWidth
            disabled={isReadonly}
            value={element.inputFillKey ?? ""}
            onChange={(event) =>
              onChange({
                ...element,
                inputFillKey: event.target.value.trim()
                  ? event.target.value
                  : null,
              })
            }
          />
          <TextField
            label={t("Result Slot")}
            helperText={t(
              "The API response data will be stored in this slot. A Grid element can use this slot in its 'Data Slot' field",
            )}
            size="small"
            fullWidth
            disabled={isReadonly}
            value={element.resultSlot}
            onChange={(event) =>
              onChange({ ...element, resultSlot: event.target.value })
            }
          />
        </Stack>
      );
    case "grid":
      return (
        <Stack spacing={2}>
          <FormControlLabel
            control={
              <Checkbox
                size="small"
                checked={element.selectable ?? false}
                disabled={isReadonly}
                onChange={(event) =>
                  onChange({ ...element, selectable: event.target.checked })
                }
              />
            }
            label={t("Selectable")}
          />
          <FormControlLabel
            control={
              <Checkbox
                size="small"
                checked={element.hasHeader ?? false}
                disabled={isReadonly}
                onChange={(event) => {
                  const hasHeader = event.target.checked;

                  onChange({
                    ...element,
                    hasHeader,
                    displayKeys:
                      hasHeader && !element.displayKeys.length
                        ? Array.from(
                            { length: Math.max(1, element.columns) },
                            () => createDefaultDisplayKey(),
                          )
                        : element.displayKeys,
                  });
                }}
              />
            }
            label={t("Header Row")}
          />
          <TextField
            label={t("Data Slot")}
            helperText={t("Bind to array in slot")}
            size="small"
            fullWidth
            disabled={isReadonly}
            value={element.optionsSlot ?? ""}
            onChange={(event) => {
              const optionsSlot = event.target.value;
              const isDataSlotChanged =
                optionsSlot !== (element.optionsSlot ?? "");

              onChange({
                ...element,
                optionsSlot,
                displayKeys: isDataSlotChanged ? [] : element.displayKeys,
                sampleJson: isDataSlotChanged
                  ? createEmptyGridSampleJson(optionsSlot)
                  : element.sampleJson,
              });
            }}
          />
          {(element.optionsSlot ?? "").trim() ? (
            <GridSampleDataControls
              element={element}
              isReadonly={isReadonly}
              onChange={onChange}
            />
          ) : null}
          {element.hasHeader ? (
            <DisplayKeysEditor
              displayKeys={element.displayKeys}
              defaultCount={Math.max(1, element.columns)}
              isReadonly={isReadonly}
              onChange={(displayKeys) => onChange({ ...element, displayKeys })}
            />
          ) : null}
          {!(element.optionsSlot ?? "").trim() ? (
            <>
              <Stack direction="row" spacing={1}>
                <TextField
                  slotProps={{ htmlInput: { min: 1, max: 20 } }}
                  label="Rows"
                  size="small"
                  fullWidth
                  type="number"
                  disabled={isReadonly}
                  value={element.rows}
                  onChange={(event) =>
                    onGridSizeChange(
                      element,
                      "rows",
                      Math.max(1, Number(event.target.value) || 1),
                    )
                  }
                />
                <TextField
                  slotProps={{ htmlInput: { min: 1, max: 20 } }}
                  label="Columns"
                  size="small"
                  fullWidth
                  type="number"
                  disabled={isReadonly}
                  value={element.columns}
                  onChange={(event) =>
                    onGridSizeChange(
                      element,
                      "columns",
                      Math.max(1, Number(event.target.value) || 1),
                    )
                  }
                />
              </Stack>
              <GridDataEditor
                element={element}
                onChange={(data) => onChange({ ...element, data })}
                isReadonly={isReadonly}
              />
              <DraftTextField
                hidden
                label={t("Data")}
                helperText={t("Enter each cell value as a comma or a new line")}
                minRows={3}
                isReadonly={isReadonly}
                value={formatList(element.data)}
                onCommit={(value) =>
                  onChange({
                    ...element,
                    data: Array.from(
                      { length: element.rows * element.columns },
                      (_, index) => splitList(value)[index] ?? "",
                    ),
                  })
                }
              />
            </>
          ) : null}
        </Stack>
      );
    default:
      return null;
  }
}

export default ElementPropertyEditor;
