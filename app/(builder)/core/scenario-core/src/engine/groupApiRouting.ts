import type { ScenarioData, ScenarioNode } from "../types/index";

// undefined means this rule does not apply; null means the group sequence ended.
export function resolveGroupApiNextNode(
  scenario: ScenarioData,
  nodeId: string,
  handle: string | null,
): ScenarioNode | null | undefined {
  const node = scenario.nodes.find((item) => item.id === nodeId);
  const parent = scenario.nodes.find((item) => item.id === node?.parentNode);
  if (node?.type !== "api" || parent?.type !== "selectionGroup")
    return undefined;

  if (handle === "onError") {
    const errorEdge =
      scenario.edges.find(
        (edge) => edge.source === nodeId && edge.sourceHandle === "onError",
      ) ??
      scenario.edges.find(
        (edge) => edge.source === nodeId && edge.sourceHandle === "onFail",
      );
    if (errorEdge) {
      return (
        scenario.nodes.find((item) => item.id === errorEdge.target) ?? null
      );
    }
  }

  const children = scenario.nodes
    .filter((item) => item.parentNode === parent.id)
    .sort((a, b) => {
      if (a.data?.groupOrder != null && b.data?.groupOrder != null) {
        return a.data.groupOrder - b.data.groupOrder;
      }
      if (a.type === "branch" && b.type !== "branch") return 1;
      if (a.type !== "branch" && b.type === "branch") return -1;
      return ((a as any).position?.y ?? 0) - ((b as any).position?.y ?? 0);
    });
  return children[children.findIndex((item) => item.id === nodeId) + 1] ?? null;
}
