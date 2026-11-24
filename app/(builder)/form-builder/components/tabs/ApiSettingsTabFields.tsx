import {
  Add as AddIcon,
  Close as CloseIcon,
  DeleteOutlined as DeleteIcon,
} from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useTranslation } from "@/app/(builder)/hooks/useTranslation";

import type { ReactNode } from "react";
import type { ApiSettings } from "../../type";

export type ApiSettingsTabProps = {
  settings: ApiSettings;
  isReadonly: boolean;
  isExecuting: boolean;
  responseError: string;
  onChange: (settings: ApiSettings) => void;
  onRunApi: () => void;
};

function ApiSettingsTabFields({
  settings,
  isReadonly,
  isExecuting,
  responseError,
  onChange,
  onRunApi,
  targetField,
}: ApiSettingsTabProps & { targetField?: ReactNode }) {
  const { t } = useTranslation();

  return (
    <Stack spacing={2}>
      <TextField
        slotProps={{
          input: {
            readOnly: false,
            endAdornment: settings.apiId ? (
              <InputAdornment position="end">
                <IconButton
                  edge="end"
                  size="small"
                  aria-label={t("Clear API settings")}
                  onClick={() =>
                    onChange({
                      ...settings,
                      apiId: "",
                      apiData: null,
                      method: "",
                      url: "",
                      headers: "",
                      body: "{}",
                      responseMapping: [],
                      eventType: "",
                      parameterId: "",
                      optionalParameter: [],
                      responsePath: "",
                      ...(settings.mode === "target"
                        ? { targetElementId: "" }
                        : {}),
                    })
                  }
                >
                  <CloseIcon fontSize="small" />
                </IconButton>
              </InputAdornment>
            ) : undefined,
          },
        }}
        label={t("API ID")}
        size="small"
        fullWidth
        value={settings.apiId}
        onChange={(event) =>
          onChange({
            ...settings,
            apiId: event.target.value,
          })
        }
      />
      <TextField
        label={t("URL")}
        size="small"
        fullWidth
        value={settings.url}
        onChange={(event) =>
          onChange({
            ...settings,
            url: event.target.value,
          })
        }
      />
      <Box>
        <Stack
          direction="row"
          sx={{
            alignItems: "center",
            justifyContent: "space-between",
            ...{ mb: 1 },
          }}
        >
          <Typography sx={{ color: "text.secondary" }} variant="caption">
            {t("Optional Parameter")}
          </Typography>
          <IconButton
            size="small"
            disabled={isReadonly}
            aria-label={t("Add parameter")}
            onClick={() =>
              onChange({
                ...settings,
                optionalParameter: [
                  ...settings.optionalParameter,
                  {
                    id: `parameter-${Date.now()}-${settings.optionalParameter.length}`,
                    key: "",
                    value: "",
                  },
                ],
              })
            }
            sx={{ width: 28, height: 28 }}
          >
            <AddIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Stack>
        <Stack spacing={1}>
          {settings.optionalParameter.map((parameter) => (
            <Stack
              sx={{ alignItems: "center" }}
              key={parameter.id}
              direction="row"
              spacing={1}
            >
              <TextField
                label={t("Key")}
                size="small"
                value={parameter.key}
                disabled={isReadonly}
                onChange={(event) =>
                  onChange({
                    ...settings,
                    optionalParameter: settings.optionalParameter.map((item) =>
                      item.id === parameter.id
                        ? { ...item, key: event.target.value }
                        : item,
                    ),
                  })
                }
                sx={{ flex: 1 }}
              />
              <TextField
                label={t("Value")}
                size="small"
                value={parameter.value}
                disabled={isReadonly}
                onChange={(event) =>
                  onChange({
                    ...settings,
                    optionalParameter: settings.optionalParameter.map((item) =>
                      item.id === parameter.id
                        ? { ...item, value: event.target.value }
                        : item,
                    ),
                  })
                }
                sx={{ flex: 1 }}
              />
              <IconButton
                size="small"
                color="error"
                disabled={isReadonly}
                aria-label={t("Delete parameter")}
                onClick={() =>
                  onChange({
                    ...settings,
                    optionalParameter: settings.optionalParameter.filter(
                      (item) => item.id !== parameter.id,
                    ),
                  })
                }
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Stack>
          ))}
        </Stack>
      </Box>
      {targetField}
      {/* 
      <TextField
        label={t('Response Path')}
        helperText={t(
          'Optional dot path to map from the response, for example data.items',
        )}
        size="small"
        fullWidth
        disabled={isReadonly}
        value={settings.responsePath}
        onChange={(event) =>
          onChange({ ...settings, responsePath: event.target.value })
        }
      />
      */}
      {responseError ? <Alert severity="error">{responseError}</Alert> : null}
      <Button
        variant="outlined"
        size="small"
        sx={{ fontSize: "10px" }}
        disabled={isReadonly || isExecuting}
        onClick={onRunApi}
        startIcon={isExecuting ? <CircularProgress size={14} /> : undefined}
      >
        {t("Run API")}
      </Button>
    </Stack>
  );
}

export default ApiSettingsTabFields;
