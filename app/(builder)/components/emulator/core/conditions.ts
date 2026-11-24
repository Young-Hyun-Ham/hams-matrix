function getNestedValue(source: Record<string, any>, path?: string) {
  if (!path) return undefined;
  return path
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter(Boolean)
    .reduce<any>((value, key) => value?.[key], source);
}

function evaluateCondition(
  slotValue: unknown,
  operator: string,
  condition: Record<string, any>,
  slots: Record<string, any>,
) {
  const conditionValue =
    condition.valueType === "slot"
      ? getNestedValue(slots, condition.value)
      : condition.value;
  const normalizedCondition = String(conditionValue).toLowerCase();

  if (normalizedCondition === "true" || normalizedCondition === "false") {
    const left = String(slotValue).toLowerCase() === "true";
    const right = normalizedCondition === "true";
    return operator === "=="
      ? left === right
      : operator === "!=" && left !== right;
  }

  const leftNumber = Number.parseFloat(String(slotValue));
  const rightNumber = Number.parseFloat(String(conditionValue));
  switch (operator) {
    case "==":
      return String(slotValue) === String(conditionValue);
    case "!=":
      return String(slotValue) !== String(conditionValue);
    case ">":
      return (
        Number.isFinite(leftNumber) &&
        Number.isFinite(rightNumber) &&
        leftNumber > rightNumber
      );
    case "<":
      return (
        Number.isFinite(leftNumber) &&
        Number.isFinite(rightNumber) &&
        leftNumber < rightNumber
      );
    case ">=":
      return (
        Number.isFinite(leftNumber) &&
        Number.isFinite(rightNumber) &&
        leftNumber >= rightNumber
      );
    case "<=":
      return (
        Number.isFinite(leftNumber) &&
        Number.isFinite(rightNumber) &&
        leftNumber <= rightNumber
      );
    case "contains":
      return String(slotValue ?? "").includes(String(conditionValue ?? ""));
    case "!contains":
      return !String(slotValue ?? "").includes(String(conditionValue ?? ""));
    default:
      return false;
  }
}

export function resolveConditionBranchHandle(
  nodeData: Record<string, any>,
  slots: Record<string, any>,
) {
  const conditions = Array.isArray(nodeData.conditions)
    ? nodeData.conditions
    : [];
  const replies = Array.isArray(nodeData.replies) ? nodeData.replies : [];

  for (let index = 0; index < conditions.length; index += 1) {
    const condition = conditions[index];
    const handle = replies[index]?.value;
    if (!condition || !handle) continue;
    if (
      evaluateCondition(
        getNestedValue(slots, condition.slot),
        condition.operator,
        condition,
        slots,
      )
    ) {
      return String(handle);
    }
  }
  return "default";
}
