import "server-only";
import { formGrid, formOptions } from "@/lib/chatbot/form-fields";
import type { Graph, GraphNode } from "@/lib/chatbot/types";
import { fail, object, text } from "@/lib/chatbot/server";
import {
  findNextExecutableNode,
  findRootNode,
  resolveExecutableNode,
} from "../components/emulator/core/graph";
import { resolveConditionBranchHandle } from "../components/emulator/core/conditions";
import { getFormNodeData } from "../components/emulator/core/formNode";
export const safeKey = (v: string) =>
  !["__proto__", "constructor", "prototype"].includes(v);
export function pathValue(v: unknown, path: string): unknown {
  for (const key of path
    .replace(/^\$\.?/, "")
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter(Boolean)) {
    if (!safeKey(key) || !v || typeof v !== "object" || !Object.hasOwn(v, key))
      return undefined;
    v = (v as Record<string, unknown>)[key];
  }
  return v;
}
export const interpolate = (value: unknown, slots: Record<string, unknown>) =>
  String(value ?? "").replace(
    /\{\{\s*([^}]+?)\s*\}\}/g,
    (_match, name: string) => {
      const v = pathValue(slots, name);
      return v == null
        ? ""
        : typeof v === "object"
          ? JSON.stringify(v)
          : String(v);
    },
  );
export function validateGraph(raw: unknown): Graph {
  const b = object(raw);
  if (
    JSON.stringify(b).length > 1500000 ||
    !Array.isArray(b.nodes) ||
    !b.nodes.length ||
    b.nodes.length > 500 ||
    !Array.isArray(b.edges) ||
    b.edges.length > 1500
  )
    fail(400, "시나리오 크기 또는 그래프 형식을 확인해 주세요.");
  const supported = new Set([
    "start",
    "end",
    "message",
    "branch",
    "form",
    "slotfilling",
    "setSlot",
    "delay",
    "api",
    "llm",
    "scenario",
    "selectionGroup",
    "group",
    "fixedmenu",
    "link",
    "toast",
    "iframe",
  ]);
  const nodes = b.nodes.map((rawNode) => {
    const n = object(rawNode),
      type = text(n.type, 50),
      data = object(n.data ?? {}),
      id = text(n.id, 150);
    if (!supported.has(type)) fail(400, `지원하지 않는 노드: ${type}`);
    // Credentials in a graph are not a connector credential store.
    const rawData = JSON.stringify(data);
    if (
      /"(?:apiKey|api_key|authorization|password|access_token|secret)"\s*:\s*"[^"\s][^"]*"/i.test(
        rawData,
      ) ||
      /Bearer\s+[\w.-]{8,}|\bsk-(?:proj-)?[\w-]{20,}/i.test(rawData)
    )
      fail(
        400,
        "시나리오에서 비밀값을 제거하고 서버 연결 설정을 사용해 주세요.",
      );
    if (type === "api" && data.headers) {
      let headers: Record<string, unknown>;
      try {
        headers = object(
          typeof data.headers === "string"
            ? JSON.parse(data.headers)
            : data.headers,
        );
      } catch {
        return fail(400, "API 헤더 형식을 확인해 주세요.");
      }
      if (
        Object.keys(headers).some(
          (key) => !["accept", "content-type"].includes(key.toLowerCase()),
        )
      )
        fail(400, "API 인증 헤더는 서버 커넥터 설정을 사용해 주세요.");
    }
    if (type === "form") {
      const form = getFormNodeData({ id, type, data });
      data.elements = form.elements ?? [];
      data.title = form.title ?? data.title;
      data.slotKey = form.slotKey ?? data.slotKey;
      for (const rawField of data.elements as unknown[]) {
        const f = object(rawField);
        if (
          ![
            "input",
            "search",
            "textarea",
            "number",
            "date",
            "time",
            "checkbox",
            "radio",
            "dropbox",
            "select",
            "grid",
            "label",
          ].includes(String(f.type))
        )
          fail(400, `지원하지 않는 폼 요소: ${String(f.type)}`);
        if (f.api || f.apiUrl || f.onChangeApi)
          fail(400, "폼 API는 승인 가능한 API 노드로 분리해 주세요.");
      }
    }
    return {
      id,
      type: type === "group" ? "scenario" : type,
      data,
      parentNode: n.parentNode
        ? String(n.parentNode)
        : n.parentId
          ? String(n.parentId)
          : undefined,
    };
  });
  const ids = new Set(nodes.map((n) => n.id));
  if (ids.size !== nodes.length) fail(400, "중복 노드 ID가 있습니다.");
  for (const n of nodes) {
    if (n.parentNode && (!ids.has(n.parentNode) || n.parentNode === n.id))
      fail(400, "그룹 참조가 올바르지 않습니다.");
    let parent = n.parentNode;
    const parents = new Set([n.id]);
    while (parent) {
      if (parents.has(parent) || parents.size > 8)
        fail(400, "그룹 순환 또는 중첩 한도를 초과했습니다.");
      parents.add(parent);
      parent = nodes.find((v) => v.id === parent)?.parentNode;
    }
    if (
      ["scenario", "selectionGroup", "group"].includes(n.type) &&
      !nodes.some((v) => v.parentNode === n.id)
    )
      fail(
        400,
        "중첩 시나리오의 실행 노드가 없습니다. 그래프를 펼쳐 포함해 주세요.",
      );
  }
  const edges = b.edges.map((rawEdge, index) => {
    const e = object(rawEdge),
      source = text(e.source, 150),
      target = text(e.target, 150);
    if (!ids.has(source) || !ids.has(target))
      fail(400, "연결선의 노드가 없습니다.");
    return {
      id: String(e.id || "edge-" + index),
      source,
      target,
      sourceHandle:
        e.sourceHandle == null ? null : text(e.sourceHandle, 150, 0),
    };
  });
  const startNodeId = b.startNodeId ? text(b.startNodeId, 150) : null;
  if (startNodeId && !ids.has(startNodeId)) fail(400, "시작 노드가 없습니다.");
  const graph = { nodes, edges, startNodeId };
  if (!first(graph)) fail(400, "실행할 시작 노드가 없습니다.");
  return graph;
}
export function first(g: Graph): GraphNode | null {
  const node = g.startNodeId
    ? g.nodes.find((n) => n.id === g.startNodeId)
    : undefined;
  return (
    node
      ? resolveExecutableNode(g.nodes, g.edges, node)
      : findRootNode(g.nodes, g.edges)
  ) as GraphNode | null;
}
export const next = (g: Graph, id: string, handle?: string) =>
  findNextExecutableNode(g.nodes, g.edges, id, handle) as GraphNode | null;
export const condition = (n: GraphNode, slots: Record<string, unknown>) =>
  resolveConditionBranchHandle(n.data, slots);
export function fieldKey(raw: unknown, index: number) {
  const f = object(raw);
  const key = String(f.name || f.id || `${f.type}-${index}`);
  if (!safeKey(key)) fail(400, "폼 필드 이름을 확인해 주세요.");
  return key;
}
export function inputValues(
  node: GraphNode,
  raw: unknown,
  slots: Record<string, unknown> = {},
) {
  const values = object(raw),
    output: Record<string, unknown> = {};
  const elements = Array.isArray(node.data.elements) ? node.data.elements : [];
  for (const [i, rawField] of elements.entries()) {
    const f = object(rawField),
      key = fieldKey(f, i),
      value =
        values[key] ??
        f.defaultValue ??
        (f.type === "grid" ||
        (f.type === "checkbox" &&
          (f.optionsSlot || (Array.isArray(f.options) && f.options.length)))
          ? []
          : f.type === "checkbox"
            ? false
            : "");
    if (f.type === "date") {
      const parseDate = (rawDate: unknown, required: unknown) => {
        const dateText = String(rawDate ?? "");
        if (!dateText) {
          if (required) fail(400, "날짜를 입력해 주세요.");
          return { date: 0, locale: String(f.locale || "ko"), displayDate: "" };
        }
        if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2})?$/.test(dateText))
          fail(400, "날짜 형식을 확인해 주세요.");
        const [date, time] = dateText.split("T"),
          stamp = Date.parse(
            date +
              "T" +
              (time || String(f.defaultTimeValue || "00:00")) +
              ":00+09:00",
          );
        if (
          !Number.isFinite(stamp) ||
          new Date(stamp + 9 * 3600000).toISOString().slice(0, 10) !== date
        )
          fail(400, "유효하지 않은 날짜입니다.");
        return {
          date: stamp,
          locale: String(f.locale || "ko"),
          displayDate: date + " " + (time || "00:00"),
        };
      };
      if (f.hasFromTo) {
        const from = parseDate(
            values[key + ".from"] ?? f.defaultFromValue,
            f.required,
          ),
          to = parseDate(values[key + ".to"] ?? f.defaultToValue, f.required);
        if (from.date && to.date && from.date > to.date)
          fail(400, "날짜 범위를 확인해 주세요.");
        output[key] = { from, to };
      } else output[key] = parseDate(value, f.required);
      continue;
    }
    if (
      f.required &&
      (value === "" ||
        value == null ||
        value === false ||
        (Array.isArray(value) && !value.length))
    )
      fail(400, `${String(f.label || f.name || key)} 값을 입력해 주세요.`);
    if (JSON.stringify(value).length > 20000)
      fail(400, "폼 입력 크기를 초과했습니다.");
    if (
      (f.type === "number" || f.inputType === "number") &&
      value !== "" &&
      !Number.isFinite(Number(value))
    )
      fail(400, "숫자 입력을 확인해 주세요.");
    if (typeof value === "object" && !Array.isArray(value))
      fail(400, "폼 입력 형식을 확인해 주세요.");
    const options = formOptions(f, slots);
    if (
      ["select", "dropbox", "radio"].includes(String(f.type)) &&
      value !== "" &&
      !options.some((o) => o.value === String(value))
    )
      fail(400, "선택지에 없는 입력입니다.");
    if (
      f.type === "checkbox" &&
      options.length &&
      (!Array.isArray(value) ||
        value.some((v) => !options.some((o) => o.value === String(v))))
    )
      fail(400, "체크박스 선택값을 확인해 주세요.");
    if (f.type === "grid") {
      const grid = formGrid(f, slots);
      if (
        !Array.isArray(value) ||
        value.some(
          (i) =>
            !Number.isSafeInteger(i) ||
            Number(i) < 0 ||
            Number(i) >= grid.rows.length,
        )
      )
        fail(400, "그리드 선택값을 확인해 주세요.");
      const selected = value.map((i) => grid.rows[Number(i)]);
      output[key] = selected;
      output.selectedRows = selected;
      output.selectedRowIds = selected
        .map((r) => r.id)
        .filter((v) => v != null);
      continue;
    }
    output[key] = value;
  }
  return output;
}
