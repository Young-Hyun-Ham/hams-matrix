const typeLabels = {
  start: "Start",
  message: "Message",
  slotfilling: "SlotFilling",
  api: "API",
  branch: "Condition Branch",
  form: "Form",
  fixedmenu: "Fixed Menu",
  link: "Link",
  llm: "LLM",
  toast: "Toast",
  iframe: "iFrame",
  scenario: "Scenario",
  scenarioGroup: "Scenario",
  selectionGroup: "Group",
  setSlot: "Set Slot",
  delay: "Delay",
  ynBranch: "Y/N Branch",
};

/** @param {string} type */
export function getNodeTypeLabel(type) {
  return typeLabels[type] || type || "Node";
}

/**
 * @param {string} type
 * @param {Record<string, any>} data
 * @param {string} [typeLabel]
 */
export function getNodeTitle(
  type,
  data = {},
  typeLabel = getNodeTypeLabel(type),
) {
  return typeof data.title === "string" && data.title.trim()
    ? data.title.trim()
    : typeLabel;
}

/** @template {{type?: string, data?: Record<string, any>}} T @param {T} node */
export function withNodeTitle(node) {
  return {
    ...node,
    data: {
      ...node.data,
      title: getNodeTitle(node.type || "", node.data),
    },
  };
}
