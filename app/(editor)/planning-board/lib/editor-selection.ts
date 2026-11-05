import type { Layer } from "../components/types";

export function layerIndex(layers: Layer[]) {
  const index = new Map<
    string,
    { layer: Layer; parentId?: string; blocked: boolean }
  >();
  const visit = (items: Layer[], parentId?: string, blocked = false) => {
    for (const layer of items) {
      const denied =
        blocked ||
        layer.locked === true ||
        layer.visible === false ||
        layer.template === true;
      index.set(layer.id, { layer, parentId, blocked: denied });
      if (layer.children) visit(layer.children, layer.id, denied);
    }
  };
  visit(layers);
  return index;
}

export function movableSelection(layers: Layer[], ids: string[]) {
  const index = layerIndex(layers);
  const selected = new Set(
    ids.filter((id) => index.has(id) && !index.get(id)!.blocked),
  );
  return [...selected].filter((id) => {
    let parent = index.get(id)?.parentId;
    while (parent) {
      if (selected.has(parent)) return false;
      parent = index.get(parent)?.parentId;
    }
    return true;
  });
}
