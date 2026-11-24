// app/(content-header)/chatbot/components/emulator/core/graph.ts
import type { AnyEdge, AnyNode } from "../types";
import { resolveGroupApiNextNode } from "@/app/(builder)/core/scenario-core/src/engine/groupApiRouting";

function isGroupNode(node: AnyNode | null | undefined) {
  return node?.type === "scenario" || node?.type === "selectionGroup";
}

function getOutgoingEdge(
  edges: AnyEdge[],
  currentId: string,
  handle?: string | null,
): AnyEdge | null {
  const candidates = edges.filter((e) => e.source === currentId);
  if (!candidates.length) return null;

  if (handle) {
    const matched = candidates.find((e) => e.sourceHandle === handle);
    if (matched) return matched;
    if (handle === "onError") {
      const legacyError = candidates.find((e) => e.sourceHandle === "onFail");
      if (legacyError) return legacyError;
    }
  }

  const defaultEdge = candidates.find((e) => e.sourceHandle === "default");
  if (defaultEdge) return defaultEdge;

  return candidates.find((e) => !e.sourceHandle) ?? candidates[0] ?? null;
}

export function findGroupEntryNode(
  nodes: AnyNode[],
  edges: AnyEdge[],
  groupNode: AnyNode,
): AnyNode | null {
  const childNodes = nodes.filter((n) => n.parentNode === groupNode.id);
  if (!childNodes.length) return null;

  const childIds = new Set(childNodes.map((n) => n.id));

  const explicitEntryId = groupNode.data?.entryNodeId;
  if (explicitEntryId) {
    return childNodes.find((n) => n.id === explicitEntryId) ?? null;
  }

  return (
    childNodes.find(
      (n) => !edges.some((e) => e.target === n.id && childIds.has(e.source)),
    ) ?? childNodes[0]
  );
}

export function resolveExecutableNode(
  nodes: AnyNode[],
  edges: AnyEdge[],
  node: AnyNode | null,
): AnyNode | null {
  if (!node) return null;

  if (isGroupNode(node)) {
    return findGroupEntryNode(nodes, edges, node) ?? null;
  }

  return node;
}

/** 루트 노드 찾기 */
export function findRootNode(
  nodes: AnyNode[],
  edges: AnyEdge[],
): AnyNode | null {
  const topLevelNodes = nodes.filter((n) => !n.parentNode);
  const targets = new Set(edges.map((e) => e.target));

  const root =
    topLevelNodes.find((n) => !targets.has(n.id)) ?? topLevelNodes[0] ?? null;

  return resolveExecutableNode(nodes, edges, root);
}

/** 다음 실행 가능한 노드 찾기 */
export function findNextExecutableNode(
  nodes: AnyNode[],
  edges: AnyEdge[],
  currentId: string,
  handle?: string | null,
): AnyNode | null {
  const currentNode = nodes.find((n) => n.id === currentId) ?? null;
  if (!currentNode) return null;

  const groupApiNext = resolveGroupApiNextNode(
    { nodes, edges, version: "1.0" },
    currentId,
    handle === "onFail" ? "onError" : (handle ?? null),
  );
  if (groupApiNext !== undefined) {
    if (groupApiNext) return resolveExecutableNode(nodes, edges, groupApiNext);
    return currentNode.parentNode
      ? findNextExecutableNode(nodes, edges, currentNode.parentNode, null)
      : null;
  }

  const nextEdge = getOutgoingEdge(edges, currentId, handle);

  if (nextEdge) {
    const rawNextNode = nodes.find((n) => n.id === nextEdge.target) ?? null;
    return resolveExecutableNode(nodes, edges, rawNextNode);
  }

  if (currentNode.parentNode) {
    return findNextExecutableNode(nodes, edges, currentNode.parentNode, null);
  }

  return null;
}
