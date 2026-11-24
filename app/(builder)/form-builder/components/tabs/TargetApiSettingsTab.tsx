import { FormControl, InputLabel, MenuItem, Select } from "@mui/material";
import { useTranslation } from "@/app/(builder)/hooks/useTranslation";

import ApiSettingsTabFields, {
  type ApiSettingsTabProps,
} from "./ApiSettingsTabFields";

import type {
  ElementApiSettings,
  FormElement,
  TargetApiSettings,
} from "../../type";

function TargetApiSettingsTab({
  elements,
  onTargetElementChange,
  ...props
}: ApiSettingsTabProps & {
  elements: FormElement[];
  sourceElementId: string;
  onTargetElementChange: (targetElementId: string) => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const { settings, isReadonly, onChange } = props;
  const targetSettings = settings as TargetApiSettings;

  return (
    <ApiSettingsTabFields
      {...props}
      targetField={
        <>
          <FormControl fullWidth size="small">
            <InputLabel id="target-element-id-label">
              {t("Target Element ID")}
            </InputLabel>
            <Select
              labelId="target-element-id-label"
              label={t("Target Element ID")}
              disabled={isReadonly}
              value={targetSettings.targetElementId}
              onChange={(event) =>
                void onTargetElementChange(event.target.value)
              }
            >
              <MenuItem value="">
                <em>{t("None")}</em>
              </MenuItem>
              {elements
                .filter((item) => item.id !== props.sourceElementId)
                .map((item) => (
                  <MenuItem key={item.id} value={item.id}>
                    {item.label || item.id} ({item.type})
                  </MenuItem>
                ))}
            </Select>
          </FormControl>
          <FormControl fullWidth size="small">
            <InputLabel id="api-event-type-label">{t("event type")}</InputLabel>
            <Select
              labelId="api-event-type-label"
              label={t("event type")}
              disabled={isReadonly || !targetSettings.targetElementId}
              value={settings.eventType}
              onChange={(event) =>
                onChange({
                  ...settings,
                  eventType: event.target
                    .value as ElementApiSettings["eventType"],
                })
              }
            >
              <MenuItem value="">
                <em>{t("None")}</em>
              </MenuItem>
              <MenuItem value="onChange">onChange</MenuItem>
            </Select>
          </FormControl>
        </>
      }
    />
  );
}

export default TargetApiSettingsTab;
