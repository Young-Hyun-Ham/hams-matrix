// app/(content-header)/chatbot/components/ScenarioNodeControls.tsx
"use client";

import React, { useEffect, useState } from "react";
import HelpOutlineIcon from "@mui/icons-material/HelpOutlineOutlined";
import {
  Box,
  Checkbox,
  Chip,
  FormControl,
  IconButton,
  ListItemText,
  MenuItem,
  Select,
  Tooltip,
} from "@mui/material";
import { useModal } from "@/app/(builder)/providers/ModalProvider";
import { normalizeOptionsKey, resolveTemplate } from "./utils";
import { getFormNodeData } from "./core/formNode";
import apiClient from "@/app/(builder)/services/apiClient";
import {
  mapResponseToTargetElement,
  parseOptionalParameter,
} from "@/app/(builder)/form-builder/components/CustomElementPropertyEditor";

type FormOption = string | { label?: string; value?: string; param?: string };

const getElementKey = (element: any, index: number) =>
  String(
    element?.name || element?.id || `${element?.type || "element"}-${index}`,
  );

const normalizeOption = (option: FormOption, index: number) => {
  if (option && typeof option === "object") {
    const value = String(option.value ?? option.label ?? index);
    return {
      value,
      label: String(option.label ?? option.value ?? value),
      param: String(option.param ?? value),
    };
  }
  const value = String(option ?? index);
  return { value, label: value, param: value };
};

const getSlotOptions = (
  element: any,
  slotValues: Record<string, any>,
): FormOption[] => {
  const direct = element.optionsSlot
    ? slotValues[element.optionsSlot]
    : undefined;
  if (Array.isArray(direct)) return direct;

  if (element.optionsSlot) {
    try {
      const rendered = resolveTemplate(
        normalizeOptionsKey(element.optionsSlot),
        slotValues,
      );
      const parsed = JSON.parse(rendered);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // Fall back to the options saved in the form definition.
    }
  }
  return Array.isArray(element.options) ? element.options : [];
};

type AnyNode = {
  id: string;
  type: string;
  data: any;
};

type ScenarioNodeControlsProps = {
  currentNode: AnyNode | null;
  finished: boolean;
  formValues: Record<string, any>;
  setFormValues: React.Dispatch<React.SetStateAction<Record<string, any>>>;
  slotValues: Record<string, any>;
  onReset: () => void;
  onBranchClick: (reply: { display: string; value: string }) => void;
  onSubmitForm: (e: React.FormEvent) => void;
  onNextFromLink: () => void;

  // LLM 노드용
  llmDone: boolean;
  onContinueFromLlm: () => void;

  // iframe 노드용
  onContinueFromIframe: () => void;

  // slot filling
  onSlotFillingClick?: (reply: { display: string; value: any }) => void;
};

export default function ScenarioNodeControls({
  currentNode,
  finished,
  formValues,
  setFormValues,
  slotValues,
  onReset,
  onBranchClick,
  onSubmitForm,
  onNextFromLink,
  llmDone,
  onContinueFromLlm,
  onContinueFromIframe,
  onSlotFillingClick,
}: ScenarioNodeControlsProps) {
  const { showAlert, showConfirm } = useModal();
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [runtimeElements, setRuntimeElements] = useState<any[]>([]);

  useEffect(() => {
    setFormErrors({});
    setRuntimeElements(
      currentNode?.type === "form"
        ? [...(getFormNodeData(currentNode).elements ?? [])]
        : [],
    );
  }, [currentNode?.id, currentNode?.type]);

  // currentNode 타입별 UI 렌더
  if (!currentNode || finished) {
    return (
      <div className="mt-3 flex justify-end gap-2">
        <button
          className="rounded-md border border-emerald-200 bg-white px-3 py-1 text-xs text-emerald-700 hover:bg-emerald-50"
          onClick={onReset}
        >
          시나리오 다시 실행
        </button>
      </div>
    );
  }

  // LLM 노드: 스트림 끝나면 "계속" 버튼으로 다음 노드로 이동
  if (currentNode.type === "llm") {
    return (
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={llmDone ? onContinueFromLlm : undefined}
          disabled={!llmDone}
          className={
            "rounded-md px-3 py-1.5 text-xs font-medium shadow " +
            (llmDone
              ? "bg-emerald-600 text-white hover:bg-emerald-700"
              : "bg-gray-300 text-gray-600 cursor-not-allowed")
          }
        >
          {llmDone ? "계속" : "LLM 처리 중..."}
        </button>
      </div>
    );
  }

  if (currentNode.type === "message") {
    return null;
  }

  if (currentNode.type === "api") {
    return (
      <div className="mt-3 flex items-center justify-end gap-2 text-[11px] text-gray-500">
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-600" />
        <span>API 응답을 기다리는 중...</span>
      </div>
    );
  }

  if (currentNode.type === "branch") {
    if (currentNode.data?.evaluationType === "CONDITION") return null;
    const replies: { display: string; value: string }[] =
      currentNode.data?.replies ?? [];
    return (
      <div className="mt-3 flex flex-wrap gap-2">
        {replies.map((r) => (
          <button
            key={r.value}
            onClick={() => onBranchClick(r)}
            className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs text-emerald-700 hover:bg-emerald-50"
          >
            {r.display}
          </button>
        ))}
      </div>
    );
  }

  if (
    currentNode.type === "slotFilling" ||
    currentNode.type === "slotfilling"
  ) {
    const replies: { display: string; value: any }[] =
      currentNode.data?.replies ?? currentNode.data?.quickReplies ?? [];

    return (
      <div className="mt-3 flex flex-wrap gap-2">
        {replies.map((r) => (
          <button
            key={String(r.value)}
            type="button"
            onClick={() => onSlotFillingClick?.(r)}
            className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs text-emerald-700 hover:bg-emerald-50"
          >
            {r.display}
          </button>
        ))}
      </div>
    );
  }

  if (currentNode.type === "form") {
    const formNodeData = getFormNodeData(currentNode);
    const elements: any[] = runtimeElements.length
      ? runtimeElements
      : (formNodeData.elements ?? []);

    const runElementApi = async (
      sourceElement: any,
      nextValues: Record<string, any>,
    ) => {
      const endpoint = String(sourceElement.apiData?.endPoint ?? "").trim();
      if (!endpoint || !sourceElement.targetElementId) return;
      const method = String(
        sourceElement.apiData?.method ?? "get",
      ).toLowerCase();
      try {
        const headers = JSON.parse(
          String(sourceElement.apiData?.headers || "{}"),
        );
        const sourceValues = { ...slotValues, ...nextValues };
        elements.forEach((element, index) => {
          const key = getElementKey(element, index);
          const value = nextValues[key] ?? element.defaultValue ?? "";
          if (element.id) sourceValues[element.id] = value;
          if (element.name) sourceValues[element.name] = value;
        });
        sourceValues.value =
          nextValues[
            getElementKey(
              sourceElement,
              Math.max(
                elements.findIndex((item) => item.id === sourceElement.id),
                0,
              ),
            )
          ] ?? "";
        const payload = parseOptionalParameter(
          sourceElement.optionalParameter,
          sourceValues,
        );
        const parameterKey = String(sourceElement.parameterId ?? "").trim();
        const params = parameterKey
          ? { [parameterKey]: sourceValues.value }
          : {};
        const clientMethod = apiClient[
          method as keyof typeof apiClient
        ] as unknown as (...args: any[]) => Promise<unknown>;
        if (typeof clientMethod !== "function") return;
        const response =
          method === "get" || method === "delete"
            ? await clientMethod(endpoint, {
                params: { ...payload, ...params },
                headers,
              })
            : await clientMethod(endpoint, payload, { params, headers });
        setRuntimeElements((previous) =>
          previous.map((element) =>
            element.id === sourceElement.targetElementId
              ? mapResponseToTargetElement(
                  element,
                  response,
                  sourceElement.responsePath,
                )
              : element,
          ),
        );
      } catch (error) {
        console.error("Form element API call failed:", error);
      }
    };

    const updateFormValue = (element: any, key: string, value: any) => {
      const nextValues = { ...formValues, [key]: value };
      setFormValues(nextValues);
      if (element.eventType === "onChange") {
        void runElementApi(element, nextValues);
      }
    };

    const validateInput = (element: any, elementKey: string) => {
      const rawValue = formValues[elementKey] ?? element.defaultValue ?? "";
      const value = String(rawValue).trim();
      if (element.requires && !value) return "필수 입력 항목입니다.";
      if (!value || element.type !== "input") return "";
      const validationType = element.validation?.type ?? "text";
      if (
        validationType === "email" &&
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
      )
        return "올바른 이메일 주소를 입력해 주세요.";
      if (validationType === "number" && !Number.isFinite(Number(value)))
        return "올바른 숫자를 입력해 주세요.";
      if (element.minLength && value.length < Number(element.minLength))
        return `${element.minLength}자 이상 입력해 주세요.`;
      if (element.maxLength && value.length > Number(element.maxLength))
        return `${element.maxLength}자 이하로 입력해 주세요.`;
      if (validationType === "custom" && element.regex) {
        try {
          if (!new RegExp(element.regex).test(value))
            return "입력 형식이 올바르지 않습니다.";
        } catch {
          return "설정된 정규식이 올바르지 않습니다.";
        }
      }
      return "";
    };

    const handleValidatedSubmit = (event: React.FormEvent) => {
      event.preventDefault();
      const errors = Object.fromEntries(
        elements
          .map((element, index) => {
            const key = getElementKey(element, index);
            return [key, validateInput(element, key)];
          })
          .filter(([, message]) => message),
      );
      setFormErrors(errors);
      if (Object.keys(errors).length === 0) onSubmitForm(event);
    };

    return (
      <form
        noValidate
        onSubmit={handleValidatedSubmit}
        className="mt-3 space-y-3 text-xs"
      >
        <div
          className="min-w-0 flex-1 overflow-auto pr-1"
          style={{
            // 에뮬 패널 높이에 따라 적당히 제한 (필요시 조정)
            maxHeight: "260px",
          }}
        >
          <div className="space-y-3">
            {elements.map((el, elementIndex) => {
              const elementKey = getElementKey(el, elementIndex);
              const value = formValues[elementKey] ?? el.defaultValue ?? "";
              const commonLabel = (
                <div className="mb-1 flex items-center gap-1">
                  <label className="font-medium text-gray-700">
                    {el.label || el.name || el.type}
                    {el.requires ? (
                      <span className="ml-0.5 text-red-500">*</span>
                    ) : null}
                  </label>
                  {el.description ? (
                    <Tooltip title={el.description} arrow placement="top">
                      <IconButton
                        size="small"
                        aria-label={`${el.label || el.name || el.type} 도움말`}
                        sx={{ padding: 0.25 }}
                      >
                        <HelpOutlineIcon sx={{ fontSize: 15 }} />
                      </IconButton>
                    </Tooltip>
                  ) : null}
                </div>
              );

              // element.type 에 따라 다른 UI 렌더
              switch (el.type) {
                case "input":
                case "search": {
                  return (
                    <div key={el.id || elementKey} className="flex flex-col">
                      {commonLabel}
                      <input
                        type="text"
                        className="w-full rounded-md border border-gray-200 px-2 py-1 text-xs
                                  focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                        placeholder={el.placeholder || ""}
                        value={String(value)}
                        required={Boolean(el.requires)}
                        minLength={
                          el.minLength ? Number(el.minLength) : undefined
                        }
                        maxLength={
                          el.maxLength ? Number(el.maxLength) : undefined
                        }
                        onChange={(e) => {
                          let nextValue = e.target.value;
                          if (el.transformTextType === "uppercase")
                            nextValue = nextValue.toUpperCase();
                          if (el.transformTextType === "lowercase")
                            nextValue = nextValue.toLowerCase();
                          if (el.transformTextType === "capitalize")
                            nextValue = nextValue.replace(
                              /\w\S*/g,
                              (text) =>
                                text.charAt(0).toUpperCase() +
                                text.slice(1).toLowerCase(),
                            );
                          updateFormValue(el, elementKey, nextValue);
                          if (formErrors[elementKey])
                            setFormErrors((prev) => ({
                              ...prev,
                              [elementKey]: "",
                            }));
                        }}
                      />
                      {formErrors[elementKey] ? (
                        <span className="mt-1 text-[11px] text-red-600">
                          {formErrors[elementKey]}
                        </span>
                      ) : null}
                    </div>
                  );
                }

                case "date": {
                  return (
                    <div key={el.id || elementKey} className="flex flex-col">
                      {commonLabel}
                      <div className="flex flex-col gap-2">
                        {(el.hasFromTo ? ["from", "to"] : ["value"]).map(
                          (part) => {
                            const partKey = el.hasFromTo
                              ? `${elementKey}.${part}`
                              : elementKey;
                            const defaultDate =
                              part === "from"
                                ? el.defaultFromValue
                                : part === "to"
                                  ? el.defaultToValue
                                  : el.defaultValue;
                            return (
                              <div
                                key={part}
                                className={
                                  el.hasTime
                                    ? "grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(100px,0.65fr)] items-end gap-2"
                                    : "grid min-w-0 grid-cols-1 gap-2"
                                }
                              >
                                {el.hasFromTo ? (
                                  <span
                                    className={
                                      el.hasTime
                                        ? "col-span-2 text-[10px] text-gray-500"
                                        : "text-[10px] text-gray-500"
                                    }
                                  >
                                    {part === "from" ? "From" : "To"}
                                  </span>
                                ) : null}
                                <input
                                  type="date"
                                  required={Boolean(el.requires)}
                                  className="w-full rounded-md border border-gray-200 px-2 py-1 text-xs"
                                  value={String(
                                    formValues[partKey] ?? defaultDate ?? "",
                                  )}
                                  onChange={(e) =>
                                    setFormValues((prev) => ({
                                      ...prev,
                                      [partKey]: e.target.value,
                                    }))
                                  }
                                />
                                {el.hasTime ? (
                                  <input
                                    type="time"
                                    className="w-full rounded-md border border-gray-200 px-2 py-1 text-xs"
                                    value={String(
                                      formValues[`${partKey}.time`] ??
                                        (part === "from"
                                          ? el.defaultFromTimeValue
                                          : part === "to"
                                            ? el.defaultToTimeValue
                                            : el.defaultTimeValue) ??
                                        "",
                                    )}
                                    onChange={(e) =>
                                      setFormValues((prev) => ({
                                        ...prev,
                                        [`${partKey}.time`]: e.target.value,
                                      }))
                                    }
                                  />
                                ) : null}
                              </div>
                            );
                          },
                        )}
                      </div>
                    </div>
                  );
                }

                case "checkbox": {
                  const selected: string[] = Array.isArray(value)
                    ? value.map(String)
                    : [];
                  const optionParams =
                    value && typeof value === "object" && !Array.isArray(value)
                      ? value
                      : {};
                  const options = getSlotOptions(el, slotValues).map(
                    normalizeOption,
                  );

                  const toggle = (opt: { value: string; param: string }) => {
                    if (el.sendByOption) {
                      const initialParams = Object.fromEntries(
                        options.map((option) => [
                          option.param,
                          selected.includes(option.value) ? "Y" : "N",
                        ]),
                      );
                      updateFormValue(el, elementKey, {
                        ...initialParams,
                        ...optionParams,
                        [opt.param]:
                          (optionParams[opt.param] ??
                            initialParams[opt.param]) === "Y"
                            ? "N"
                            : "Y",
                      });
                      return;
                    }
                    updateFormValue(
                      el,
                      elementKey,
                      selected.includes(opt.value)
                        ? selected.filter((item) => item !== opt.value)
                        : [...selected, opt.value],
                    );
                  };

                  return (
                    <div key={el.id || elementKey} className="flex flex-col">
                      {commonLabel}
                      <div
                        className="grid gap-x-3 gap-y-1"
                        style={{
                          gridTemplateColumns:
                            el.optionLayout === "horizontal"
                              ? `repeat(${Math.max(1, Number(el.optionsPerRow) || 2)}, minmax(0, 1fr))`
                              : "minmax(0, 1fr)",
                        }}
                      >
                        {options.map((opt) => (
                          <label
                            key={opt.value}
                            className="flex items-center gap-2 text-[11px] text-gray-700"
                          >
                            <input
                              type="checkbox"
                              className="h-3 w-3 rounded border-gray-300 text-emerald-600"
                              checked={
                                el.sendByOption
                                  ? optionParams[opt.param] === "Y" ||
                                    (!(opt.param in optionParams) &&
                                      selected.includes(opt.value))
                                  : selected.includes(opt.value)
                              }
                              onChange={() => toggle(opt)}
                            />
                            <span>{opt.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                }

                case "radio": {
                  const options = getSlotOptions(el, slotValues).map(
                    normalizeOption,
                  );
                  const optionParams =
                    value && typeof value === "object" && !Array.isArray(value)
                      ? value
                      : {};
                  return (
                    <div key={el.id || elementKey} className="flex flex-col">
                      {commonLabel}
                      <div
                        className="grid gap-x-3 gap-y-1"
                        style={{
                          gridTemplateColumns:
                            el.optionLayout === "horizontal"
                              ? `repeat(${Math.max(1, Number(el.optionsPerRow) || 2)}, minmax(0, 1fr))`
                              : "minmax(0, 1fr)",
                        }}
                      >
                        {options.map((opt) => {
                          const checked = el.sendByOption
                            ? optionParams[opt.param] === "Y" ||
                              (!(opt.param in optionParams) &&
                                String(el.defaultValue ?? "") === opt.value)
                            : String(value) === opt.value;
                          return (
                            <label
                              key={opt.value}
                              className="flex items-center gap-2 text-[11px] text-gray-700"
                            >
                              <input
                                type="radio"
                                name={elementKey}
                                checked={checked}
                                required={Boolean(el.requires)}
                                onClick={() =>
                                  updateFormValue(
                                    el,
                                    elementKey,
                                    el.sendByOption
                                      ? Object.fromEntries(
                                          options.map((item) => [
                                            item.param,
                                            checked && el.allowDeselection
                                              ? "N"
                                              : item.value === opt.value
                                                ? "Y"
                                                : "N",
                                          ]),
                                        )
                                      : checked && el.allowDeselection
                                        ? ""
                                        : opt.value,
                                  )
                                }
                                onChange={() => undefined}
                              />
                              <span>{opt.label}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                }

                case "dropbox": {
                  const options = getSlotOptions(el, slotValues).map(
                    normalizeOption,
                  );
                  const multiple = el.selectKind === "multi";

                  const selectedValues = Array.isArray(value)
                    ? value.map(String)
                    : value
                      ? [String(value)]
                      : [];
                  const optionLabels = new Map(
                    options.map((option) => [option.value, option.label]),
                  );

                  return (
                    <div key={el.id || elementKey} className="flex flex-col">
                      {commonLabel}
                      <FormControl fullWidth size="small">
                        <Select
                          multiple={multiple}
                          displayEmpty
                          value={
                            multiple
                              ? selectedValues
                              : (selectedValues[0] ?? "")
                          }
                          onChange={(event) => {
                            const nextValue = event.target.value;
                            updateFormValue(
                              el,
                              elementKey,
                              multiple
                                ? typeof nextValue === "string"
                                  ? nextValue.split(",").filter(Boolean)
                                  : nextValue
                                : String(nextValue),
                            );
                          }}
                          renderValue={(selected) => {
                            const values = Array.isArray(selected)
                              ? selected.map(String)
                              : selected
                                ? [String(selected)]
                                : [];
                            if (!values.length) return <em>Select...</em>;
                            if (!multiple)
                              return optionLabels.get(values[0]) ?? values[0];
                            return (
                              <Box
                                sx={{
                                  display: "flex",
                                  flexWrap: "wrap",
                                  gap: 0.5,
                                }}
                              >
                                {values.map((selectedValue) => (
                                  <Chip
                                    key={selectedValue}
                                    size="small"
                                    label={
                                      optionLabels.get(selectedValue) ??
                                      selectedValue
                                    }
                                  />
                                ))}
                              </Box>
                            );
                          }}
                        >
                          {!multiple ? (
                            <MenuItem value="">
                              <em>Select...</em>
                            </MenuItem>
                          ) : null}
                          {options.map((option) => (
                            <MenuItem key={option.value} value={option.value}>
                              {multiple ? (
                                <Checkbox
                                  size="small"
                                  checked={selectedValues.includes(
                                    option.value,
                                  )}
                                />
                              ) : null}
                              <ListItemText primary={option.label} />
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </div>
                  );
                }

                case "grid": {
                  const sourceValue =
                    el.optionsSlot && slotValues[el.optionsSlot]
                      ? slotValues[el.optionsSlot]
                      : (el.data ?? []);
                  const sourceRows: any[] = Array.isArray(sourceValue)
                    ? sourceValue
                    : [];
                  const objectRows = sourceRows.every(
                    (row) =>
                      row && typeof row === "object" && !Array.isArray(row),
                  );
                  const columnCount = Math.max(
                    1,
                    Number(el.columns) || el.displayKeys?.length || 1,
                  );
                  const flatRows = objectRows
                    ? []
                    : sourceRows.flatMap((row) =>
                        Array.isArray(row) ? row : [row],
                      );
                  const headerValues =
                    !objectRows && el.hasHeader
                      ? flatRows.slice(0, columnCount)
                      : [];
                  const bodyValues = headerValues.length
                    ? flatRows.slice(columnCount)
                    : flatRows;
                  const rows: any[] = objectRows
                    ? sourceRows
                    : Array.from(
                        { length: Math.ceil(bodyValues.length / columnCount) },
                        (_, rowIndex) =>
                          Object.fromEntries(
                            Array.from(
                              { length: columnCount },
                              (__, columnIndex) => [
                                String(columnIndex),
                                bodyValues[
                                  rowIndex * columnCount + columnIndex
                                ] ?? "",
                              ],
                            ),
                          ),
                      );
                  const sourceKeys = headerValues.length
                    ? headerValues.map((label, index) => ({
                        key: String(
                          typeof el.displayKeys?.[index] === "string"
                            ? el.displayKeys[index]
                            : (el.displayKeys?.[index]?.key ?? label),
                        ),
                        label: String(label),
                      }))
                    : el.displayKeys?.length
                      ? el.displayKeys
                      : Object.keys(
                          rows.find((row) => row && typeof row === "object") ??
                            {},
                        );
                  const displayKeys: { key: string; label: string }[] =
                    sourceKeys
                      .map((column: any) =>
                        typeof column === "string"
                          ? { key: column, label: column }
                          : {
                              key: column.key,
                              label: column.label || column.key,
                            },
                      )
                      .filter((column: any) => column.key)
                      .filter(
                        (column: any) =>
                          !el.hideNullColumns ||
                          rows.some(
                            (row) =>
                              row?.[column.key] != null &&
                              row[column.key] !== "",
                          ),
                      );
                  const normalizeSelectedRow = (row: any) =>
                    objectRows
                      ? { ...row }
                      : Object.fromEntries(
                          displayKeys.map((column, columnIndex) => [
                            String(columnIndex),
                            row?.[column.key] ??
                              row?.[String(columnIndex)] ??
                              "",
                          ]),
                        );
                  const getRowSelectionKey = (row: any) => {
                    const normalizedRow = normalizeSelectedRow(row);
                    return normalizedRow?.id !== undefined &&
                      normalizedRow?.id !== null
                      ? `id:${String(normalizedRow.id)}`
                      : `data:${JSON.stringify(normalizedRow)}`;
                  };
                  const selectedRows: any[] = Array.isArray(
                    formValues[elementKey],
                  )
                    ? formValues[elementKey].map((row: any) =>
                        Array.isArray(row)
                          ? Object.fromEntries(
                              row.map((cell, index) => [String(index), cell]),
                            )
                          : row,
                      )
                    : formValues[elementKey]
                      ? [formValues[elementKey]]
                      : [];
                  const selectedRowKeys = new Set(
                    selectedRows.map(getRowSelectionKey),
                  );
                  const firstDataKey = displayKeys[0]?.key;
                  const selectedFirstColumnValues = firstDataKey
                    ? selectedRows
                        .map((row) =>
                          Array.isArray(row)
                            ? row[0]
                            : (row?.[firstDataKey] ?? row?.["0"]),
                        )
                        .filter(
                          (cellValue) =>
                            cellValue !== undefined &&
                            cellValue !== null &&
                            cellValue !== "",
                        )
                        .map(String)
                    : [];
                  return (
                    <div key={el.id || elementKey} className="flex flex-col">
                      {commonLabel}
                      <div className="min-w-0 overflow-x-auto rounded-md border border-gray-200 bg-white">
                        <table className="min-w-full border-collapse text-[11px]">
                          {el.hasHeader ? (
                            <thead className="bg-gray-50">
                              <tr>
                                {el.selectable ? (
                                  <th className="w-8 border-b border-gray-200 px-1 py-1 text-center">
                                    <Checkbox
                                      size="small"
                                      checked={
                                        rows.length > 0 &&
                                        selectedRows.length === rows.length
                                      }
                                      indeterminate={
                                        selectedRows.length > 0 &&
                                        selectedRows.length < rows.length
                                      }
                                      onChange={(_, checked) =>
                                        setFormValues((prev) => ({
                                          ...prev,
                                          [elementKey]: checked
                                            ? rows.map((row) =>
                                                normalizeSelectedRow(row),
                                              )
                                            : [],
                                        }))
                                      }
                                    />
                                  </th>
                                ) : null}
                                {displayKeys.map((col: any) => (
                                  <th
                                    key={col.key}
                                    className="border-b border-gray-200 px-2 py-1 text-left font-medium text-gray-700"
                                  >
                                    {col.label}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                          ) : null}
                          <tbody>
                            {rows.map((row: any, idx: number) => {
                              const rowId = row.id ?? idx;
                              const rowSelectionKey = getRowSelectionKey(row);
                              const isSelected =
                                selectedRowKeys.has(rowSelectionKey);
                              return (
                                <tr
                                  key={rowId}
                                  className={
                                    (!el.selectable
                                      ? ""
                                      : "cursor-pointer hover:bg-emerald-50 ") +
                                    (isSelected ? "bg-emerald-50" : "")
                                  }
                                  onClick={() =>
                                    !el.selectable
                                      ? undefined
                                      : setFormValues((prev) => ({
                                          ...prev,
                                          [elementKey]: isSelected
                                            ? selectedRows.filter(
                                                (selectedRow) =>
                                                  getRowSelectionKey(
                                                    selectedRow,
                                                  ) !== rowSelectionKey,
                                              )
                                            : [
                                                ...selectedRows,
                                                normalizeSelectedRow(row),
                                              ],
                                        }))
                                  }
                                >
                                  {el.selectable ? (
                                    <td className="w-8 border-b border-gray-100 px-1 py-1 text-center">
                                      <Checkbox
                                        size="small"
                                        checked={isSelected}
                                        onClick={(event) =>
                                          event.stopPropagation()
                                        }
                                        onChange={() =>
                                          setFormValues((prev) => ({
                                            ...prev,
                                            [elementKey]: isSelected
                                              ? selectedRows.filter(
                                                  (selectedRow) =>
                                                    getRowSelectionKey(
                                                      selectedRow,
                                                    ) !== rowSelectionKey,
                                                )
                                              : [
                                                  ...selectedRows,
                                                  normalizeSelectedRow(row),
                                                ],
                                          }))
                                        }
                                      />
                                    </td>
                                  ) : null}
                                  {displayKeys.map((col: any, columnIndex) => (
                                    <td
                                      key={col.key}
                                      className="border-b border-gray-100 px-2 py-1"
                                    >
                                      {row[col.key] ?? row[String(columnIndex)]}
                                    </td>
                                  ))}
                                </tr>
                              );
                            })}
                            {(!rows || rows.length === 0) && (
                              <tr>
                                <td
                                  className="px-2 py-2 text-center text-gray-400"
                                  colSpan={
                                    displayKeys.length +
                                      (el.selectable ? 1 : 0) || 1
                                  }
                                >
                                  데이터가 없습니다.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                      {selectedFirstColumnValues.length > 0 && (
                        <div className="mt-1 text-[10px] text-emerald-700">
                          선택된 행: {selectedFirstColumnValues.join(", ")}
                        </div>
                      )}
                    </div>
                  );
                }

                default: {
                  return (
                    <div key={el.id || elementKey} className="flex flex-col">
                      {commonLabel}
                      <input
                        type="text"
                        className="w-full rounded-md border border-gray-200 px-2 py-1 text-xs
                                  focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                        value={String(value)}
                        onChange={(e) =>
                          setFormValues((prev) => ({
                            ...prev,
                            [elementKey]: e.target.value,
                          }))
                        }
                      />
                    </div>
                  );
                }
              }
            })}
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="submit"
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
          >
            제출 &amp; 다음
          </button>
        </div>
      </form>
    );
  }

  if (currentNode.type === "link") {
    const url = currentNode.data?.content ?? "";
    const label = currentNode.data?.display || "열기";
    return (
      <div className="mt-3 flex flex-col gap-2 text-xs">
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-emerald-700 hover:underline"
          >
            <span>{label}</span>
            <span className="text-[10px]">↗</span>
          </a>
        )}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onNextFromLink}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
          >
            다음
          </button>
        </div>
      </div>
    );
  }

  if (currentNode.type === "toast") {
    const message = currentNode.data?.message ?? "{{value}}";

    return (
      <div className="mt-3 flex flex-col gap-2 text-xs">
        <div className="text-gray-700">
          토스트 메시지: <span className="font-medium">{message}</span>
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              // 1) 먼저 모달/토스트 실행
              const renderedMsg = resolveTemplate(message, slotValues);
              showAlert(renderedMsg); // 또는 showAlert(renderedMsg)
              // 2) 다음 노드로 이동
              onNextFromLink();
            }}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
          >
            실행 & 다음
          </button>
        </div>
      </div>
    );
  }

  if (currentNode.type === "delay") {
    return (
      <div className="mt-3 text-right text-[10px] text-gray-500">
        대기 중...
      </div>
    );
  }

  // iframe 노드: 에뮬레이터 안에서 외부 화면 표시 + 계속 버튼
  if (currentNode.type === "iframe") {
    const rawUrl = currentNode.data?.url ?? "";
    const width = Number(currentNode.data?.width || 600);
    const height = Number(currentNode.data?.height || 400);

    // {{base64Data}} 같은 템플릿 치환
    const url = resolveTemplate(rawUrl, slotValues);

    return (
      <div className="mt-3 flex flex-col gap-2 text-xs">
        <div className="overflow-hidden rounded-md border border-gray-200 bg-white">
          {url ? (
            <iframe
              src={url}
              style={{ width: "100%", height }}
              className="block border-0"
            />
          ) : (
            <div className="px-3 py-6 text-center text-gray-400">
              iframe URL이 설정되지 않았습니다.
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={onContinueFromIframe}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
          >
            계속
          </button>
        </div>
      </div>
    );
  }

  return null;
}
