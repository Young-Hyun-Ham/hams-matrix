// app/(content-header)/chatbot/components/emulator/handlers/createUiHandlers.ts
import type { AnyNode } from "../types";
import { makeStepId } from "../utils";
import { findNextExecutableNode } from "../core/graph";
import { getFormNodeData } from "../core/formNode";

const toDateSlotValue = (
  dateValue: unknown,
  timeValue: unknown,
  hasTime: boolean,
  locale: string,
) => {
  const dateText = String(dateValue ?? "");
  const timeText = String(timeValue ?? "");
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText);
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(timeText);

  if (!dateMatch) return { date: 0, locale, displayDate: "" };

  const date = new Date(
    Number(dateMatch[1]),
    Number(dateMatch[2]) - 1,
    Number(dateMatch[3]),
    hasTime && timeMatch ? Number(timeMatch[1]) : 0,
    hasTime && timeMatch ? Number(timeMatch[2]) : 0,
    0,
    0,
  );
  const timestamp = date.getTime();
  const pad = (value: number) => String(value).padStart(2, "0");

  return {
    date: timestamp,
    locale,
    displayDate: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}시 ${pad(date.getMinutes())}분 ${pad(date.getSeconds())}초`,
  };
};

export function createUiHandlers(deps: {
  // graph
  nodes: AnyNode[];
  edges: any[];

  // state
  currentNode: AnyNode | null;
  setCurrentNodeId: (v: string | null) => void;
  setFinished: (v: boolean) => void;

  // values
  formValues: Record<string, any>;
  setSlotValues: React.Dispatch<React.SetStateAction<Record<string, any>>>;

  // step pushers
  pushUserStep: (id: string, text: string) => void;

  // engine
  logToEngine: (payload: any, params: any) => void;
  engineProps: any;
}) {
  const {
    nodes,
    edges,
    currentNode,
    setCurrentNodeId,
    setFinished,
    formValues,
    setSlotValues,
    pushUserStep,
    logToEngine,
    engineProps,
  } = deps;

  const handleContinueFromMessage = () => {
    if (!currentNode) return;

    const next = findNextExecutableNode(nodes, edges, currentNode.id, null);
    if (!next) {
      setFinished(true);
      return;
    }

    setCurrentNodeId(next.id);

    // ✅ message만 즉시 출력 (form/branch/link/iframe/slotfilling은 autoRunner가 진입 시 1회 출력)
  };

  const handleContinueFromLlm = () => {
    if (!currentNode) return;

    const next =
      findNextExecutableNode(nodes, edges, currentNode.id, "default") ||
      findNextExecutableNode(nodes, edges, currentNode.id, null);

    if (!next) {
      setFinished(true);
      return;
    }

    setCurrentNodeId(next.id);

    logToEngine(
      { action: { type: "reply", value: "continue", display: "continue" } },
      engineProps,
    );
  };

  const handleBranchClick = (reply: { display: string; value: string }) => {
    if (!currentNode) return;

    pushUserStep(makeStepId(`${currentNode.id}-${reply.value}`), reply.display);

    const next = findNextExecutableNode(
      nodes,
      edges,
      currentNode.id,
      reply.value,
    );
    if (!next) {
      setFinished(true);
      return;
    }

    setCurrentNodeId(next.id);

    // ✅ message만 즉시 출력

    logToEngine(
      { action: { type: "reply", value: reply.value, display: reply.display } },
      engineProps,
    );
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentNode) return;

    const formNodeData = getFormNodeData(currentNode);
    const elements: any[] = formNodeData.elements ?? [];
    const summaryParts: string[] = [];

    const formSlotKey: string | undefined = formNodeData.slotKey;
    const formObject: Record<string, any> = {};

    const formatAny = (v: any): string => {
      if (v === null || v === undefined) return "";
      if (
        typeof v === "string" ||
        typeof v === "number" ||
        typeof v === "boolean"
      )
        return String(v);
      try {
        return JSON.stringify(v);
      } catch {
        return String(v);
      }
    };

    const submittedValues: Record<string, any> = {};

    for (const [index, el] of elements.entries()) {
      const elementKey = String(
        el?.name || el?.id || `${el?.type || "element"}-${index}`,
      );
      let value = formValues[elementKey];

      if (el?.type === "date" && el.hasFromTo) {
        value = {
          from: toDateSlotValue(
            formValues[`${elementKey}.from`] ?? el.defaultFromValue ?? "",
            formValues[`${elementKey}.from.time`] ??
              el.defaultFromTimeValue ??
              "",
            Boolean(el.hasTime),
            el.locale ?? "ko",
          ),
          to: toDateSlotValue(
            formValues[`${elementKey}.to`] ?? el.defaultToValue ?? "",
            formValues[`${elementKey}.to.time`] ?? el.defaultToTimeValue ?? "",
            Boolean(el.hasTime),
            el.locale ?? "ko",
          ),
        };
      } else if (el?.type === "date") {
        value = toDateSlotValue(
          value ?? el.defaultValue ?? "",
          formValues[`${elementKey}.time`] ?? el.defaultTimeValue ?? "",
          Boolean(el.hasTime),
          el.locale ?? "ko",
        );
      } else if (value === undefined) {
        value = el?.defaultValue;
      }

      submittedValues[elementKey] = value;

      if (value !== undefined && value !== null && value !== "") {
        formObject[elementKey] = value;
      }

      if (el?.type === "grid") {
        const selectedRows = Array.isArray(value)
          ? value
          : value && typeof value === "object"
            ? [value]
            : [];
        if (selectedRows.length > 0) {
          const label = el.label || el.name || el.type || elementKey;
          summaryParts.push(
            `${label}:\n${JSON.stringify(selectedRows, null, 2)}`,
          );
        }
        continue;
      }

      if (value === undefined || value === null || value === "") continue;
      const label = el.label || el.name || el.type || elementKey;
      summaryParts.push(`${label}: ${formatAny(value)}`);
    }

    // grid 선택값을 top-level 슬롯(selectedRow)로 저장 (grid element name 자동 탐지)
    const gridEl = elements.find((el) => el?.type === "grid");
    const gridIndex = elements.findIndex((el) => el === gridEl);
    const gridName: string | undefined = gridEl
      ? String(gridEl.name || gridEl.id || `grid-${gridIndex}`)
      : undefined;

    // grid 값은 대부분 formValues[gridName]에 들어있음
    const gridValue =
      (gridName ? formValues[gridName] : undefined) ??
      formValues.selectedRow ??
      formObject.selectedRow;

    const selectedRows = Array.isArray(gridValue) ? gridValue : undefined;
    const toGridSlotValue = (row: any) => {
      if (!row || typeof row !== "object") return row;
      if (gridEl?.optionsSlot && !Array.isArray(row)) return { ...row };

      const columnCount = Math.max(
        Number(gridEl?.columns) || 0,
        gridEl?.displayKeys?.length || 0,
        Array.isArray(row) ? row.length : Object.keys(row).length,
      );
      return Object.fromEntries(
        Array.from({ length: columnCount }, (_, index) => {
          const displayKey = gridEl?.displayKeys?.[index];
          const headerKey = gridEl?.hasHeader
            ? gridEl?.data?.[index]
            : undefined;
          const key =
            typeof displayKey === "string"
              ? displayKey
              : (displayKey?.key ?? headerKey ?? String(index));
          return [String(key), row[index] ?? row[String(index)] ?? ""];
        }),
      );
    };
    const selectedGridValues = selectedRows?.map(toGridSlotValue);

    const selectedRowIds = selectedRows
      ?.map((row) => row?.id)
      .filter((id) => id !== undefined && id !== null);

    // ✅ slotValues 업데이트는 1회로 통합 (top-level + formSlotKey 아래 동시 저장)
    setSlotValues((prev: any) => {
      // Builder execution exposes every form element as a top-level slot.
      // Keep the grouped slotKey object as an additional view of the same data.
      if (gridName && selectedGridValues !== undefined) {
        submittedValues[gridName] = selectedGridValues;
        formObject[gridName] = selectedGridValues;
      }
      const next = { ...prev, ...submittedValues };

      // 1) 폼 slotKey 아래 저장(기존 formObject 유지 + selectedRow/Id 추가)
      if (
        formSlotKey &&
        !Object.prototype.hasOwnProperty.call(submittedValues, formSlotKey)
      ) {
        const prevFormSlot = next?.[formSlotKey] ?? {};
        next[formSlotKey] = {
          ...prevFormSlot,
          ...formObject,
          ...(selectedRows !== undefined ? { selectedRows } : {}),
          ...(selectedRowIds?.length ? { selectedRowIds } : {}),
        };
      }

      // 2) top-level에도 저장(템플릿 치환용)
      // selectedRow 슬롯은 생성하지 않는다. 다중 선택은 selectedRows를 사용한다.
      // next.selectedRow = ...; // 단일 selectedRow 슬롯은 생성하지 않는다.
      delete next.selectedRow;
      delete next.selectedRowId;
      if (selectedRows !== undefined) next.selectedRows = selectedRows;
      if (selectedRowIds?.length) next.selectedRowIds = selectedRowIds;

      return next;
    });

    pushUserStep(
      makeStepId(`${currentNode.id}-form`),
      summaryParts.length > 0 ? summaryParts.join("\n") : "폼을 제출했습니다.",
    );

    const next = findNextExecutableNode(nodes, edges, currentNode.id, null);
    if (!next) {
      setFinished(true);
      return;
    }

    setCurrentNodeId(next.id);

    // ✅ message만 즉시 출력 (link/form/branch 등은 autoRunner가 진입 시 1회 출력)

    logToEngine(
      { action: { type: "reply", value: submittedValues, display: "form" } },
      engineProps,
    );
  };

  const handleNextFromLink = () => {
    if (!currentNode) return;

    const next = findNextExecutableNode(nodes, edges, currentNode.id, null);
    if (!next) {
      setFinished(true);
      return;
    }

    setCurrentNodeId(next.id);

    // ✅ message만 즉시 출력

    logToEngine(
      { action: { type: "reply", value: "continue", display: "continue" } },
      engineProps,
    );
  };

  const handleContinueFromIframe = () => {
    if (!currentNode) return;

    const next = findNextExecutableNode(nodes, edges, currentNode.id, null);
    if (!next) {
      setFinished(true);
      return;
    }

    setCurrentNodeId(next.id);

    // ✅ message만 즉시 출력

    logToEngine(
      { action: { type: "reply", value: "continue", display: "continue" } },
      engineProps,
    );
  };

  const handleSlotFillingClick = (reply: { display: string; value: any }) => {
    if (!currentNode) return;

    const slotName: string =
      currentNode.data?.slot ?? currentNode.data?.slotName ?? "";
    if (slotName)
      setSlotValues((prev) => ({ ...prev, [slotName]: reply.value }));

    const handle = String(reply.value);
    const next =
      findNextExecutableNode(nodes, edges, currentNode.id, handle) ||
      findNextExecutableNode(nodes, edges, currentNode.id, "default") ||
      findNextExecutableNode(nodes, edges, currentNode.id, null);

    if (!next) {
      setFinished(true);
      return;
    }

    setCurrentNodeId(next.id);

    // ✅ message만 즉시 출력

    logToEngine(
      { action: { type: "reply", value: reply.value, display: reply.display } },
      engineProps,
    );
  };

  return {
    handleContinueFromMessage,
    handleContinueFromLlm,
    handleBranchClick,
    handleSubmitForm,
    handleNextFromLink,
    handleContinueFromIframe,
    handleSlotFillingClick,
  };
}
