import { useState } from "react";
import { Checkbox, FormControlLabel, Stack, TextField } from "@mui/material";
import { useTranslation } from "@/app/(builder)/hooks/useTranslation";

import { FormElement } from "../type";

function ElementDefaultProperty({
  element,
  onChange,
  isReadonly = false,
}: {
  element: FormElement;
  onChange: (id: string, key: string, value: unknown) => void;
  isReadonly?: boolean;
}) {
  const { t } = useTranslation();

  return (
    <Stack spacing={2}>
      <TextField
        slotProps={{ input: { readOnly: true } }}
        label={t("Element ID")}
        size="small"
        fullWidth
        value={element.id}
      />
      <TextField
        label={`${t("Label")} *`}
        size="small"
        fullWidth
        disabled={isReadonly}
        value={element.label}
        onChange={(event) => onChange(element.id, "label", event.target.value)}
      />
      <TextField
        label={`${t("Name")} (Slot Key)`}
        size="small"
        fullWidth
        disabled={isReadonly}
        value={element.name}
        onChange={(event) => onChange(element.id, "name", event.target.value)}
      />
      <TextField
        label={`${t("Description")} (Tooltip)`}
        size="small"
        fullWidth
        disabled={isReadonly}
        value={element.description ?? ""}
        onChange={(event) =>
          onChange(element.id, "description", event.target.value)
        }
      />
      {element.type !== "grid" && element.type !== "search" && (
        <FormControlLabel
          control={
            <Checkbox
              size="small"
              checked={element.requires ?? false}
              disabled={isReadonly}
              onChange={(event) =>
                onChange(element.id, "requires", event.target.checked)
              }
            />
          }
          label={t("Requires")}
        />
      )}
    </Stack>
  );
}

export default ElementDefaultProperty;
