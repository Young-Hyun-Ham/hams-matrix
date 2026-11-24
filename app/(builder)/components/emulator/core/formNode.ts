import type { AnyNode } from "../types";

type FormNodeData = Record<string, any>;

function parseObject(value: unknown): FormNodeData | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as FormNodeData;
  }
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as FormNodeData)
      : null;
  } catch {
    return null;
  }
}

/** Normalize canvas nodes and saved form-builder document shapes. */
export function getFormNodeData(node: AnyNode | null): FormNodeData {
  const nodeData = parseObject(node?.data) ?? {};
  const containers = [
    nodeData,
    parseObject(nodeData.data),
    parseObject(nodeData.formData),
    parseObject(nodeData.form),
    parseObject(nodeData.formJson),
    parseObject(nodeData.form_elem),
    parseObject(nodeData.formElem),
  ];
  const candidates = containers.flatMap((container) =>
    container ? [container, parseObject(container.data)] : [],
  );
  return (
    candidates.find(
      (candidate) =>
        Array.isArray(candidate?.elements) && candidate.elements.length > 0,
    ) ??
    candidates.find((candidate) => Array.isArray(candidate?.elements)) ??
    nodeData
  );
}
