import type {
  GeneratedDocument,
  GeneratedElement,
  Layer,
  LayerPosition,
  LayerSize,
  LayerStyle,
} from "../components/types";
const defaultLayerSize = (kind: Layer["kind"]): LayerSize =>
  kind === "page"
    ? { width: 860, height: 560 }
    : kind === "section" || kind === "layer"
      ? { width: 150, height: 100 }
      : kind === "text" || kind === "button" || kind === "select"
        ? { width: 110, height: 32 }
        : kind === "checkbox" || kind === "radio"
          ? { width: 140, height: 32 }
          : kind === "icon"
            ? { width: 32, height: 32 }
            : { width: 110, height: 80 };

function findPageId(
  items: Layer[],
  id: string,
  pageId = "",
): string | undefined {
  for (const item of items) {
    const currentPageId = item.kind === "page" ? item.id : pageId;
    if (item.id === id) return currentPageId;
    const found = item.children && findPageId(item.children, id, currentPageId);
    if (found) return found;
  }
}

export function createAiDocument(
  title: string,
  layers: Layer[],
  sizes: Record<string, LayerSize>,
  positions: Record<string, LayerPosition>,
  layerText: Record<string, string>,
  layerStyles: Record<string, LayerStyle>,
  selected: string,
): GeneratedDocument {
  const pages = layers
    .filter((layer) => layer.kind === "page")
    .map((page, pageIndex) => {
      const pageSize = sizes[page.id] ?? defaultLayerSize("page");
      const elements: GeneratedElement[] = [];
      const appendElements = (items: Layer[], parentId: string) => {
        items.forEach((layer) => {
          if (layer.kind === "page" || layer.template) return;
          const size = sizes[layer.id] ?? defaultLayerSize(layer.kind);
          const position = positions[layer.id] ?? { x: 0, y: 0 };
          const style = layerStyles[layer.id] ?? {};
          elements.push({
            id: layer.id,
            parentId,
            name: layer.name,
            kind: layer.kind,
            text: layerText[layer.id] ?? layer.name,
            x: position.x,
            y: position.y,
            width: size.width,
            height: size.height,
            fontSize: style.fontSize ?? 14,
            lineHeight: style.lineHeight ?? 1.4,
            fontWeight: style.fontWeight ?? 400,
            color: style.color ?? "#18181b",
            backgroundColor: style.backgroundColor ?? "transparent",
            borderColor: style.borderColor ?? "transparent",
            borderWidth: style.borderWidth ?? 0,
            opacity: style.opacity ?? 1,
            borderRadius: style.borderRadius ?? 0,
            textAlign: style.textAlign ?? "left",
            verticalAlign: style.verticalAlign ?? "middle",
            effect: style.effect ?? "none",
            iconInstance: layer.iconInstance ?? "",
            iconSize: layer.iconSize ?? 22,
            iconType: layer.iconType ?? "",
            iconColor: layer.iconColor ?? style.color ?? "#18181b",
            optionLabel: layer.optionLabel ?? "Option",
            optionCount: Math.max(1, layer.optionCount ?? 1),
            optionOrientation: layer.optionOrientation ?? "horizontal",
            optionItems: layer.optionItems ?? [],
            selectMode: layer.selectMode ?? "single",
            visible: layer.visible !== false,
            locked: layer.locked === true,
          });
          if (layer.children) appendElements(layer.children, layer.id);
        });
      };
      appendElements(page.children ?? [], page.id);
      return {
        id: page.id,
        name: page.name,
        x: positions[page.id]?.x ?? pageIndex * 940,
        y: positions[page.id]?.y ?? 0,
        width: pageSize.width,
        height: pageSize.height,
        backgroundColor: layerStyles[page.id]?.backgroundColor ?? "#f7f4ef",
        visible: page.visible !== false,
        locked: page.locked === true,
        elements,
      };
    });
  return {
    title,
    activePageId: findPageId(layers, selected) ?? pages[0]?.id ?? "page",
    pages,
  };
}

export function createEditorState(
  document: GeneratedDocument,
  currentImages: Record<string, string>,
) {
  const sizes: Record<string, LayerSize> = {};
  const positions: Record<string, LayerPosition> = {};
  const text: Record<string, string> = {};
  const styles: Record<string, LayerStyle> = {};
  const images: Record<string, string> = {};
  const layers: Layer[] = document.pages.map((page) => {
    sizes[page.id] = { width: page.width, height: page.height };
    positions[page.id] = { x: page.x, y: page.y };
    styles[page.id] = { backgroundColor: page.backgroundColor };
    const byId = new Map<string, Layer>();
    page.elements.forEach((element) => {
      const container = element.kind === "section" || element.kind === "layer";
      byId.set(element.id, {
        id: element.id,
        name: element.name,
        kind: element.kind,
        iconType: element.iconType,
        iconInstance: element.iconInstance,
        iconSize: element.iconSize,
        iconColor: element.iconColor,
        optionLabel: element.optionLabel,
        optionCount: element.optionCount,
        optionOrientation: element.optionOrientation,
        optionItems: element.optionItems,
        selectMode: element.selectMode ?? "single",
        visible: element.visible,
        locked: element.locked,
        children: container ? [] : undefined,
      });
      sizes[element.id] = { width: element.width, height: element.height };
      positions[element.id] = { x: element.x, y: element.y };
      styles[element.id] = {
        fontSize: element.fontSize,
        lineHeight: element.lineHeight,
        fontWeight: element.fontWeight,
        color: element.color,
        backgroundColor: element.backgroundColor,
        borderColor: element.borderColor,
        borderWidth: element.borderWidth,
        opacity: element.opacity,
        borderRadius: element.borderRadius,
        textAlign: element.textAlign,
        verticalAlign: element.verticalAlign ?? "middle",
        effect: element.effect,
      };
      if (element.kind === "text" || element.kind === "button") {
        text[element.id] = element.text;
      }
      if (
        (element.kind === "image" || element.kind === "clipboard") &&
        currentImages[element.id]
      )
        images[element.id] = currentImages[element.id];
    });
    const children: Layer[] = [];
    page.elements.forEach((element) => {
      const layer = byId.get(element.id);
      if (!layer) return;
      const parent = byId.get(element.parentId);
      if (parent && (parent.kind === "section" || parent.kind === "layer")) {
        parent.children?.push(layer);
      } else {
        children.push(layer);
      }
    });
    return {
      id: page.id,
      name: page.name,
      kind: "page",
      visible: page.visible,
      locked: page.locked,
      children,
    };
  });
  return { layers, sizes, positions, text, styles, images };
}
