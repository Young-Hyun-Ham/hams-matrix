import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Radio,
  Stack,
  Typography,
} from "@mui/material";
import { useTranslation } from "@/app/(builder)/hooks/useTranslation";

type ModalAction = {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: "text" | "outlined" | "contained";
};

const getNodeSummary = (value: unknown): string => {
  if (Array.isArray(value)) return `Array(${value.length})`;
  if (value && typeof value === "object") {
    return `Object(${Object.keys(value).length})`;
  }
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  return String(value);
};

function ResponseDataTree({
  value,
  selectedPath,
  onSelect,
  hideArrayChildren,
  isNodeSelectable,
}: {
  value: unknown;
  selectedPath: string | null;
  onSelect: (path: string, value: unknown) => void;
  hideArrayChildren: boolean;
  isNodeSelectable: (value: unknown) => boolean;
}) {
  const renderNode = (
    key: string,
    nodeValue: unknown,
    path: string,
    depth: number,
  ) => {
    const entries = Array.isArray(nodeValue)
      ? hideArrayChildren
        ? []
        : nodeValue.map((item, index) => [`[${index}]`, item] as const)
      : nodeValue && typeof nodeValue === "object"
        ? Object.entries(nodeValue as Record<string, unknown>)
        : [];
    const hasChildren = entries.length > 0;
    const selectable = isNodeSelectable(nodeValue);
    const nodeLabel = (
      <Box sx={{ display: "flex", alignItems: "center", minWidth: 0 }}>
        <Radio
          size="small"
          checked={selectedPath === path}
          disabled={!selectable}
          onClick={(event) => event.stopPropagation()}
          onChange={() => selectable && onSelect(path, nodeValue)}
        />
        <Typography component="span" variant="body2" sx={{ fontWeight: 600 }}>
          {key}
        </Typography>
        {hasChildren ? (
          <Typography
            className="response-tree-arrow"
            component="span"
            variant="caption"
            sx={{ ml: 0.5, transition: "transform 0.15s" }}
          >
            ▶
          </Typography>
        ) : null}
        <Typography
          component="span"
          variant="caption"
          sx={{
            color: "text.secondary",
            ...{ ml: 1, overflow: "hidden", textOverflow: "ellipsis" },
          }}
        >
          {getNodeSummary(nodeValue)}
        </Typography>
      </Box>
    );

    if (!hasChildren) {
      return (
        <Box key={path} sx={{ pl: depth * 2 }}>
          {nodeLabel}
        </Box>
      );
    }

    return (
      <Box
        component="details"
        key={path}
        open={depth < 2}
        sx={{
          pl: depth * 2,
          "&[open] > summary .response-tree-arrow": {
            transform: "rotate(90deg)",
          },
        }}
      >
        <Box
          component="summary"
          sx={{
            cursor: "pointer",
            listStyle: "none",
            "&::-webkit-details-marker": { display: "none" },
          }}
        >
          {nodeLabel}
        </Box>
        {entries.map(([childKey, childValue]) =>
          renderNode(
            childKey,
            childValue,
            `${path}${childKey.startsWith("[") ? "" : "."}${childKey}`,
            depth + 1,
          ),
        )}
      </Box>
    );
  };

  return (
    <Box sx={{ maxHeight: 420, overflow: "auto" }}>
      {renderNode("$", value, "$", 0)}
    </Box>
  );
}

function OptionMappingControls({
  columnKeys,
  labelKey,
  valueKey,
  onLabelKeyChange,
  onValueKeyChange,
}: {
  columnKeys: string[];
  labelKey: string;
  valueKey: string;
  onLabelKeyChange: (key: string) => void;
  onValueKeyChange: (key: string) => void;
}) {
  const { t } = useTranslation();
  const renderKeys = (
    selectedKey: string,
    color: "primary" | "secondary",
    onChange: (key: string) => void,
  ) => (
    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
      {columnKeys.map((key) => (
        <Button
          key={key}
          size="small"
          color={color}
          variant={selectedKey === key ? "contained" : "outlined"}
          onClick={() => onChange(key)}
        >
          {key}
        </Button>
      ))}
    </Box>
  );

  return (
    <Stack sx={{ mt: 2 }} spacing={1.5}>
      <Typography variant="subtitle2">{t("List Data Keys")}</Typography>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
          gap: 2,
        }}
      >
        <Stack spacing={1}>
          <Typography sx={{ color: "primary.main" }} variant="subtitle2">
            label
          </Typography>
          {renderKeys(labelKey, "primary", onLabelKeyChange)}
          <Alert severity={labelKey ? "success" : "info"}>
            label ← {labelKey || t("Not selected")}
          </Alert>
        </Stack>
        <Stack spacing={1}>
          <Typography sx={{ color: "secondary.main" }} variant="subtitle2">
            value
          </Typography>
          {renderKeys(valueKey, "secondary", onValueKeyChange)}
          <Alert severity={valueKey ? "success" : "info"}>
            value ← {valueKey || t("Not selected")}
          </Alert>
        </Stack>
      </Box>
    </Stack>
  );
}

function ApiResponseMappingModal({
  open,
  title,
  instruction,
  responseData,
  responseError,
  isExecuting,
  selectedPath,
  onSelect,
  isOptionsElement,
  optionColumnKeys,
  selectedLabelKey,
  selectedValueKey,
  onLabelKeyChange,
  onValueKeyChange,
  actions,
  onClose,
}: {
  open: boolean;
  title: string;
  instruction: string;
  responseData: unknown;
  responseError?: string;
  isExecuting?: boolean;
  selectedPath: string | null;
  onSelect: (path: string, value: unknown) => void;
  isOptionsElement: boolean;
  optionColumnKeys: string[];
  selectedLabelKey: string;
  selectedValueKey: string;
  onLabelKeyChange: (key: string) => void;
  onValueKeyChange: (key: string) => void;
  actions: ModalAction[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const isSelectable = (value: unknown) =>
    !isOptionsElement ||
    (Array.isArray(value) && optionColumnKeysFor(value).length > 0);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent dividers>
        <Alert severity="info" sx={{ mb: 2 }}>
          {instruction}
        </Alert>
        {isExecuting && responseData === null ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
            <CircularProgress />
          </Box>
        ) : (
          <ResponseDataTree
            value={responseData}
            selectedPath={selectedPath}
            onSelect={onSelect}
            hideArrayChildren={isOptionsElement}
            isNodeSelectable={isSelectable}
          />
        )}
        {responseError ? (
          <Alert severity="error" sx={{ mt: 2 }}>
            {responseError}
          </Alert>
        ) : null}
        {selectedPath ? (
          <Typography sx={{ color: "text.secondary" }} variant="caption">
            {t("Selected path")}: {selectedPath}
          </Typography>
        ) : null}
        {isOptionsElement && selectedPath ? (
          optionColumnKeys.length ? (
            <OptionMappingControls
              columnKeys={optionColumnKeys}
              labelKey={selectedLabelKey}
              valueKey={selectedValueKey}
              onLabelKeyChange={onLabelKeyChange}
              onValueKeyChange={onValueKeyChange}
            />
          ) : (
            <Alert severity="warning" sx={{ mt: 2 }}>
              {t(
                "Select an array of objects to choose option key and value columns.",
              )}
            </Alert>
          )
        ) : null}
      </DialogContent>
      <DialogActions>
        {actions.map((action) => (
          <Button
            key={action.label}
            variant={action.variant}
            disabled={action.disabled}
            onClick={action.onClick}
          >
            {action.label}
          </Button>
        ))}
        <Button onClick={onClose}>{t("Close")}</Button>
      </DialogActions>
    </Dialog>
  );
}

const optionColumnKeysFor = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value.flatMap((item) =>
        item && typeof item === "object" && !Array.isArray(item)
          ? Object.keys(item)
          : [],
      ),
    ),
  );
};

export default ApiResponseMappingModal;
