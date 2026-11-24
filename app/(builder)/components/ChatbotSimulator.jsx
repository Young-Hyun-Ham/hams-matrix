import { useState, useCallback } from "react";
import { useBuilderStore } from "../store/index";
import styles from "./ChatbotSimulator.module.css";
import { useChatFlow } from "./controllers/hooks/useChatFlow";
import { interpolateMessage, validateInput } from "../utils/simulatorUtils";
import { toLocaleTimeValue } from "../utils/util";
import SimulatorHeader from "./simulator/SimulatorHeader";
import MessageHistory from "./simulator/MessageHistory";
import UserInput from "./simulator/UserInput";
import apiClient from "@/app/(builder)/services/apiClient";
import {
  mapResponseToTargetElement,
  parseOptionalParameter,
} from "../form-builder/components/CustomElementPropertyEditor";

const DEFAULT_API_HEADERS = `{
  "Content-Type":"application/json",
  "Accept":"application/json"
}`;

const getFormElementKey = (element, fallback = "") =>
  element?.name || element?.id || fallback;

const isEmptyFormValue = (value) =>
  Array.isArray(value)
    ? value.length === 0
    : value && typeof value === "object"
      ? value.fromDate !== undefined
        ? !value.fromDate || (value.toDate !== undefined && !value.toDate)
        : value.from !== undefined
          ? isEmptyFormValue(value.from) || isEmptyFormValue(value.to)
          : value.date !== undefined
            ? !value.date
            : false
      : value == null || String(value).trim() === "";

const isSameGridRow = (left, right) => {
  if (left === right) return true;
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
};

const transformFormValue = (element, value) => {
  if (element?.type !== "input") return value;

  const text = String(value ?? "");
  if (element.transformTextType === "uppercase") return text.toUpperCase();
  if (element.transformTextType === "lowercase") return text.toLowerCase();
  if (element.transformTextType === "capitalize") {
    return text.replace(
      /\w\S*/g,
      (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
    );
  }
  return value;
};

const toDisplayDate = (timestamp) => {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");

  return `${year}-${month}-${day} ${hours}시 ${minutes}분 ${seconds}초`;
};

const toSubmittedLocaleDate = (date, time, hasTime, locale) => {
  const localeDate = toLocaleTimeValue(date, time, hasTime, locale);
  return {
    ...localeDate,
    displayDate: toDisplayDate(localeDate.date),
  };
};

const toGridSlotValue = (gridElement, row) => {
  if (!row || typeof row !== "object") return row;
  if (!Array.isArray(row)) return { ...row };

  const columnCount = Math.max(
    row.length,
    Number(gridElement?.columns) || 0,
    gridElement?.displayKeys?.length || 0,
  );

  return Object.fromEntries(
    Array.from({ length: columnCount }, (_, index) => {
      const displayKey = gridElement?.displayKeys?.[index];
      const headerKey = gridElement?.hasHeader
        ? gridElement?.data?.[index]
        : undefined;
      const key =
        typeof displayKey === "string"
          ? displayKey
          : (displayKey?.key ?? headerKey ?? String(index));
      return [String(key), row[index] ?? ""];
    }),
  );
};

const normalizeSubmittedDate = (element, value) => {
  if (element?.type !== "date") return value;

  const dateValue = value && typeof value === "object" ? value : {};
  const fromDate =
    dateValue.fromDate ??
    dateValue.date ??
    element.fromDateValue ??
    element.dateValue ??
    element.defaultFromValue ??
    element.defaultValue ??
    (typeof value === "string" ? value : "");
  const toDate =
    dateValue.toDate ?? element.toDateValue ?? element.defaultToValue ?? "";
  const fromTime =
    dateValue.fromTime ??
    element.fromTimeValue ??
    element.defaultFromTimeValue ??
    element.defaultTimeValue ??
    "";
  const toTime =
    dateValue.toTime ??
    element.toTimeValue ??
    element.defaultToTimeValue ??
    element.defaultTimeValue ??
    "";

  if (element.hasFromTo) {
    return {
      from: toSubmittedLocaleDate(
        String(fromDate),
        String(fromTime),
        element.hasTime,
        element.locale ?? "ko",
      ),
      to: toSubmittedLocaleDate(
        String(toDate),
        String(toTime),
        element.hasTime,
        element.locale ?? "ko",
      ),
    };
  }

  return toSubmittedLocaleDate(
    String(fromDate),
    String(fromTime),
    element.hasTime,
    element.locale ?? "ko",
  );
};

function ChatbotSimulator({
  nodes,
  edges,
  isVisible,
  isExpanded,
  setIsExpanded,
}) {
  const {
    history,
    setHistory,
    currentId,
    currentNode,
    fixedMenu,
    isStarted,
    startSimulation,
    proceedToNextNode,
  } = useChatFlow(nodes, edges);
  const { slots, setSlots, setSelectedRow } = useBuilderStore();
  const [formData, setFormData] = useState({});
  const [formElementOverrides, setFormElementOverrides] = useState({});

  const getRuntimeFormElements = useCallback(
    (node = currentNode) =>
      node?.type === "form"
        ? formElementOverrides[node.id] || node.data?.elements || []
        : [],
    [currentNode, formElementOverrides],
  );

  const completeCurrentInteraction = () => {
    setHistory((prev) =>
      prev.map((item) =>
        item.nodeId === currentId ? { ...item, isCompleted: true } : item,
      ),
    );
  };

  const handleTextInputSend = (text) => {
    if (!currentNode) return;
    setHistory((prev) => [...prev, { type: "user", message: text }]);
    let newSlots = { ...slots };
    if (currentNode.data.slot) {
      newSlots[currentNode.data.slot] = text;
      setSlots(newSlots);
    }
    proceedToNextNode(null, currentId, newSlots);
  };

  const handleOptionClick = (answer, sourceNodeId = currentId) => {
    const sourceNode = nodes.find((n) => n.id === sourceNodeId);
    if (!sourceNode) return;

    setHistory((prev) => [...prev, { type: "user", message: answer.display }]);
    completeCurrentInteraction();
    let newSlots = { ...slots };
    if (sourceNode.data.slot && sourceNode.type === "slotfilling") {
      newSlots[sourceNode.data.slot] = answer.value;
      setSlots(newSlots);
    }

    const sourceHandleId =
      sourceNode.type === "branch" || sourceNode.type === "fixedmenu"
        ? answer.value
        : null;
    proceedToNextNode(sourceHandleId, sourceNodeId, newSlots);
  };

  const handleStartSimulation = () => {
    setFormData({});
    setFormElementOverrides({});
    startSimulation();
  };

  const buildRuntimeFormApiPayload = useCallback(
    (sourceElement, nextFormData) => {
      const elements = getRuntimeFormElements();
      const sourceValues = {};

      elements.forEach((item, index) => {
        const key = getFormElementKey(item, `element-${index}`);
        const value =
          nextFormData[key] ??
          nextFormData[item.name] ??
          nextFormData[item.id] ??
          item.defaultValue ??
          "";

        if (item.id) sourceValues[item.id] = value;
        if (item.name) sourceValues[item.name] = value;
      });

      const sourceKey = getFormElementKey(sourceElement);
      const sourceValue =
        nextFormData[sourceKey] ??
        nextFormData[sourceElement?.name] ??
        nextFormData[sourceElement?.id] ??
        "";

      sourceValues.value = sourceValue;

      let payload = {};
      try {
        payload = parseOptionalParameter(
          sourceElement?.optionalParameter,
          sourceValues,
        );
      } catch (error) {
        console.warn("Invalid Optional Parameter JSON:", error);
      }

      return payload;
    },
    [getRuntimeFormElements],
  );

  const applyApiResponseToTargetElement = useCallback(
    (sourceElement, response) => {
      if (!currentNode || currentNode.type !== "form") return;

      const elements = getRuntimeFormElements();
      const targetElement = elements.find(
        (item) => item.id === sourceElement?.targetElementId,
      );

      if (!targetElement) return;

      const mappedTarget = mapResponseToTargetElement(
        targetElement,
        response,
        sourceElement?.responsePath,
      );

      setFormElementOverrides((prev) => ({
        ...prev,
        [currentNode.id]: elements.map((item) =>
          item.id === mappedTarget.id ? mappedTarget : item,
        ),
      }));

      const targetKey = getFormElementKey(targetElement);
      setFormData((prev) => {
        if (!(targetKey in prev)) return prev;

        const options = mappedTarget.options || [];
        const allowedValues = new Set(
          options.map((option, index) => {
            if (option && typeof option === "object") {
              return String(option.value ?? option.label ?? index + 1);
            }
            return String(option ?? "");
          }),
        );
        const currentValue = prev[targetKey];
        const isStillValid = Array.isArray(currentValue)
          ? currentValue.every((item) => allowedValues.has(String(item)))
          : allowedValues.has(String(currentValue));

        return isStillValid ? prev : { ...prev, [targetKey]: "" };
      });
    },
    [currentNode, getRuntimeFormElements],
  );

  const runFormElementApi = useCallback(
    async (element, nextFormData) => {
      const endpoint = element?.apiData?.endPoint?.trim();
      if (!endpoint || !element?.targetElementId) return;

      const method = String(element.apiData?.method || "get").toLowerCase();
      const headersText =
        element.apiData?.headers?.trim() || DEFAULT_API_HEADERS;

      try {
        const headers = JSON.parse(headersText);
        const payload = buildRuntimeFormApiPayload(element, nextFormData);
        const parameterKey = element.parameterId?.trim();
        const sourceKey = getFormElementKey(element);
        const parameterParams = parameterKey
          ? {
              [parameterKey]: nextFormData[sourceKey] ?? "",
            }
          : {};
        const response =
          method === "get" || method === "delete"
            ? await apiClient[method](endpoint, {
                params: {
                  ...payload,
                  ...parameterParams,
                },
                headers,
              })
            : await apiClient[method](endpoint, payload, {
                params: parameterParams,
                headers,
              });

        applyApiResponseToTargetElement(element, response);
      } catch (error) {
        console.error("Form element onchange API call failed:", error);
      }
    },
    [applyApiResponseToTargetElement, buildRuntimeFormApiPayload],
  );

  const handleFormInputChange = (elementOrName, value, apiValue = value) => {
    const element =
      typeof elementOrName === "object" && elementOrName !== null
        ? elementOrName
        : null;
    const elementName = element ? getFormElementKey(element) : elementOrName;

    const nextValue = transformFormValue(element, value);
    const nextFormData = { ...formData, [elementName]: nextValue };
    setFormData(nextFormData);

    if (element?.eventType === "onChange") {
      void runFormElementApi(element, {
        ...nextFormData,
        [elementName]: apiValue === value ? nextValue : apiValue,
      });
    }
  };

  const handleFormMultiInputChange = (
    elementOrName,
    value,
    checked,
    apiValue,
  ) => {
    const element =
      typeof elementOrName === "object" && elementOrName !== null
        ? elementOrName
        : null;
    const elementName = element ? getFormElementKey(element) : elementOrName;

    setFormData((prev) => {
      const existingValues = prev[elementName] || [];
      const newValues = checked
        ? [...existingValues, value]
        : existingValues.filter((v) => v !== value);
      const nextFormData = { ...prev, [elementName]: newValues };

      if (element?.eventType === "onChange") {
        void runFormElementApi(element, {
          ...nextFormData,
          [elementName]: apiValue ?? newValues,
        });
      }

      return nextFormData;
    });
  };

  const handleFormSubmit = () => {
    const elements = getRuntimeFormElements();
    const submittedFormData = { ...formData };

    for (const element of elements) {
      if ("defaultValue" in element) {
        const key = getFormElementKey(element);
        if (!key) continue;

        if (!Object.prototype.hasOwnProperty.call(submittedFormData, key)) {
          submittedFormData[key] =
            element.type === "date" && element.hasFromTo
              ? {
                  from: element.fromValue ?? element.defaultFromValue ?? "",
                  to: element.toValue ?? element.defaultToValue ?? "",
                }
              : (interpolateMessage(element.defaultValue, slots) ?? "");
        }
        const value = submittedFormData[key];
        if (element.requires && isEmptyFormValue(value)) {
          alert(`'${element.label}' is required.`);
          return;
        }

        if (element.type !== "input" || isEmptyFormValue(value)) continue;

        const textValue = String(value);
        const lengthIsInvalid =
          (element.minLength && textValue.length < Number(element.minLength)) ||
          (element.maxLength && textValue.length > Number(element.maxLength));
        let customRegexIsInvalid = false;
        if (element.validation?.type === "custom" && element.regex) {
          try {
            customRegexIsInvalid = !new RegExp(element.regex).test(textValue);
          } catch {
            customRegexIsInvalid = true;
          }
        }

        if (
          !validateInput(value, element.validation) ||
          lengthIsInvalid ||
          customRegexIsInvalid
        ) {
          let alertMessage = `'${element.label}' input is not valid.`;
          alert(alertMessage);
          return;
        }
      }
    }

    elements.forEach((element, index) => {
      const key = getFormElementKey(
        element,
        `${element?.type || "element"}-${index}`,
      );
      if (!key) return;
      submittedFormData[key] = normalizeSubmittedDate(
        element,
        submittedFormData[key],
      );
    });

    completeCurrentInteraction();
    const gridElements = elements.filter((element) => element?.type === "grid");
    const gridElement = gridElements[0];
    const gridIndex = elements.findIndex((element) => element === gridElement);
    const gridKey = gridElement
      ? getFormElementKey(gridElement, `grid-${gridIndex}`)
      : "";
    const gridValue = gridKey ? submittedFormData[gridKey] : undefined;
    const selectedRows = Array.isArray(gridValue) ? gridValue : undefined;
    const selectedRowIds = selectedRows
      ?.map((row) => row?.id)
      .filter((id) => id !== undefined && id !== null);
    gridElements.forEach((element, index) => {
      const elementIndex = elements.findIndex((item) => item === element);
      const elementKey = getFormElementKey(
        element,
        `grid-${elementIndex >= 0 ? elementIndex : index}`,
      );
      const elementRows = Array.isArray(submittedFormData[elementKey])
        ? submittedFormData[elementKey]
        : [];
      if (elementRows.length > 0) {
        submittedFormData[elementKey] = elementRows.map((row) =>
          toGridSlotValue(element, row),
        );
      }
    });
    const slotKey = currentNode?.data?.slotKey?.trim();
    const newSlots = { ...slots, ...submittedFormData };

    if (
      slotKey &&
      !Object.prototype.hasOwnProperty.call(submittedFormData, slotKey)
    ) {
      const previousSlotValue = newSlots[slotKey];
      newSlots[slotKey] = {
        ...(previousSlotValue &&
        typeof previousSlotValue === "object" &&
        !Array.isArray(previousSlotValue)
          ? previousSlotValue
          : {}),
        ...submittedFormData,
        ...(selectedRows !== undefined ? { selectedRows } : {}),
        ...(selectedRowIds?.length ? { selectedRowIds } : {}),
      };
    }

    // selectedRow 슬롯은 생성하지 않는다. 다중 선택은 selectedRows를 사용한다.
    // newSlots.selectedRow = ...; // 단일 selectedRow 슬롯은 생성하지 않는다.
    delete newSlots.selectedRow;
    delete newSlots.selectedRowId;
    if (selectedRows !== undefined) newSlots.selectedRows = selectedRows;
    if (selectedRowIds?.length) newSlots.selectedRowIds = selectedRowIds;

    setSlots(newSlots);
    setSelectedRow(null);
    setFormData({});
    setHistory((prev) => [
      ...prev,
      { type: "user", message: "Form submitted." },
    ]);
    proceedToNextNode(null, currentId, newSlots);
  };

  const handleFormDefault = () => {
    if (!currentNode || currentNode.type !== "form") return;
    const defaultData = {};
    getRuntimeFormElements().forEach((element) => {
      const key = getFormElementKey(element);
      if (key && element.defaultValue !== undefined) {
        defaultData[key] =
          element.type === "date"
            ? {
                date: element.dateValue || element.defaultValue || "",
                fromDate:
                  element.fromDateValue ||
                  element.defaultFromValue ||
                  element.defaultValue ||
                  "",
                toDate: element.toDateValue || element.defaultToValue || "",
                fromTime:
                  element.fromTimeValue ||
                  element.defaultFromTimeValue ||
                  element.defaultTimeValue ||
                  "",
                toTime:
                  element.toTimeValue ||
                  element.defaultToTimeValue ||
                  element.defaultTimeValue ||
                  "",
              }
            : element.defaultValue;
      }
    });
    setFormData(defaultData);
  };

  /**
   * 그리드 행 클릭 시 호출되는 핸들러.
   * 1. 폼 상호작용 완료 처리
   * 2. 'selectedRow' 슬롯에 클릭된 행의 데이터 저장
   * 3. 다음 노드로 진행
   */
  const handleFormElementApiCall = useCallback(
    async (clickedElement) => {
      if (!currentNode || currentNode.type !== "form") {
        return;
      }
      const element = getRuntimeFormElements().find(
        (e) => e.id === clickedElement.id,
      );

      if (!element || !element.apiConfig || !element.resultSlot) {
        alert(
          "Search element is not configured correctly. (Missing API URL or Result Slot)",
        );
        return;
      }

      const { apiConfig, resultSlot } = element;
      const searchTerm = formData[getFormElementKey(element)] || "";

      // 💡 수정: slots와 formData를 모두 포함하여 폼의 다른 필드 값을 API 파라미터로 사용할 수 있게 합니다.
      const allValues = { ...slots, ...formData, value: searchTerm };
      const method = apiConfig.method || "POST";

      const parseOptionalParameters = () => {
        const rawOptionalParameter = element.optionalParameter?.trim();
        if (!rawOptionalParameter) return {};

        try {
          const interpolatedOptionalParameter = interpolateMessage(
            rawOptionalParameter,
            allValues,
          );
          const parsedOptionalParameter = JSON.parse(
            interpolatedOptionalParameter,
          );

          if (
            parsedOptionalParameter &&
            typeof parsedOptionalParameter === "object" &&
            !Array.isArray(parsedOptionalParameter)
          ) {
            return parsedOptionalParameter;
          }
        } catch (error) {
          console.warn(
            "Invalid Optional Parameter JSON or interpolation error:",
            rawOptionalParameter,
            error,
          );
        }

        return {};
      };

      try {
        let interpolatedUrl = interpolateMessage(apiConfig.url, allValues);
        const optionalParameters = parseOptionalParameters();

        // Headers 처리
        const rawHeaders = apiConfig.headers || "{}";
        let interpolatedHeaders = {};
        try {
          const interpolatedHeadersString = interpolateMessage(
            rawHeaders,
            allValues,
          );
          interpolatedHeaders = JSON.parse(interpolatedHeadersString);
        } catch (e) {
          console.warn(
            "Invalid Headers JSON or interpolation error:",
            rawHeaders,
            e,
          );
        }

        const fetchOptions = {
          method: method,
          headers: {
            // 기본 Content-Type 설정 및 interpolatedHeaders 병합
            "Content-Type": "application/json",
            ...interpolatedHeaders,
          },
        };

        if (method === "GET") {
          // GET 요청 시 Body 필드를 제거
          delete fetchOptions.headers["Content-Type"];
          if (Object.keys(optionalParameters).length > 0) {
            const url = new URL(interpolatedUrl, window.location.origin);
            Object.entries(optionalParameters).forEach(([key, value]) => {
              url.searchParams.set(
                key,
                typeof value === "string" ? value : JSON.stringify(value),
              );
            });
            interpolatedUrl = url.toString();
          }
        } else if (method === "POST") {
          const interpolatedBody = interpolateMessage(
            apiConfig.bodyTemplate || "{}",
            allValues,
          );
          try {
            fetchOptions.body = JSON.stringify({
              ...JSON.parse(interpolatedBody),
              ...optionalParameters,
            });
          } catch {
            fetchOptions.body = interpolatedBody;
          }
        }

        const response = await fetch(interpolatedUrl, fetchOptions);

        if (!response.ok) {
          throw new Error(`API call failed with status ${response.status}`);
        }

        const responseData = await response.json();

        const newSlots = { ...slots, [resultSlot]: responseData };
        setSlots(newSlots);
      } catch (error) {
        console.error("Form element API call failed:", error);
        alert(`Search failed: ${error.message}`);
      }
    },
    [formData, slots, setSlots, currentNode, getRuntimeFormElements],
  );

  const handleGridRowClick = (rowData, gridElement) => {
    // Keep the form active while rows are being selected. Submission advances it.
    const searchElement = getRuntimeFormElements().find(
      (element) =>
        element.type === "search" &&
        element.resultSlot === gridElement?.optionsSlot,
    );
    const fillKey =
      searchElement?.inputFillKey ||
      (rowData && typeof rowData === "object" && !Array.isArray(rowData)
        ? Object.keys(rowData)[0]
        : null);
    const selectedValue = fillKey ? rowData?.[fillKey] : undefined;
    setFormData((prev) => {
      const gridKey = getFormElementKey(gridElement);
      if (!gridKey) return prev;
      const selectedRows = Array.isArray(prev[gridKey]) ? prev[gridKey] : [];
      const isSelected = selectedRows.some((row) =>
        isSameGridRow(row, rowData),
      );
      const nextSelectedRows = isSelected
        ? selectedRows.filter((row) => !isSameGridRow(row, rowData))
        : [...selectedRows, rowData];
      const nextFormData = { ...prev, [gridKey]: nextSelectedRows };
      if (searchElement && selectedValue !== undefined && !isSelected) {
        nextFormData[getFormElementKey(searchElement)] = selectedValue;
      }
      return nextFormData;
    });
  };
  // --- 💡 [추가 끝] ---

  // <<< [추가] 엑셀 업로드 버튼 핸들러 (임시) >>>
  const handleExcelUpload = () => {
    // TODO: 실제 엑셀 업로드 및 파싱 로직 구현 필요
    alert("Excel Upload button clicked! (Logic not implemented yet)");
    // 예: 엑셀 파일 읽기 -> JSON 변환 -> setFormData(jsonData)
  };
  // <<< [추가 끝] >>>

  return (
    <div className={`${styles.simulator} ${isExpanded ? styles.expanded : ""}`}>
      <SimulatorHeader
        isVisible={isVisible}
        isExpanded={isExpanded}
        setIsExpanded={setIsExpanded}
        onStart={handleStartSimulation}
      />

      {fixedMenu && (
        <div className={styles.fixedMenuContainer}>
          <p className={styles.fixedMenuTitle}>{fixedMenu.content}</p>
          <div className={styles.fixedMenuButtons}>
            {fixedMenu.replies?.map((reply) => (
              <button
                key={reply.value}
                className={styles.fixedMenuButton}
                onClick={() => handleOptionClick(reply, fixedMenu.nodeId)}
              >
                {reply.display}
              </button>
            ))}
          </div>
        </div>
      )}

      {!isStarted ? (
        <div className={styles.history}>
          <div className={styles.startScreen}></div>
        </div>
      ) : (
        <MessageHistory
          history={history}
          nodes={nodes}
          onOptionClick={handleOptionClick}
          handleFormSubmit={handleFormSubmit}
          handleFormDefault={handleFormDefault}
          formData={formData}
          handleFormInputChange={handleFormInputChange}
          handleFormMultiInputChange={handleFormMultiInputChange}
          formElementOverrides={formElementOverrides}
          handleGridRowClick={handleGridRowClick}
          onExcelUpload={handleExcelUpload}
          handleFormElementApiCall={handleFormElementApiCall}
        />
      )}
      {/* 
      <UserInput
        currentNode={currentNode}
        isStarted={isStarted}
        onTextInputSend={handleTextInputSend}
        onOptionClick={handleOptionClick}
      />
      */}
    </div>
  );
}

export default ChatbotSimulator;
