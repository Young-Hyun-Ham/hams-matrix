import type { PreviewDocument } from "../components/types";
type Document = Pick<
  PreviewDocument,
  "layers" | "sizes" | "positions" | "layerText" | "layerImages" | "layerStyles"
>;

export function deleteSelection(document: Document, requested: string[]) {
  const entries = new Map<
    string,
    { parent?: string; locked: boolean; layer: Document["layers"][number] }
  >();
  const visit = (
    layers: Document["layers"],
    parent?: string,
    locked = false,
  ) => {
    for (const layer of layers) {
      const protectedLayer =
        locked || layer.locked === true || layer.template === true;
      entries.set(layer.id, { parent, locked: protectedLayer, layer });
      if (layer.children) visit(layer.children, layer.id, protectedLayer);
    }
  };
  visit(document.layers);
  const selected = new Set(requested.filter((id) => entries.has(id)));
  if (!selected.size) return null;
  const removed = new Set<string>();
  const collect = (id: string) => {
    const entry = entries.get(id)!;
    if (entry.locked)
      throw new Error("잠긴 요소가 포함되어 삭제할 수 없습니다.");
    removed.add(id);
    entry.layer.children?.forEach((child) => collect(child.id));
  };
  for (const id of selected) collect(id);
  const prune = (layers: Document["layers"]): Document["layers"] =>
    layers
      .filter((layer) => !removed.has(layer.id))
      .map((layer) =>
        layer.children ? { ...layer, children: prune(layer.children) } : layer,
      );
  const layers = prune(document.layers);
  if (!layers.some((layer) => layer.kind === "page"))
    throw new Error("최소 한 개의 페이지는 남겨야 합니다.");
  const filter = <T>(map: Record<string, T>) =>
    Object.fromEntries(Object.entries(map).filter(([id]) => !removed.has(id)));
  let nextId = entries.get([...selected][0])?.parent;
  while (nextId && removed.has(nextId)) nextId = entries.get(nextId)?.parent;
  nextId ??= layers.find((layer) => layer.kind === "page")!.id;
  return {
    document: {
      layers,
      sizes: filter(document.sizes),
      positions: filter(document.positions),
      layerText: filter(document.layerText),
      layerImages: filter(document.layerImages),
      layerStyles: filter(document.layerStyles),
    },
    nextId,
    removed,
  };
}

export function isDeleteShortcut(event: {
  key: string;
  repeat: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  defaultPrevented: boolean;
  target: EventTarget | null;
  nativeEvent?: { isComposing: boolean };
}) {
  return (
    event.key === "Delete" &&
    !event.repeat &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    !event.defaultPrevented &&
    !event.nativeEvent?.isComposing &&
    !(
      event.target instanceof Element &&
      event.target.closest("input,textarea,select,[contenteditable=true]")
    ) &&
    !document.querySelector(
      ".planning-root dialog[open],.planning-root .emoji-panel,.planning-root .canvas-context-menu,.planning-root .layer-context-menu,.planning-root .page-menu",
    )
  );
}
