import type { Edge, Node } from "reactflow";

export function isContainerCollapsed(node: Node, hasChildren: boolean) {
  return node.data?.isCollapsed ?? (node.type === "scenario" && !hasChildren);
}

export function projectScenarioCanvas(nodes: Node[], edges: Edge[]) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const children = new Map<string, Node[]>();
  for (const node of nodes) {
    if (!node.parentNode || !byId.has(node.parentNode)) continue;
    const siblings = children.get(node.parentNode) ?? [];
    siblings.push(node);
    children.set(node.parentNode, siblings);
  }

  const visible: Node[] = [];
  const visited = new Set<string>();
  function visit(node: Node, x = 0, y = 0) {
    if (visited.has(node.id) || node.hidden) return { right: 0, bottom: 0 };
    visited.add(node.id);
    const index = visible.push(node) - 1;
    const descendants = children.get(node.id) ?? [];
    const scenario = node.type === "scenario";
    const group = node.type === "selectionGroup";
    const collapsed =
      (scenario || group) && isContainerCollapsed(node, descendants.length > 0);
    const position = { x: node.position.x + x, y: node.position.y + y };
    const offsetX = scenario
      ? Math.max(
          0,
          ...descendants
            .filter((child) => !child.hidden)
            .map((child) => 24 - child.position.x),
        )
      : 0;
    const offsetY = scenario
      ? Math.max(
          0,
          ...descendants
            .filter((child) => !child.hidden)
            .map((child) => 86 - child.position.y),
        )
      : 0;

    let right = 0;
    let bottom = 0;
    if (!collapsed) {
      for (const child of descendants) {
        const bounds = visit(child, offsetX, offsetY);
        right = Math.max(right, bounds.right);
        bottom = Math.max(bottom, bounds.bottom);
      }
    }

    let width =
      node.width || Number.parseFloat(String(node.style?.width)) || 250;
    let height =
      node.height || Number.parseFloat(String(node.style?.height)) || 100;
    if (scenario) {
      width = collapsed ? 450 : Math.max(450, right + 40);
      height = collapsed ? 72 : Math.max(120, bottom + 52);
      visible[index] = {
        ...node,
        position,
        data: { ...node.data, isCollapsed: collapsed },
        style: { ...node.style, width, height },
      };
    } else if (group && !collapsed && descendants.length) {
      width = Math.max(420, Number(node.style?.width) || width, right + 40);
      height = Math.max(260, Number(node.style?.height) || height, bottom + 52);
      visible[index] = {
        ...node,
        position,
        style: { ...node.style, width, height },
      };
    } else if (x || y) {
      visible[index] = { ...node, position };
    }

    return {
      right: position.x + Math.max(width, right),
      bottom: position.y + Math.max(height, bottom),
    };
  }

  for (const node of nodes) {
    if (!node.parentNode || !byId.has(node.parentNode)) visit(node);
  }
  return {
    nodes: visible,
    edges: edges.filter(
      (edge) => visited.has(edge.source) && visited.has(edge.target),
    ),
  };
}
