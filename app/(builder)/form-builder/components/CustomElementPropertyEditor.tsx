import { useState } from "react";
import { Box, Stack, Tab, Tabs } from "@mui/material";
import { useTranslation } from "@/app/(builder)/hooks/useTranslation";

import ApiResponseMappingModal from "./modals/ApiResponseMappingModal";
import BindApiSettingsTab from "./tabs/BindApiSettingsTab";
import TargetApiSettingsTab from "./tabs/TargetApiSettingsTab";
import {
  createBindApiSettings,
  createTargetApiSettings,
  type DisplayValue,
  type ApiSettings,
  type ApiParameterEntry,
  type FormElement,
  type GridElement,
} from "../type";

import type { NxApis, NxMethod } from "../type/nxApis";
import { useModal } from "@/app/(builder)/providers/ModalProvider";

export const getElementDefaultValue = (element: FormElement): unknown => {
  if ("defaultValue" in element) return element.defaultValue;
  return "";
};

const getNestedValue = (value: unknown, path: string): unknown => {
  if (!path.trim()) return value;

  return path
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter(Boolean)
    .reduce<unknown>((currentValue, key) => {
      if (currentValue == null) return undefined;

      if (Array.isArray(currentValue)) {
        return currentValue[Number(key)];
      }

      if (typeof currentValue === "object") {
        return (currentValue as Record<string, unknown>)[key];
      }

      return undefined;
    }, value);
};

const getMappableResponseValue = (
  response: unknown,
  responsePath?: string,
): unknown => {
  if (responsePath?.trim()) {
    return getNestedValue(response, responsePath);
  }

  if (!response || typeof response !== "object" || Array.isArray(response)) {
    return response;
  }

  const responseObject = response as Record<string, unknown>;
  for (const key of ["data", "result", "items", "list", "rows"]) {
    if (key in responseObject) return responseObject[key];
  }

  return response;
};

const stringifyValue = (value: unknown): string => {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const preferredValue =
      record.value ?? record.label ?? record.name ?? record.title ?? record.id;
    if (preferredValue != null) return stringifyValue(preferredValue);
  }

  return JSON.stringify(value);
};

const normalizeOptions = (value: unknown): DisplayValue[] => {
  const source = Array.isArray(value)
    ? value
    : value && typeof value === "object"
      ? Object.entries(value as Record<string, unknown>).map(([key, item]) => ({
          value: key,
          label: stringifyValue(item),
        }))
      : value != null
        ? [value]
        : [];

  return source
    .map((item, index): DisplayValue | null => {
      if (typeof item === "string") return { value: item, label: item };
      if (typeof item === "number" || typeof item === "boolean") {
        const text = String(item);
        return { value: text, label: text };
      }
      if (!item || typeof item !== "object") return null;

      const record = item as Record<string, unknown>;
      const valueCandidate =
        record.value ?? record.id ?? record.code ?? record.key ?? index + 1;
      const labelCandidate =
        record.label ??
        record.name ??
        record.title ??
        record.text ??
        valueCandidate;

      return {
        value: stringifyValue(valueCandidate),
        label: stringifyValue(labelCandidate),
      };
    })
    .filter((item): item is DisplayValue => Boolean(item));
};

const normalizeStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map(stringifyValue).filter(Boolean);
  const text = stringifyValue(value);
  return text ? [text] : [];
};

const formatDateValue = (value: unknown): string => {
  const text = stringifyValue(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;

  return date.toISOString().slice(0, 10);
};

const mapOptionsByKeys = (
  value: unknown,
  labelKey?: string,
  valueKey?: string,
): DisplayValue[] => {
  if (!Array.isArray(value) || !labelKey || !valueKey) return [];

  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];

    const row = item as Record<string, unknown>;
    return [
      {
        label: stringifyValue(row[labelKey]),
        value: stringifyValue(row[valueKey]),
      },
    ];
  });
};

export const mapResponseToTargetElement = (
  targetElement: FormElement,
  response: unknown,
  responsePath?: string,
): FormElement => {
  const value = getMappableResponseValue(response, responsePath);

  switch (targetElement.type) {
    case "input":
    case "search":
      return {
        ...targetElement,
        defaultValue: stringifyValue(Array.isArray(value) ? value[0] : value),
      };
    case "date":
      return {
        ...targetElement,
        defaultValue: formatDateValue(Array.isArray(value) ? value[0] : value),
      };
    case "checkbox": {
      const boundValue = targetElement.optionLabelKey
        ? getMappableResponseValue(
            response,
            targetElement.optionsSlot || responsePath,
          )
        : value;
      const options = targetElement.optionLabelKey
        ? mapOptionsByKeys(
            boundValue,
            targetElement.optionLabelKey,
            targetElement.optionValueKey,
          )
        : normalizeOptions(value);
      const optionValues = options.map((option) => option.value);
      const defaultValue = targetElement.optionLabelKey
        ? targetElement.defaultValue.filter((item) =>
            optionValues.includes(item),
          )
        : normalizeStringArray(
            Array.isArray(value)
              ? value.map((item) => stringifyValue(item))
              : value,
          );

      return {
        ...targetElement,
        options: options.length ? options : targetElement.options,
        defaultValue,
      };
    }
    case "radio": {
      const boundValue = targetElement.optionLabelKey
        ? getMappableResponseValue(
            response,
            targetElement.optionsSlot || responsePath,
          )
        : value;
      const options = targetElement.optionLabelKey
        ? mapOptionsByKeys(
            boundValue,
            targetElement.optionLabelKey,
            targetElement.optionValueKey,
          )
        : normalizeOptions(value);

      const optionValues = options.map((option) => option.value);
      const defaultValue = targetElement.optionLabelKey
        ? targetElement.defaultValue.filter((item) =>
            optionValues.includes(item),
          )
        : normalizeStringArray(
            Array.isArray(value)
              ? value.map((item) => stringifyValue(item))
              : value,
          );

      return {
        ...targetElement,
        options: options.length ? options : targetElement.options,
        defaultValue,
      };
    }
    case "dropbox": {
      const boundValue = targetElement.optionLabelKey
        ? getMappableResponseValue(
            response,
            targetElement.optionsSlot || responsePath,
          )
        : value;
      const options = targetElement.optionLabelKey
        ? mapOptionsByKeys(
            boundValue,
            targetElement.optionLabelKey,
            targetElement.optionValueKey,
          )
        : normalizeOptions(value);
      const selectedValues = targetElement.optionLabelKey
        ? normalizeStringArray(targetElement.defaultValue).filter((item) =>
            options.some((option) => option.value === item),
          )
        : normalizeStringArray(value);

      return {
        ...targetElement,
        options: options.length ? options : targetElement.options,
        defaultValue:
          targetElement.selectKind === "multi"
            ? selectedValues
            : (selectedValues[0] ?? ""),
      };
    }
    case "grid": {
      const rows = Array.isArray(value) ? value : value != null ? [value] : [];
      const firstObject = rows.find(
        (item) => item && typeof item === "object" && !Array.isArray(item),
      ) as Record<string, unknown> | undefined;
      const firstArray = rows.find(Array.isArray) as unknown[] | undefined;
      const displayKeys = firstObject
        ? Object.keys(firstObject).map((key) => ({ key, label: key }))
        : firstArray
          ? firstArray.map((_, index) => ({
              key: String(index),
              label: `Column ${index + 1}`,
            }))
          : targetElement.displayKeys.length
            ? targetElement.displayKeys
            : [{ key: "value", label: "Value" }];
      const columns = Math.max(displayKeys.length, 1);
      const headerData = displayKeys.map((item) => item.label);
      const bodyData = rows.flatMap((row) => {
        if (row && typeof row === "object" && !Array.isArray(row)) {
          return displayKeys.map((item) =>
            stringifyValue((row as Record<string, unknown>)[item.key]),
          );
        }
        if (Array.isArray(row)) {
          return displayKeys.map((_, index) => stringifyValue(row[index]));
        }
        return [
          stringifyValue(row),
          ...Array.from({ length: columns - 1 }, () => ""),
        ];
      });
      const gridData = rows.length ? [...headerData, ...bodyData] : headerData;

      return {
        ...targetElement,
        rows: Math.max(rows.length + 1, 1),
        columns,
        displayKeys,
        data: gridData.length ? gridData : targetElement.data,
      };
    }
    default:
      return targetElement;
  }
};

const getSelectedResponseKey = (selectedPath: string): string => {
  if (selectedPath === "$") return "data";

  const pathParts = selectedPath
    .replace(/\]$/, "")
    .replaceAll("[", ".")
    .split(".");

  return pathParts[pathParts.length - 1] || "data";
};

const mapResponseSelectionToGrid = (
  targetElement: GridElement,
  selectedValue: unknown,
  selectedPath: string,
): GridElement => {
  const selectedKey = getSelectedResponseKey(selectedPath);
  const rows = Array.isArray(selectedValue)
    ? selectedValue
    : selectedValue != null
      ? [selectedValue]
      : [];

  return {
    ...(mapResponseToTargetElement(
      targetElement,
      selectedValue,
    ) as GridElement),
    optionsSlot: selectedKey,
    sampleJson: JSON.stringify({ [selectedKey]: rows }, null, 2),
  };
};

const getOptionColumnKeys = (value: unknown): string[] => {
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

const interpolatePayloadText = (
  text: string,
  values: Record<string, unknown>,
) =>
  text.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, key: string) =>
    stringifyValue(values[key.trim()]),
  );

export const parseOptionalParameter = (
  rawValue: string | ApiParameterEntry[] | undefined,
  values: Record<string, unknown>,
) => {
  if (Array.isArray(rawValue)) {
    return Object.fromEntries(
      rawValue.flatMap((entry) => {
        const key = entry.key.trim();
        if (!key) return [];
        const interpolated = interpolatePayloadText(entry.value, values);
        let value: unknown = interpolated;
        try {
          value = JSON.parse(interpolated);
        } catch {
          // Plain text parameter values remain strings.
        }
        return [[key, value] as const];
      }),
    );
  }

  const text = rawValue?.trim();
  if (!text) return {};

  const parsed = JSON.parse(interpolatePayloadText(text, values));
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>;
  }

  throw new Error("Optional Parameter must be a JSON object.");
};

function CustomElementPropertyEditor({
  element,
  elements,
  onChange,
  onGridSizeChange,
  isReadonly = false,
}: {
  element: FormElement;
  elements: FormElement[];
  onChange: (element: FormElement) => void;
  onGridSizeChange: (
    element: GridElement,
    key: "rows" | "columns",
    value: number,
  ) => void;
  isReadonly?: boolean;
}) {
  const { t } = useTranslation();
  const { showAlert, showConfirm } = useModal();
  const [isExecuting, setIsExecuting] = useState(false);
  const [responseData, setResponseData] = useState<unknown>(null);
  const [responseError, setResponseError] = useState("");
  const [isResponseDialogOpen, setIsResponseDialogOpen] = useState(false);
  const [isApplyToSelfDialogOpen, setIsApplyToSelfDialogOpen] = useState(false);
  const [selectedResponsePath, setSelectedResponsePath] = useState<
    string | null
  >(null);
  const [selectedResponseValue, setSelectedResponseValue] = useState<unknown>();
  const [selectedOptionKey, setSelectedOptionKey] = useState("");
  const [selectedOptionValue, setSelectedOptionValue] = useState("");
  const [apiSettingsTab, setApiSettingsTab] = useState<"bind" | "target">(
    element.targetApi.targetElementId ? "target" : "bind",
  );
  void onGridSizeChange;

  const activeApiSettings =
    apiSettingsTab === "bind" ? element.bindApi : element.targetApi;
  const targetElement =
    apiSettingsTab === "target"
      ? (elements.find(
          (item) => item.id === element.targetApi.targetElementId,
        ) ?? null)
      : null;
  const canApplyResponseToSelf = [
    "checkbox",
    "radio",
    "dropbox",
    "grid",
  ].includes(element.type);
  const isOptionTarget = Boolean(
    targetElement &&
      ["checkbox", "radio", "dropbox"].includes(targetElement.type),
  );
  const isOptionSelf = ["checkbox", "radio", "dropbox"].includes(element.type);
  const optionColumnKeys = getOptionColumnKeys(selectedResponseValue);
  const canApplyToTarget = Boolean(
    targetElement &&
      selectedResponsePath !== null &&
      (!isOptionTarget || (selectedOptionKey && selectedOptionValue)),
  );
  const canApplyToSelf = Boolean(
    selectedResponsePath !== null &&
      (!isOptionSelf || (selectedOptionKey && selectedOptionValue)),
  );

  const getParameterQueryParams = (
    parameterId: string | undefined,
    currentValue: unknown,
  ) => {
    const key = parameterId?.trim();
    if (!key) return {};

    return {
      [key]: currentValue,
    };
  };

  const buildRequestPayload = () => {
    const sourceValues = Object.fromEntries(
      elements.flatMap((item) => {
        const value = getElementDefaultValue(item);
        return [
          [item.id, value],
          ...(item.name ? [[item.name, value] as const] : []),
        ];
      }),
    );

    return {
      ...parseOptionalParameter(activeApiSettings.body, sourceValues),
      ...parseOptionalParameter(
        activeApiSettings.optionalParameter,
        sourceValues,
      ),
    };
  };

  const handleApiSettingsChange = (settings: ApiSettings) => {
    if (settings.mode === "bind") {
      onChange({
        ...element,
        bindApi: { ...element.bindApi, ...settings },
      });
    } else {
      onChange({
        ...element,
        targetApi: { ...element.targetApi, ...settings },
      });
    }
  };

  const handleOpenBindApiModal = async () => {
    const conflictingElements = elements.filter(
      (item) =>
        item.id !== element.id &&
        item.targetApi.targetElementId === element.id &&
        Boolean(item.targetApi.apiId),
    );

    if (conflictingElements.length) {
      const confirmed = await showConfirm(
        t(
          "Another element is sending Target API data to this element. Clear that Target API configuration and continue?",
        ),
      );
      if (!confirmed) return;

      conflictingElements.forEach((item) =>
        onChange({ ...item, targetApi: createTargetApiSettings() }),
      );
    }
  };

  const handleTargetElementChange = async (targetElementId: string) => {
    if (!targetElementId) {
      handleApiSettingsChange({
        ...element.targetApi,
        targetElementId: "",
      });
      return;
    }

    const nextTarget = elements.find((item) => item.id === targetElementId);
    if (!nextTarget) return;

    if (nextTarget.bindApi.apiId) {
      const confirmed = await showConfirm(
        t(
          "The selected target element already has a Bind API. Clear its Bind API configuration and continue?",
        ),
      );
      if (!confirmed) return;
      onChange({ ...nextTarget, bindApi: createBindApiSettings() });
    }

    handleApiSettingsChange({
      ...element.targetApi,
      targetElementId,
    });
  };

  const applyResponseToTarget = () => {
    if (!targetElement || selectedResponsePath === null) {
      setResponseError(t("Target Element ID is required."));
      return;
    }

    if (
      (targetElement.type === "checkbox" ||
        targetElement.type === "radio" ||
        targetElement.type === "dropbox") &&
      Array.isArray(selectedResponseValue)
    ) {
      if (!selectedOptionKey || !selectedOptionValue) return;

      const optionsSlot = getSelectedResponseKey(selectedResponsePath);

      onChange({
        ...targetElement,
        options: [],
        optionsSlot,
        optionLabelKey: selectedOptionKey,
        optionValueKey: selectedOptionValue,
        sampleJson: JSON.stringify(
          { [optionsSlot]: selectedResponseValue },
          null,
          2,
        ),
      });
    } else if (targetElement.type === "grid") {
      onChange(
        mapResponseSelectionToGrid(
          targetElement,
          selectedResponseValue,
          selectedResponsePath,
        ),
      );
    } else {
      onChange(
        mapResponseToTargetElement(targetElement, selectedResponseValue),
      );
    }

    setIsResponseDialogOpen(false);
  };

  const applyResponseToSelf = () => {
    if (selectedResponsePath === null) return;

    if (
      (element.type === "checkbox" ||
        element.type === "radio" ||
        element.type === "dropbox") &&
      Array.isArray(selectedResponseValue)
    ) {
      if (!selectedOptionKey || !selectedOptionValue) return;

      const optionsSlot = getSelectedResponseKey(selectedResponsePath);

      onChange({
        ...element,
        options: [],
        optionsSlot,
        optionLabelKey: selectedOptionKey,
        optionValueKey: selectedOptionValue,
        sampleJson: JSON.stringify(
          { [optionsSlot]: selectedResponseValue },
          null,
          2,
        ),
      });
    } else if (element.type === "grid") {
      onChange(
        mapResponseSelectionToGrid(
          element,
          selectedResponseValue,
          selectedResponsePath,
        ),
      );
    } else {
      onChange(mapResponseToTargetElement(element, selectedResponseValue));
    }
    setIsApplyToSelfDialogOpen(false);
  };

  const applyResponseToSelfAsStatic = () => {
    if (selectedResponsePath === null) return;

    if (
      (element.type === "checkbox" ||
        element.type === "radio" ||
        element.type === "dropbox") &&
      Array.isArray(selectedResponseValue)
    ) {
      if (!selectedOptionKey || !selectedOptionValue) return;

      onChange({
        ...element,
        options: mapOptionsByKeys(
          selectedResponseValue,
          selectedOptionKey,
          selectedOptionValue,
        ),
        optionsSlot: "",
        optionLabelKey: "",
        optionValueKey: "",
        sampleJson: "",
      });
    } else {
      const mappedElement = mapResponseToTargetElement(
        element,
        selectedResponseValue,
      );

      onChange(
        mappedElement.type === "grid"
          ? { ...mappedElement, optionsSlot: "", sampleJson: "" }
          : mappedElement,
      );
    }

    setIsApplyToSelfDialogOpen(false);
  };

  const fnCustomElementUI = () => {
    return (
      <Stack spacing={2}>
        <ApiResponseMappingModal
          open={isResponseDialogOpen}
          title={t("Apply API Response to Target Element")}
          instruction={t(
            "Select the response key to connect to the target element.",
          )}
          responseData={responseData}
          responseError={responseError}
          isExecuting={isExecuting}
          selectedPath={selectedResponsePath}
          onSelect={(path, value) => {
            setSelectedResponsePath(path);
            setSelectedResponseValue(value);
            setSelectedOptionKey("");
            setSelectedOptionValue("");
          }}
          isOptionsElement={isOptionTarget}
          optionColumnKeys={optionColumnKeys}
          selectedLabelKey={selectedOptionKey}
          selectedValueKey={selectedOptionValue}
          onLabelKeyChange={setSelectedOptionKey}
          onValueKeyChange={setSelectedOptionValue}
          actions={[
            {
              label: t("Apply to Target"),
              onClick: applyResponseToTarget,
              disabled: !canApplyToTarget || isReadonly,
            },
          ]}
          onClose={() => setIsResponseDialogOpen(false)}
        />
        <ApiResponseMappingModal
          open={isApplyToSelfDialogOpen}
          title={t("Apply API Response to Current Element")}
          instruction={t(
            "No target element is selected. Select the response key to connect to the current element.",
          )}
          responseData={responseData}
          selectedPath={selectedResponsePath}
          onSelect={(path, value) => {
            setSelectedResponsePath(path);
            setSelectedResponseValue(value);
            setSelectedOptionKey("");
            setSelectedOptionValue("");
          }}
          isOptionsElement={isOptionSelf}
          optionColumnKeys={optionColumnKeys}
          selectedLabelKey={selectedOptionKey}
          selectedValueKey={selectedOptionValue}
          onLabelKeyChange={setSelectedOptionKey}
          onValueKeyChange={setSelectedOptionValue}
          actions={[
            {
              label: t("Apply as Static Data"),
              onClick: applyResponseToSelfAsStatic,
              disabled: !canApplyToSelf || isReadonly,
              variant: "outlined",
            },
            {
              label: t("Apply as Dynamic Data"),
              onClick: applyResponseToSelf,
              disabled: !canApplyToSelf || isReadonly,
            },
          ]}
          onClose={() => setIsApplyToSelfDialogOpen(false)}
        />
        <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
          <Tabs
            value={apiSettingsTab}
            onChange={(_, value: "bind" | "target") => setApiSettingsTab(value)}
            variant="fullWidth"
          >
            <Tab value="bind" label={t("Bind")} />
            <Tab value="target" label={t("Target")} />
          </Tabs>
        </Box>
        {apiSettingsTab === "bind" ? (
          <BindApiSettingsTab
            settings={element.bindApi}
            isReadonly={isReadonly}
            isExecuting={isExecuting}
            responseError={responseError}
            onChange={handleApiSettingsChange}
            onRunApi={() => void handleRunApi()}
          />
        ) : (
          <TargetApiSettingsTab
            settings={element.targetApi}
            elements={elements}
            sourceElementId={element.id}
            onTargetElementChange={handleTargetElementChange}
            isReadonly={isReadonly}
            isExecuting={isExecuting}
            responseError={responseError}
            onChange={handleApiSettingsChange}
            onRunApi={() => void handleRunApi()}
          />
        )}
      </Stack>
    );
  };

  const handleRunApi = async () => {
    const mockMethod = "post";
    const mockHeaders = `{
  "Content-Type":"application/json",
  "Accept":"application/json",
  "Authorization":"Bearer nxhub_-8-pD2JS8FU92Ej2vN_FIZAhNUWgYSSYQGdNxDc3neE"
}`;
    const mockUrl = "/api/v1/hub/nx";
    const endpoint = mockUrl;

    const method = activeApiSettings.method.trim() || mockMethod;
    const httpMethod = method.toLowerCase() as NxMethod;
    const headersStr = activeApiSettings.headers.trim() || mockHeaders;
    // apiData에 method(get, post, put, delete, patch) 및 headers, body 데이터가 없음.
    // console.log("============> ", endpoint)
    if (!endpoint) {
      setResponseError(t("Endpoint is required."));
      return;
    }
    if (!httpMethod) {
      setResponseError(t("HTTP method is required."));
      return;
    }
    if (!headersStr) {
      setResponseError(t("Headers are required."));
      return;
    }
    if (apiSettingsTab === "target" && !targetElement) {
      setResponseError(t("Target Element ID is required."));
      return;
    }

    setResponseError("");
    if (isOptionTarget) {
      setResponseData(null);
      setSelectedResponsePath(null);
      setSelectedResponseValue(undefined);
      setSelectedOptionKey("");
      setSelectedOptionValue("");
      setIsApplyToSelfDialogOpen(false);
      setIsResponseDialogOpen(true);
    }
    setIsExecuting(true);

    try {
      const parsedHeaders = JSON.parse(mockHeaders); // JSON.parse(headersStr);
      const payload = buildRequestPayload();
      const parameterParams = getParameterQueryParams(
        activeApiSettings.parameterId,
        getElementDefaultValue(element),
      );
      // nx용 mockbody 데이터
      const mockBody = {
        header: {
          uri: activeApiSettings.url.trim(),
          caller: "chatbuilder",
        },
        ChatbotRequestDto: {
          ...payload,
          ...parameterParams,
        },
      };
      const abortCtrl = new AbortController();
      const response = await fetch(endpoint, {
        method: mockMethod,
        headers: parsedHeaders,
        body: JSON.stringify(mockBody),
        credentials: "same-origin",
        signal: abortCtrl.signal,
      });
      const responseData = await response.json();

      // if (httpMethod === 'get' || httpMethod === 'delete') {
      //   response = await apiClient[httpMethod](endpoint, {
      //     params: mockBody,
      //     headers: parsedHeaders,
      //   });
      // } else {
      //   response = await apiClient[httpMethod](endpoint, payload, {
      //     params: mockBody,
      //     headers: parsedHeaders,
      //   });
      // }

      setResponseData(responseData.data.result.body);
      setSelectedResponsePath(null);
      setSelectedResponseValue(undefined);
      setSelectedOptionKey("");
      setSelectedOptionValue("");
      if (!targetElement && canApplyResponseToSelf) {
        setIsApplyToSelfDialogOpen(true);
      } else {
        setIsResponseDialogOpen(true);
      }
    } catch (error) {
      setResponseError(
        error instanceof Error ? error.message : t("API request failed."),
      );
    } finally {
      setIsExecuting(false);
    }
  };

  switch (element.type) {
    case "input":
    case "date":
    case "checkbox":
    case "radio":
    case "dropbox":
    case "grid":
      return fnCustomElementUI();
    case "search":
      break;
    default:
      return null;
  }
}

export default CustomElementPropertyEditor;
