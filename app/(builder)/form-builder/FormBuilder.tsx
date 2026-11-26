"use client";

import React, {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  Tab,
  Tabs,
  Chip,
  Box,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Paper,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Checkbox,
} from "@mui/material";
import { useRouter, useSearchParams } from "next/navigation";
import { formDefinition, formListReturn, getForm } from "../services/forms";
import { registerDraftGuard } from "../services/draftGuard";
import { Layers as LayersIcon } from "@mui/icons-material";
import {
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { useTranslation } from "@/app/(builder)/hooks/useTranslation";

import {
  DisplayKey,
  DisplayValue,
  FormDataJson,
  InputElement,
  LOCALE_LIST,
  type LOCALE_TIME,
  type LOCALE_TIME_TYPE,
  type ElementType,
  type ElementApiSettings,
  type FormElement,
  type BindApiSettings,
  type TargetApiSettings,
} from "./type";
import SavedFormContentModal from "./components/modals/SavedFormContentModal";
import Canvas from "./components/Canvas";
import LeftPanel from "./components/LeftPanel";
import RightPanel from "./components/RightPanel";
import JsonPanel from "./components/JsonPanel";
import {
  getElementDefaultValue,
  mapResponseToTargetElement,
  parseOptionalParameter,
} from "./components/CustomElementPropertyEditor";
import {
  FORM_ELEMENT_REGISTRY,
  FORM_ELEMENT_TYPES,
} from "./stores/elementRegistry";
import { useFormEditorStore } from "./stores/useFormEditorStore";
import { toLocaleTimeValue } from "./utils/dateTimestamp";

import type { NxMethod } from "./type/nxApis";

import apiClient from "@/app/(builder)/services/apiClient";
import { useModal } from "@/app/(builder)/providers/ModalProvider";

const createId = (type: string) =>
  `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const createFormId = () => createId("form");

const isElementType = (value: unknown): value is ElementType =>
  typeof value === "string" &&
  FORM_ELEMENT_TYPES.includes(value as ElementType);

const isLocaleTime = (value: unknown): value is LOCALE_TIME =>
  LOCALE_LIST.some((item) => item.value === value);

const isLocaleTimeValue = (value: unknown): value is LOCALE_TIME_TYPE =>
  value !== null &&
  typeof value === "object" &&
  "date" in value &&
  typeof value.date === "number" &&
  "locale" in value &&
  isLocaleTime(value.locale);

const normalizeDisplayValues = (
  value: unknown,
  fallback: DisplayValue[],
): DisplayValue[] => {
  if (!Array.isArray(value)) return fallback;

  const displayValues = value
    .map((item) => {
      if (typeof item === "string") {
        return {
          value: item,
          label: item,
        };
      }

      if (!item || typeof item !== "object") return null;

      const displayValue = item as Partial<DisplayValue>;
      if (!displayValue.value) return null;

      return {
        value: String(displayValue.value),
        label: displayValue.label
          ? String(displayValue.label)
          : String(displayValue.value),
        param:
          typeof displayValue.param === "string"
            ? displayValue.param
            : undefined,
      };
    })
    .filter((item): item is DisplayValue => Boolean(item));

  return displayValues.length ? displayValues : fallback;
};

const normalizeElement = (value: unknown): FormElement | null => {
  if (!value || typeof value !== "object") return null;

  const element = value as Partial<FormElement> & Record<string, unknown>;
  if (!isElementType(element.type)) return null;

  const normalizeApiSettings = (
    settings: unknown,
    legacy: Record<string, unknown>,
  ): ElementApiSettings => {
    const source =
      settings && typeof settings === "object" && !Array.isArray(settings)
        ? (settings as Record<string, unknown>)
        : legacy;
    return {
      apiId: typeof source.apiId === "string" ? source.apiId : "",
      apiData:
        source.apiData &&
        typeof source.apiData === "object" &&
        !Array.isArray(source.apiData)
          ? (source.apiData as Record<string, unknown>)
          : null,
      method:
        typeof source.method === "string"
          ? source.method
          : source.apiData &&
              typeof source.apiData === "object" &&
              "method" in source.apiData &&
              typeof source.apiData.method === "string"
            ? source.apiData.method
            : "",
      url:
        typeof source.url === "string"
          ? source.url
          : typeof source.endpoint === "string"
            ? source.endpoint
            : source.apiData &&
                typeof source.apiData === "object" &&
                "endPoint" in source.apiData &&
                typeof source.apiData.endPoint === "string"
              ? source.apiData.endPoint
              : "",
      headers:
        typeof source.headers === "string"
          ? source.headers
          : source.apiData &&
              typeof source.apiData === "object" &&
              "headers" in source.apiData &&
              typeof source.apiData.headers === "string"
            ? source.apiData.headers
            : "",
      body: typeof source.body === "string" ? source.body : "{}",
      responseMapping: Array.isArray(source.responseMapping)
        ? source.responseMapping.filter(
            (item): item is { path: string; slot: string } =>
              Boolean(
                item &&
                  typeof item === "object" &&
                  "path" in item &&
                  typeof item.path === "string" &&
                  "slot" in item &&
                  typeof item.slot === "string",
              ),
          )
        : [],
      eventType:
        source.eventType === "onChange" || source.eventType === "onClick"
          ? source.eventType
          : "",
      parameterId:
        typeof source.parameterId === "string" ? source.parameterId : "",
      optionalParameter: Array.isArray(source.optionalParameter)
        ? source.optionalParameter.flatMap((item, index) => {
            if (!item || typeof item !== "object") return [];
            const entry = item as Record<string, unknown>;
            return typeof entry.key === "string"
              ? [
                  {
                    id:
                      typeof entry.id === "string"
                        ? entry.id
                        : `parameter-${index}`,
                    key: entry.key,
                    value: typeof entry.value === "string" ? entry.value : "",
                  },
                ]
              : [];
          })
        : typeof source.optionalParameter === "string" &&
            source.optionalParameter.trim()
          ? (() => {
              try {
                const parsed = JSON.parse(source.optionalParameter);
                return parsed &&
                  typeof parsed === "object" &&
                  !Array.isArray(parsed)
                  ? Object.entries(parsed).map(([key, value], index) => ({
                      id: `parameter-${index}`,
                      key,
                      value:
                        typeof value === "string"
                          ? value
                          : JSON.stringify(value),
                    }))
                  : [];
              } catch {
                return [];
              }
            })()
          : [],
      responsePath:
        typeof source.responsePath === "string" ? source.responsePath : "",
    };
  };

  const legacySettings = element as Record<string, unknown>;
  const legacyTargetId =
    typeof legacySettings.targetElementId === "string"
      ? legacySettings.targetElementId
      : "";
  const bindApi: BindApiSettings = {
    mode: "bind",
    ...normalizeApiSettings(
      element.bindApi,
      legacyTargetId ? {} : legacySettings,
    ),
  };
  const targetApiSource =
    element.targetApi &&
    typeof element.targetApi === "object" &&
    !Array.isArray(element.targetApi)
      ? (element.targetApi as unknown as Record<string, unknown>)
      : {};
  const targetApi: TargetApiSettings = {
    mode: "target",
    ...normalizeApiSettings(
      element.targetApi,
      legacyTargetId ? legacySettings : {},
    ),
    targetElementId:
      typeof targetApiSource.targetElementId === "string"
        ? targetApiSource.targetElementId
        : legacyTargetId,
  };

  const base = {
    id: typeof element.id === "string" ? element.id : createId(element.type),
    name: typeof element.name === "string" ? element.name : "",
    label: typeof element.label === "string" ? element.label : "",
    bindApi,
    targetApi,
    optionsSlot:
      typeof element.optionsSlot === "string" ? element.optionsSlot : "",
    optionLabelKey:
      typeof element.optionLabelKey === "string" ? element.optionLabelKey : "",
    optionValueKey:
      typeof element.optionValueKey === "string" ? element.optionValueKey : "",
    sampleJson:
      typeof element.sampleJson === "string" ? element.sampleJson : "",
    requires: Boolean(element.requires),
    description:
      typeof element.description === "string" ? element.description : "",
  };

  switch (element.type) {
    case "input":
      return {
        ...base,
        type: "input",
        validation: {
          type:
            element.validation &&
            typeof element.validation === "object" &&
            "type" in element.validation &&
            ["text", "email", "number", "custom"].includes(
              String(element.validation.type),
            )
              ? (element.validation.type as InputElement["validation"]["type"])
              : "text",
        },
        placeholder:
          typeof element.placeholder === "string" ? element.placeholder : "",
        defaultValue:
          typeof element.defaultValue === "string" ? element.defaultValue : "",
        regex: typeof element.regex === "string" ? element.regex : undefined,
        minLength:
          typeof element.minLength === "string" ? element.minLength : undefined,
        maxLength:
          typeof element.maxLength === "string" ? element.maxLength : undefined,
        transformTextType:
          element.transformTextType === "uppercase" ||
          element.transformTextType === "lowercase" ||
          element.transformTextType === "capitalize"
            ? element.transformTextType
            : "",
      };
    case "date": {
      const defaultValue =
        typeof element.defaultValue === "string" ? element.defaultValue : "";
      const dateValue =
        typeof element.dateValue === "string" && element.dateValue
          ? element.dateValue
          : defaultValue;
      const defaultFromValue =
        typeof element.defaultFromValue === "string"
          ? element.defaultFromValue
          : "";
      const defaultToValue =
        typeof element.defaultToValue === "string"
          ? element.defaultToValue
          : "";
      const hasTime = Boolean(element.hasTime);
      const locale = isLocaleTime(element.locale)
        ? element.locale
        : isLocaleTimeValue(element.value)
          ? element.value.locale
          : "ko";
      const defaultTimeValue =
        typeof element.defaultTimeValue === "string"
          ? element.defaultTimeValue
          : "";
      const defaultFromTimeValue =
        typeof element.defaultFromTimeValue === "string"
          ? element.defaultFromTimeValue
          : "";
      const defaultToTimeValue =
        typeof element.defaultToTimeValue === "string"
          ? element.defaultToTimeValue
          : "";
      const fromDateValue =
        typeof element.fromDateValue === "string" && element.fromDateValue
          ? element.fromDateValue
          : defaultFromValue || defaultValue;
      const toDateValue =
        typeof element.toDateValue === "string" && element.toDateValue
          ? element.toDateValue
          : defaultToValue;
      const fromTimeValue =
        typeof element.fromTimeValue === "string" && element.fromTimeValue
          ? element.fromTimeValue
          : defaultFromTimeValue || defaultTimeValue;
      const toTimeValue =
        typeof element.toTimeValue === "string" && element.toTimeValue
          ? element.toTimeValue
          : defaultToTimeValue || defaultTimeValue;

      return {
        ...base,
        type: "date",
        locale,
        defaultValue,
        dateValue,
        value: isLocaleTimeValue(element.value)
          ? { ...element.value, locale }
          : toLocaleTimeValue(dateValue, defaultTimeValue, hasTime, locale),
        fromValue: isLocaleTimeValue(element.fromValue)
          ? { ...element.fromValue, locale }
          : toLocaleTimeValue(fromDateValue, fromTimeValue, hasTime, locale),
        toValue: isLocaleTimeValue(element.toValue)
          ? { ...element.toValue, locale }
          : toLocaleTimeValue(toDateValue, toTimeValue, hasTime, locale),
        hasFromTo: Boolean(element.hasFromTo),
        defaultToDateOffset:
          typeof element.defaultToDateOffset === "number"
            ? element.defaultToDateOffset
            : undefined,
        defaultFromValue,
        defaultToValue,
        fromDateValue,
        toDateValue,
        hasTime,
        timeValue:
          typeof element.timeValue === "string"
            ? element.timeValue
            : defaultTimeValue,
        defaultTimeValue,
        defaultFromTimeValue,
        defaultToTimeValue,
        fromTimeValue,
        toTimeValue,
      };
    }
    case "checkbox":
      return {
        ...base,
        type: "checkbox",
        options: normalizeDisplayValues(element.options, [
          { value: "Option 1", label: "Option 1" },
          { value: "Option 2", label: "Option 2" },
        ]),
        defaultValue: Array.isArray(element.defaultValue)
          ? element.defaultValue.map(String)
          : typeof element.defaultValue === "string" && element.defaultValue
            ? [element.defaultValue]
            : [],
        optionLayout:
          element.optionLayout === "horizontal" ? "horizontal" : "vertical",
        optionsPerRow:
          typeof element.optionsPerRow === "number" && element.optionsPerRow > 0
            ? Math.min(20, Math.floor(element.optionsPerRow))
            : 2,
        sendByOption: element.sendByOption === true,
      };
    case "radio":
      return {
        ...base,
        type: "radio",
        options: normalizeDisplayValues(element.options, [
          { value: "Option 1", label: "Option 1" },
          { value: "Option 2", label: "Option 2" },
        ]),
        defaultValue: Array.isArray(element.defaultValue)
          ? element.defaultValue.map(String)
          : typeof element.defaultValue === "string" && element.defaultValue
            ? [element.defaultValue]
            : [],
        optionLayout:
          element.optionLayout === "horizontal" ? "horizontal" : "vertical",
        optionsPerRow:
          typeof element.optionsPerRow === "number" && element.optionsPerRow > 0
            ? Math.min(20, Math.floor(element.optionsPerRow))
            : 2,
        sendByOption: element.sendByOption === true,
        allowDeselection: element.allowDeselection === true,
      };
    case "dropbox": {
      const selectKind = element.selectKind === "multi" ? "multi" : "single";

      return {
        ...base,
        type: "dropbox",
        options: normalizeDisplayValues(element.options, [
          { value: "Option 1", label: "Option 1" },
          { value: "Option 2", label: "Option 2" },
        ]),
        optionsSlot:
          typeof element.optionsSlot === "string" ? element.optionsSlot : "",
        selectKind,
        defaultValue:
          selectKind === "multi"
            ? Array.isArray(element.defaultValue)
              ? element.defaultValue.map(String)
              : typeof element.defaultValue === "string" && element.defaultValue
                ? [element.defaultValue]
                : []
            : typeof element.defaultValue === "string"
              ? element.defaultValue
              : Array.isArray(element.defaultValue)
                ? String(element.defaultValue[0] ?? "")
                : "",
      };
    }
    case "grid": {
      const rows =
        typeof element.rows === "number" && element.rows > 0 ? element.rows : 2;
      const columns =
        typeof element.columns === "number" && element.columns > 0
          ? element.columns
          : 2;

      return {
        ...base,
        type: "grid",
        rows,
        columns,
        data: Array.from({ length: rows * columns }, (_, index) =>
          Array.isArray(element.data) && element.data[index] != null
            ? String(element.data[index])
            : "",
        ),
        displayKeys: Array.isArray(element.displayKeys)
          ? element.displayKeys
              .map((item) => {
                if (!item || typeof item !== "object") return null;
                const displayKey = item as Partial<DisplayKey>;
                if (!displayKey.key) return null;
                return {
                  key: String(displayKey.key),
                  label: displayKey.label
                    ? String(displayKey.label)
                    : String(displayKey.key),
                };
              })
              .filter((item): item is DisplayKey => Boolean(item))
          : [],
        optionsSlot:
          typeof element.optionsSlot === "string" ? element.optionsSlot : "",
      };
    }
    case "search":
      return {
        ...base,
        type: "search",
        placeholder:
          typeof element.placeholder === "string" ? element.placeholder : "",
        defaultValue:
          typeof element.defaultValue === "string" ? element.defaultValue : "",
        apiConfig:
          element.apiConfig &&
          typeof element.apiConfig === "object" &&
          !Array.isArray(element.apiConfig)
            ? {
                url:
                  typeof element.apiConfig.url === "string"
                    ? element.apiConfig.url
                    : "https://",
                method:
                  typeof element.apiConfig.method === "string"
                    ? element.apiConfig.method
                    : "POST",
                headers:
                  typeof element.apiConfig.headers === "string"
                    ? element.apiConfig.headers
                    : "{}",
                bodyTemplate:
                  typeof element.apiConfig.bodyTemplate === "string"
                    ? element.apiConfig.bodyTemplate
                    : '{"query": "{{value}}"}',
              }
            : {
                url: "https://",
                method: "POST",
                headers: "{}",
                bodyTemplate: '{"query": "{{value}}"}',
              },
        resultSlot:
          typeof element.resultSlot === "string"
            ? element.resultSlot
            : "search_results",
        inputFillKey:
          typeof element.inputFillKey === "string"
            ? element.inputFillKey
            : null,
      };
    default:
      return null;
  }
};

function ScenarioFormBuilder() {
  const { t } = useTranslation();
  const { showAlert, showConfirm } = useModal();
  const router = useRouter();
  const params = useSearchParams();
  const target = params.get("formId");
  const mode = params.get("mode");
  const returnTo = formListReturn(params.get("returnTo"));
  const invalid =
    (params.has("formId") && !target?.trim()) ||
    (mode !== null && (mode !== "new" || target !== null));
  const entry = invalid
    ? "invalid"
    : target
      ? "form:" + target
      : mode === "new"
        ? "new"
        : "default";
  const [loadedEntry, setLoadedEntry] = useState<string | null>(null);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const savePending = useRef(false);
  const appliedEntry = useRef<string | null>(null);
  const baseline = useRef("");
  const [originalDefinition, setOriginalDefinition] = useState<
    Partial<FormDataJson>
  >({});
  const [activeTab, setActiveTab] = useState(0);
  const [dataSource, setDataSource] = useState("");
  const [dataSourceType, setDataSourceType] = useState<"json" | "api">("json");
  const [enableExcelUpload, setEnableExcelUpload] = useState(false);
  const [elementFormId, setElementFormId] = useState(createFormId);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isJsonDialogOpen, setIsJsonDialogOpen] = useState(false);
  const [isElementDialogOpen, setIsElementDialogOpen] = useState(false);
  const [isElementManagementDialogOpen, setIsElementManagementDialogOpen] =
    useState(false);
  const [isSavedContentModalOpen, setIsSavedContentModalOpen] = useState(false);
  const [jsonText, setJsonText] = useState("");
  const [jsonError, setJsonError] = useState("");

  const formTitle = useFormEditorStore((state) => state.title);
  const elements = useFormEditorStore((state) => state.elements);
  const selectedId = useFormEditorStore((state) => state.selectedElementId);
  const selectElement = useFormEditorStore((state) => state.selectElement);
  const addElement = useFormEditorStore((state) => state.addElement);
  const updateElement = useFormEditorStore((state) => state.updateElement);
  const moveElement = useFormEditorStore((state) => state.moveElement);
  const replaceForm = useFormEditorStore((state) => state.replaceForm);
  const resetForm = useFormEditorStore((state) => state.resetForm);
  const saveForm = useFormEditorStore((state) => state.saveForm);

  // ===========================================================================
  // Load element types from API
  const elementTypes = useFormEditorStore((state) => state.elementTypes);
  const elementTypesLoading = useFormEditorStore(
    (state) => state.elementTypesLoading,
  );
  const elementTypesError = useFormEditorStore(
    (state) => state.elementTypesError,
  );
  const loadElementTypes = useFormEditorStore(
    (state) => state.loadElementTypes,
  );

  useEffect(() => {
    // admin sidebar를 닫는 로직 추가
    void loadElementTypes();
  }, [loadElementTypes]);

  const availableElementTypes = useMemo(
    () =>
      elementTypes
        .map((item) => item.type_cd)
        .filter(
          (type): type is ElementType =>
            isElementType(type) && type !== "search",
        ),
    [elementTypes],
  );

  const formElementTypesJson = useFormEditorStore(
    (state) => state.formElementTypesJson,
  );
  const setFormElementTypesJson = useFormEditorStore(
    (state) => state.setFormElementTypesJson,
  );
  // ===========================================================================

  const handleResetForm = () => {
    resetForm();
    setOriginalDefinition({});
    setElementFormId(createFormId());
    setDataSource("");
    setDataSourceType("json");
    setEnableExcelUpload(false);
    setJsonText("");
    setJsonError("");
  };

  const formJson = useMemo<FormDataJson>(
    () => ({
      ...originalDefinition,
      id: elementFormId,
      data: {
        ...originalDefinition.data,
        id: elementFormId,
        title: formTitle,
        elements,
        dataSource,
        dataSourceType,
        enableExcelUpload,
      },
      type: "form",
      width: 320,
      height: 597,
      dragging: false,
      selected: false,
    }),
    [
      dataSource,
      dataSourceType,
      elements,
      enableExcelUpload,
      elementFormId,
      formTitle,
      originalDefinition,
    ],
  );

  const openJsonTab = () => {
    setJsonText(JSON.stringify(formJson, null, 2));
    setJsonError("");
  };

  const applyJsonText = (value: string) => {
    setJsonText(value);

    try {
      const parsed = JSON.parse(value) as Partial<FormDataJson>;
      const parsedData = parsed.data;

      if (!parsedData || typeof parsedData !== "object") {
        throw new Error("data object is required.");
      }

      const nextElements = Array.isArray(parsedData.elements)
        ? parsedData.elements
            .map((element): FormElement | null => {
              const normalized = normalizeElement(element);
              return normalized ? { ...element, ...normalized } : null;
            })
            .filter((element): element is FormElement => Boolean(element))
        : [];

      const nextFormId =
        typeof parsedData.id === "string"
          ? parsedData.id
          : typeof parsed.id === "string"
            ? parsed.id
            : elementFormId;

      setOriginalDefinition(parsed);
      setElementFormId(nextFormId);
      replaceForm({
        id: nextFormId,
        title:
          typeof parsedData.title === "string" ? parsedData.title : formTitle,
        elements: nextElements,
      });
      setDataSource(
        typeof parsedData.dataSource === "string" ? parsedData.dataSource : "",
      );
      setDataSourceType(parsedData.dataSourceType === "api" ? "api" : "json");
      setEnableExcelUpload(Boolean(parsedData.enableExcelUpload));
      setJsonError("");
    } catch (error) {
      setJsonError(error instanceof Error ? error.message : "Invalid JSON");
    }
  };

  const addComponent = (type: ElementType) => {
    addElement(type);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const type = event.dataTransfer.getData(
      "application/x-form-component",
    ) as ElementType;
    setIsDragOver(false);

    if (availableElementTypes.includes(type)) {
      addComponent(type);
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
  );

  const handleElementDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) return;

    moveElement(String(active.id), String(over.id));
  };

  const handleElementApiEvent = async (
    sourceElement: FormElement,
    value?: unknown,
  ) => {
    const sourceEventType =
      value === undefined ? "onClick" : ("onChange" as const);

    const currentElementValue = value ?? getElementDefaultValue(sourceElement);
    const sourceValues = Object.fromEntries(
      elements.flatMap((element) => {
        const elementValue =
          element.id === sourceElement.id
            ? currentElementValue
            : getElementDefaultValue(element);

        return [
          [element.id, elementValue],
          ...(element.name ? [[element.name, elementValue] as const] : []),
        ];
      }),
    );
    const requests = [sourceElement.bindApi, sourceElement.targetApi].filter(
      (settings) => settings.eventType === sourceEventType,
    );

    await Promise.all(
      requests.map(async (settings) => {
        const endpoint = settings.url.trim();
        const targetElement =
          settings.mode === "bind"
            ? sourceElement
            : elements.find(
                (element) => element.id === settings.targetElementId,
              );
        if (!endpoint || !targetElement) return;

        const parameterKey = settings.parameterId?.trim();
        const parameterParams = parameterKey
          ? { [parameterKey]: currentElementValue }
          : {};

        try {
          const payload = {
            ...parseOptionalParameter(settings.body, sourceValues),
            ...parseOptionalParameter(settings.optionalParameter, sourceValues),
          };
          const method = (settings.method.toLowerCase() || "post") as NxMethod;
          const headers = settings.headers.trim()
            ? JSON.parse(settings.headers)
            : undefined;
          const response =
            method === "get" || method === "delete"
              ? await apiClient[method](endpoint, {
                  params: { ...payload, ...parameterParams },
                  headers,
                })
              : await apiClient[method](endpoint, payload, {
                  params: parameterParams,
                  headers,
                });
          updateElement(
            mapResponseToTargetElement(
              targetElement,
              response,
              settings.responsePath,
            ),
          );
        } catch (error) {
          console.error("Form builder element API event failed:", error);
        }
      }),
    );
  };

  const isFullFormData = (obj: Partial<FormDataJson>): obj is FormDataJson => {
    return (
      obj !== null &&
      typeof obj === "object" &&
      "data" in obj &&
      obj.data !== undefined &&
      "id" in obj.data
    );
  };

  const loadFormJson = (id: string, nextFormJson: Partial<FormDataJson>) => {
    if (!nextFormJson || typeof nextFormJson !== "object") return;

    if (isFullFormData(nextFormJson)) {
      setElementFormId(nextFormJson.data.id);
      setOriginalDefinition(nextFormJson);
      replaceForm({
        formId: id,
        id: nextFormJson.data.id,
        revision: nextFormJson.revision ?? 0,
        title: nextFormJson.data.title,
        elements: Array.isArray(nextFormJson.data.elements)
          ? nextFormJson.data.elements
              .map((element) => normalizeElement(element))
              .filter((element): element is FormElement => Boolean(element))
          : [],
      });
      setDataSource(nextFormJson.data.dataSource ?? "");
      setDataSourceType(nextFormJson.data.dataSourceType ?? "json");
      setEnableExcelUpload(nextFormJson.data.enableExcelUpload ?? false);
    } else {
      setElementFormId(createFormId);
      setOriginalDefinition({});
      replaceForm({
        formId: null,
        revision: 0,
        id: createFormId(),
        title: "new form",
        elements: [],
      });
      setDataSource("");
      setDataSourceType("json");
      setEnableExcelUpload(false);
    }
    setJsonText(JSON.stringify(nextFormJson, null, 2));
    setJsonError("");
  };

  const snapshot = JSON.stringify(formJson);
  const currentSnapshot = useRef(snapshot);
  const captureBaseline = useRef(true);
  useLayoutEffect(() => {
    currentSnapshot.current = snapshot;
    if (captureBaseline.current) {
      baseline.current = snapshot;
      captureBaseline.current = false;
    }
  });

  const isDirty = () => baseline.current !== currentSnapshot.current;
  useEffect(
    () =>
      registerDraftGuard(
        () => baseline.current !== currentSnapshot.current,
        () => savePending.current,
      ),
    [],
  );

  useEffect(() => {
    const navigation = (
      window as Window & { navigation?: { currentEntry?: { index: number } } }
    ).navigation;
    if (!navigation) return;
    function checkHistory(event: PopStateEvent) {
      const nextIndex = navigation?.currentEntry?.index;
      if (
        index === undefined ||
        nextIndex === undefined ||
        index < 0 ||
        nextIndex < 0 ||
        index === nextIndex
      )
        return;
      if (
        !savePending.current &&
        (baseline.current === currentSnapshot.current ||
          window.confirm("저장하지 않은 변경을 버리고 이동할까요?"))
      ) {
        index = nextIndex;
        if (location.pathname !== "/form-builder")
          useFormEditorStore.getState().resetForm();
        return;
      }
      event.stopImmediatePropagation();
      history.go(index - nextIndex);
    }
    let index = navigation.currentEntry?.index;
    window.addEventListener("popstate", checkHistory, true);
    return () => {
      window.removeEventListener("popstate", checkHistory, true);
    };
  }, [params]);

  const applyEntry = useEffectEvent(
    (id: string | null, definition?: Partial<FormDataJson>) => {
      captureBaseline.current = true;
      if (id && definition) loadFormJson(id, definition);
      else handleResetForm();
    },
  );

  useEffect(() => {
    if (invalid || appliedEntry.current === entry) return;
    let active = true;
    const request = target ? getForm(target) : Promise.resolve(null);
    request.then(
      (form) => {
        if (!active) return;
        if (form) applyEntry(form.id, formDefinition(form));
        else applyEntry(null);
        appliedEntry.current = entry;
        setLoadError("");
        setLoadedEntry(entry);
      },
      (error: unknown) => {
        if (!active) return;
        appliedEntry.current = null;
        setLoadError(
          error instanceof Error ? error.message : "폼을 불러오지 못했습니다.",
        );
        setLoadedEntry(entry);
      },
    );
    return () => {
      active = false;
    };
  }, [entry, invalid, target]);

  async function allowDiscard() {
    return (
      !savePending.current &&
      (!isDirty() || (await showConfirm("저장하지 않은 변경을 버릴까요?")))
    );
  }

  function editorUrl(id: string) {
    return "/form-builder?" + new URLSearchParams({ formId: id, returnTo });
  }

  async function saveFormBuilder() {
    if (savePending.current) return;
    savePending.current = true;
    try {
      const confirmed = await showConfirm("Do you want to save the Form?");
      if (!confirmed) return;
      setSaving(true);
      const saved = await saveForm(formJson);
      baseline.current = snapshot;
      if (target !== saved.id) {
        appliedEntry.current = "form:" + saved.id;
        setLoadedEntry(appliedEntry.current);
        router.replace(editorUrl(saved.id));
      }
      await showAlert("Saved.");
    } catch (error) {
      await showAlert(
        error instanceof Error
          ? "status" in error && error.status === 409
            ? error.message +
              " 현재 초안을 보관한 뒤 저장된 폼을 다시 열어 확인해 주세요."
            : error.message
          : "Could not save the form.",
      );
    } finally {
      savePending.current = false;
      setSaving(false);
    }
  }

  if (!invalid && loadedEntry !== entry)
    return <p role="status">폼을 불러오는 중입니다…</p>;
  if (invalid || loadError)
    return (
      <div role="alert">
        {invalid ? "폼 편집 주소를 확인해 주세요." : loadError}{" "}
        <button onClick={() => router.push(returnTo)}>목록</button>
      </div>
    );

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        ...{ minHeight: 0, bgcolor: "background.default" },
      }}
    >
      <AppBar
        position="static"
        elevation={0}
        sx={{
          bgcolor: "background.paper",
          borderBottom: 1,
          borderColor: "divider",
          color: "text.primary",
        }}
      >
        <Toolbar sx={{ gap: 2, minHeight: "64px !important" }}>
          {/* <Button disabled={saving} onClick={async () => {
            if (!(await allowDiscard())) return;
            resetForm();
            router.push(returnTo);
          }}>목록</Button> */}
          <LayersIcon
            sx={{ color: "primary.main", fontSize: 28 }}
            onClick={() => setIsElementManagementDialogOpen(true)}
          />
          <Typography variant="h6" sx={{ fontWeight: 700, ...{ mr: 0.5 } }}>
            {t("Form Builder")}
          </Typography>
          <Chip
            label="v0.1"
            size="small"
            color="success"
            variant="outlined"
            sx={{ fontWeight: 700 }}
          />

          <Tabs
            value={activeTab}
            onChange={(_, v) => {
              if (v === 1) openJsonTab();
              setActiveTab(v);
            }}
            sx={{
              ml: 4,
              flex: 1,
              "& .MuiTab-root": {
                minHeight: 64,
                textTransform: "none",
                fontWeight: 600,
                fontSize: "0.875rem",
              },
            }}
          >
            <Tab label="Preview" />
            <Tab label="JSON" />
          </Tabs>

          <Box sx={{ flex: 1 }} />

          <Button
            variant="outlined"
            color="inherit"
            size="small"
            onClick={() => setIsSavedContentModalOpen(true)}
            sx={{ borderColor: "divider" }}
          >
            {t("Get Saved Content")}
          </Button>
          <Button
            variant="contained"
            size="small"
            disableElevation
            disabled={saving}
            onClick={saveFormBuilder}
          >
            {t("Save Form")}
          </Button>
        </Toolbar>
      </AppBar>

      {activeTab === 0 ? (
        <Box sx={{ display: "flex", flex: 1, overflow: "hidden" }}>
          <Box
            sx={{
              width: 260,
              bgcolor: "background.paper",
              borderRight: 1,
              borderColor: "divider",
              display: "flex",
              flexDirection: "column",
              flexShrink: 0,
            }}
          >
            <LeftPanel
              addComponent={addComponent}
              elementTypes={availableElementTypes}
              loading={elementTypesLoading}
              error={elementTypesError}
            />
          </Box>

          <Canvas
            elements={elements}
            selectedId={selectedId}
            setSelectedId={selectElement}
            setIsElementDialogOpen={setIsElementDialogOpen}
            isDragOver={isDragOver}
            setIsDragOver={setIsDragOver}
            handleDrop={handleDrop}
            handleElementDragEnd={handleElementDragEnd}
            sensors={sensors}
            onElementEvent={(element, value) => {
              void handleElementApiEvent(element, value);
            }}
          />

          <Box
            sx={{
              width: 340,
              bgcolor: "background.paper",
              borderLeft: 1,
              borderColor: "divider",
              display: "flex",
              flexDirection: "column",
              flexShrink: 0,
            }}
          >
            <RightPanel
              setIsJsonDialogOpen={setIsJsonDialogOpen}
              onResetForm={async () => {
                if (await allowDiscard()) handleResetForm();
              }}
            />
          </Box>
        </Box>
      ) : (
        <JsonPanel
          jsonText={jsonText}
          applyJsonText={applyJsonText}
          jsonError={jsonError}
        />
      )}

      <Dialog
        open={isJsonDialogOpen}
        onClose={() => setIsJsonDialogOpen(false)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>{t("Form JSON")}</DialogTitle>
        <DialogContent dividers>
          <Paper
            variant="outlined"
            sx={{
              bgcolor: "#f6f8fa",
              borderColor: "grey.300",
              borderRadius: 1,
              p: 1.5,
              overflow: "auto",
              maxHeight: "70vh",
            }}
          >
            <Box
              component="pre"
              sx={{
                m: 0,
                fontSize: 12,
                fontFamily: "monospace",
                whiteSpace: "pre",
                minWidth: 720,
              }}
            >
              {JSON.stringify(formJson, null, 2)}
            </Box>
          </Paper>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsJsonDialogOpen(false)}>
            {t("Close")}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={isElementDialogOpen}
        onClose={() => setIsElementDialogOpen(false)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>{t("Select Element")}</DialogTitle>
        <DialogContent dividers>
          <List
            disablePadding
            sx={{ display: "flex", flexDirection: "column", gap: 1 }}
          >
            {availableElementTypes.map((type) => {
              const comp = FORM_ELEMENT_REGISTRY[type];

              return (
                <ListItemButton
                  key={type}
                  onClick={() => {
                    addComponent(type);
                    setIsElementDialogOpen(false);
                  }}
                  sx={{
                    border: 1,
                    borderColor: "primary.light",
                    borderRadius: 1,
                    color: "primary.main",
                    py: 1,
                    "&:hover": { bgcolor: "primary.50" },
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 36, color: "inherit" }}>
                    {comp.icon}
                  </ListItemIcon>
                  <ListItemText
                    slotProps={{
                      primary: {
                        sx: {
                          fontSize: "0.875rem",
                          fontWeight: 600,
                        },
                      },
                    }}
                    primary={comp.label}
                  />
                </ListItemButton>
              );
            })}
          </List>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsElementDialogOpen(false)}>
            {t("Close")}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={isElementManagementDialogOpen}
        onClose={() => setIsElementManagementDialogOpen(false)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>{t("Element Display Settings")} [ADMIN]</DialogTitle>
        <DialogContent dividers>
          <List
            disablePadding
            sx={{ display: "flex", flexDirection: "column", gap: 1 }}
          >
            {formElementTypesJson
              .filter((item) => item.del_yn !== "Y")
              .sort((a, b) => a.sort_order - b.sort_order)
              .map((item) => {
                const type = item.type_cd;
                const comp = FORM_ELEMENT_REGISTRY[type];

                return (
                  <Box
                    key={type}
                    sx={{
                      border: 1,
                      borderColor: "primary.light",
                      borderRadius: 1,
                      color: "primary.main",
                      py: 1,
                      px: 1.5,
                      display: "flex",
                      alignItems: "center",
                      gap: 1,
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 36, color: "inherit" }}>
                      {comp.icon}
                    </ListItemIcon>
                    <ListItemText
                      slotProps={{
                        primary: {
                          sx: {
                            fontSize: "0.875rem",
                            fontWeight: 600,
                          },
                        },
                      }}
                      primary={comp.label}
                    />
                    <Checkbox
                      size="small"
                      checked={item.visible}
                      onChange={(_, checked) => {
                        const updatedElementTypes = formElementTypesJson.map(
                          (elementType) =>
                            elementType.type_cd === item.type_cd
                              ? { ...elementType, visible: checked }
                              : elementType,
                        );

                        setFormElementTypesJson(updatedElementTypes);
                        void loadElementTypes();
                      }}
                      sx={{ p: 0.5, flexShrink: 0 }}
                    />
                  </Box>
                );
              })}
          </List>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsElementManagementDialogOpen(false)}>
            {t("Close")}
          </Button>
        </DialogActions>
      </Dialog>

      <SavedFormContentModal
        isOpen={isSavedContentModalOpen}
        onClose={() => setIsSavedContentModalOpen(false)}
        onSelect={async (id, definition) => {
          if (!(await allowDiscard())) return false;
          captureBaseline.current = true;
          loadFormJson(id, definition);
          appliedEntry.current = "form:" + id;
          setLoadedEntry(appliedEntry.current);
          router.replace(editorUrl(id));
        }}
      />
    </Box>
  );
}

export default ScenarioFormBuilder;
