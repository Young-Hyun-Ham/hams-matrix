/* global console */
// src/simulatorUtils.js

// ========================================================================
// == Chatbot Scenario Utility Functions Reference ==
// This file contains utility functions used by the scenario simulator
// (useChatFlow.js). Functions like interpolateMessage and evaluateCondition
// represent the standard way these operations should be performed.
// The actual chatbot engine should use equivalent logic.
// ========================================================================

/**
 * 고유 ID를 생성합니다.
 * @returns {string}
 */
export const generateUniqueId = () =>
  `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

// --- 👇 [수정] interpolateMessage 함수가 {{slot}} 구문을 사용하도록 변경 ---
/**
 * 메시지 문자열 내의 {{slotName}} 구문을 실제 슬롯 값으로 치환하는 함수.
 * 모든 노드 타입에서 이 함수를 사용합니다.
 * @param {string} message - 치환할 대상 문자열
 * @param {object} slots - 현재 슬롯 값 객체
 * @returns {string} 슬롯 값이 치환된 문자열
 */
export const interpolateMessage = (message, slots) => {
  const messageStr = String(message || "");
  if (!messageStr) return "";

  // {{slotName}} 형식의 구문을 찾아 해당 슬롯 값으로 치환
  return messageStr.replace(/{{([^}]+)}}/g, (match, key) => {
    // getNestedValue를 사용하여 슬롯 내부의 객체 값에도 접근 가능하도록 수정
    const value = getNestedValue(slots, key);
    // 값이 객체나 배열인 경우 JSON 문자열로 변환하여 반환
    if (typeof value === "object" && value !== null) {
      return JSON.stringify(value);
    }
    // 값이 undefined가 아니면 해당 값으로, 아니면 원래 문자열({{slotName}}) 유지
    return value !== undefined ? value : match;
  });
};

// --- 👆 [수정 끝] ---

// getNestedValue 함수는 변경 없음
export const getNestedValue = (obj, path) => {
  if (!path) return undefined;
  const normalizedPath = path.replace(/\[(\d+)\]/g, ".$1");
  return normalizedPath.split(".").reduce((acc, part) => {
    if (acc == null) return undefined;
    if (acc[part] !== undefined) return acc[part];
    if (/^\d+$/.test(part) && typeof acc === "object") {
      return Object.values(acc)[Number(part)];
    }
    return undefined;
  }, obj);
};

// validateInput 함수는 변경 없음
export const validateInput = (value, validation) => {
  if (!validation) return true;

  switch (validation.type) {
    case "email":
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    case "phone number":
      return /^\d{2,3}-\d{3,4}-\d{4}$/.test(value);
    case "custom":
      if (validation.regex) {
        // Input type custom
        try {
          return new RegExp(validation.regex).test(value);
        } catch {
          // 변수(_e) 제거 및 console 사용
          console.error("Invalid regex:", validation.regex);
          return false;
        }
      } else if (validation.startDate && validation.endDate) {
        // Date type custom
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
        const selectedDate = new Date(value);
        const startDate = new Date(validation.startDate);
        const endDate = new Date(validation.endDate);
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
        return selectedDate >= startDate && selectedDate <= endDate;
      }
      return true;
    case "today after": {
      // Fix: 중괄호 추가 (Block scope 생성)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
      const selectedDateAfter = new Date(value);
      const todayAfter = new Date();
      todayAfter.setHours(0, 0, 0, 0);
      return selectedDateAfter >= todayAfter;
    }
    case "today before": {
      // Fix: 중괄호 추가 (Block scope 생성)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
      const selectedDateBefore = new Date(value);
      const todayBefore = new Date();
      todayBefore.setHours(23, 59, 59, 999);
      return selectedDateBefore <= todayBefore;
    }
    default:
      return true;
  }
};

// evaluateCondition 함수는 변경 없음
export const evaluateCondition = (slotValue, operator, condition, slots) => {
  let conditionValue = condition.value;
  // valueType이 'slot'이면, slots 객체에서 값을 가져옴
  if (condition.valueType === "slot") {
    conditionValue = getNestedValue(slots, condition.value);
  }

  const lowerCaseConditionValue = String(conditionValue).toLowerCase();
  if (
    lowerCaseConditionValue === "true" ||
    lowerCaseConditionValue === "false"
  ) {
    const boolConditionValue = lowerCaseConditionValue === "true";
    const boolSlotValue = String(slotValue).toLowerCase() === "true";

    switch (operator) {
      case "==":
        return boolSlotValue === boolConditionValue;
      case "!=":
        return boolSlotValue !== boolConditionValue;
      default:
        return false;
    }
  }

  const numSlotValue = parseFloat(slotValue);
  const numConditionValue = parseFloat(conditionValue);

  switch (operator) {
    case "==":
      return slotValue == conditionValue;
    case "!=":
      return slotValue != conditionValue;
    case ">":
      return (
        !isNaN(numSlotValue) &&
        !isNaN(numConditionValue) &&
        numSlotValue > numConditionValue
      );
    case "<":
      return (
        !isNaN(numSlotValue) &&
        !isNaN(numConditionValue) &&
        numSlotValue < numConditionValue
      );
    case ">=":
      return (
        !isNaN(numSlotValue) &&
        !isNaN(numConditionValue) &&
        numSlotValue >= numConditionValue
      );
    case "<=":
      return (
        !isNaN(numSlotValue) &&
        !isNaN(numConditionValue) &&
        numSlotValue <= numConditionValue
      );
    case "contains":
      return slotValue && String(slotValue).includes(conditionValue);
    case "!contains":
      return !slotValue || !String(slotValue).includes(conditionValue);
    default:
      return false;
  }
};
