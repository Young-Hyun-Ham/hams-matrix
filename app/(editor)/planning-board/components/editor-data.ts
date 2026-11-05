import type { Layer } from "./types";

export const layers: Layer[] = [
  { id: "page", name: "Page", kind: "page", children: [] },
];

export function findLayerName(id: string, items = layers): string {
  for (const item of items) {
    if (item.id === id) return item.name;
    const found = item.children && findLayerName(id, item.children);
    if (found) return found;
  }
  return "";
}

export function findLayerById(id: string, items = layers): Layer | undefined {
  for (const item of items) {
    if (item.id === id) return item;
    const found = item.children && findLayerById(id, item.children);
    if (found) return found;
  }
}

export type PublishingTarget = "css" | "html5" | "react" | "astro" | "svelte";
export type PublishingCode = Record<PublishingTarget, string>;
export type CanvasSource = {
  markup: string;
  reactMarkup: string;
  templateMarkup?: string;
  css: string;
};

const jsxAttributeNames: Record<string, string> = {
  class: "className",
  for: "htmlFor",
  tabindex: "tabIndex",
  readonly: "readOnly",
  maxlength: "maxLength",
  minlength: "minLength",
  colspan: "colSpan",
  rowspan: "rowSpan",
  autocomplete: "autoComplete",
  autofocus: "autoFocus",
  crossorigin: "crossOrigin",
  charset: "charSet",
  srcset: "srcSet",
  "http-equiv": "httpEquiv",
  viewbox: "viewBox",
  preserveaspectratio: "preserveAspectRatio",
  "xmlns:xlink": "xmlnsXlink",
  "xlink:href": "xlinkHref",
  "stroke-width": "strokeWidth",
  "stroke-linecap": "strokeLinecap",
  "stroke-linejoin": "strokeLinejoin",
  "stroke-miterlimit": "strokeMiterlimit",
  "fill-rule": "fillRule",
  "clip-rule": "clipRule",
};

const booleanAttributes = new Set([
  "allowFullScreen",
  "autoFocus",
  "checked",
  "controls",
  "default",
  "disabled",
  "formNoValidate",
  "hidden",
  "loop",
  "multiple",
  "muted",
  "noValidate",
  "open",
  "playsInline",
  "readOnly",
  "required",
  "reversed",
  "selected",
]);

function escapeJsxText(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("{", "&#123;")
    .replaceAll("}", "&#125;");
}

function serializeJsx(node: Node, jsx = true): string {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? "";
    return !jsx || /\s/.test(text)
      ? `{${JSON.stringify(text)}}`
      : escapeJsxText(text);
  }
  if (!(node instanceof Element)) return "";

  const tagName = node.tagName.toLowerCase();
  const attributes = Array.from(node.attributes)
    .map(({ name, value }) => {
      if (!jsx)
        return `${name}="${value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("{", "&#123;").replaceAll("}", "&#125;")}"`;
      const normalizedName = name.toLowerCase();
      const attributeName =
        jsxAttributeNames[normalizedName] ??
        (normalizedName.startsWith("data-") ||
        normalizedName.startsWith("aria-")
          ? normalizedName
          : name.replace(/-([a-z])/g, (_, letter: string) =>
              letter.toUpperCase(),
            ));
      if (booleanAttributes.has(attributeName) && value === "") {
        return attributeName;
      }
      return `${attributeName}={${JSON.stringify(value)}}`;
    })
    .join(" ");
  const openingTag = attributes ? `<${tagName} ${attributes}` : `<${tagName}`;
  const children = Array.from(node.childNodes)
    .map((child) => serializeJsx(child, jsx))
    .join("");

  if (!children) return `${openingTag} />`;
  return `${openingTag}>${children}</${tagName}>`;
}

const copiedStyleProperties = [
  "display",
  "position",
  "left",
  "top",
  "width",
  "height",
  "boxSizing",
  "padding",
  "margin",
  "gap",
  "gridTemplateColumns",
  "gridTemplateRows",
  "flexDirection",
  "flexWrap",
  "flexGrow",
  "flexShrink",
  "alignItems",
  "alignContent",
  "justifyContent",
  "overflow",
  "background",
  "backgroundColor",
  "backgroundImage",
  "backgroundSize",
  "backgroundPosition",
  "border",
  "borderRadius",
  "boxShadow",
  "color",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "lineHeight",
  "letterSpacing",
  "textAlign",
  "textDecoration",
  "opacity",
  "filter",
  "transform",
  "transformOrigin",
  "whiteSpace",
  "overflowWrap",
  "wordBreak",
  "tabSize",
  "objectFit",
  "zIndex",
] as const;

function copyComputedStyles(source: Element, target: Element) {
  if (!(source instanceof HTMLElement || source instanceof SVGElement)) return;
  if (!(target instanceof HTMLElement || target instanceof SVGElement)) return;

  const computed = window.getComputedStyle(source);
  const style = target.style;
  for (const property of copiedStyleProperties) {
    const value = computed[property];
    if (value) style[property] = value;
  }

  Array.from(source.children).forEach((child, index) => {
    const targetChild = target.children[index];
    if (targetChild) copyComputedStyles(child, targetChild);
  });
}

export function captureCanvasSource(): CanvasSource {
  if (typeof document === "undefined") {
    return { markup: "", reactMarkup: "", css: "" };
  }
  const source = document.querySelector<HTMLElement>(
    ".planning-root .canvas-workspace",
  );
  if (!source) return { markup: "", reactMarkup: "", css: "" };

  const clone = source.cloneNode(true) as HTMLElement;
  copyComputedStyles(source, clone);
  clone.style.transform = "none";
  clone
    .querySelectorAll(
      ".resize-overlay, .canvas-memo, .comment-popover, .canvas-marquee, .canvas-multi-selection",
    )
    .forEach((element) => element.remove());
  clone.querySelectorAll(".canvas-node-selected").forEach((element) => {
    element.classList.remove("canvas-node-selected");
    if (element instanceof HTMLElement) {
      element.style.outline = "none";
      element.style.outlineOffset = "0";
    }
  });
  clone
    .querySelectorAll("[contenteditable]")
    .forEach((element) => element.removeAttribute("contenteditable"));

  const sourceControls = source.querySelectorAll<
    HTMLInputElement | HTMLOptionElement
  >("input, option");
  const clonedControls = clone.querySelectorAll<
    HTMLInputElement | HTMLOptionElement
  >("input, option");
  sourceControls.forEach((control, index) => {
    const clonedControl = clonedControls[index];
    if (!clonedControl) return;
    if (control instanceof HTMLInputElement) {
      if (control.checked) clonedControl.setAttribute("checked", "");
      else clonedControl.removeAttribute("checked");
      return;
    }
    if (control.selected) clonedControl.setAttribute("selected", "");
    else clonedControl.removeAttribute("selected");
  });

  const styleClasses = new Map<string, string>();
  const rules: string[] = [];
  [
    clone,
    ...Array.from(clone.querySelectorAll<HTMLElement | SVGElement>("*")),
  ].forEach((element) => {
    const cssText = element.style.cssText.trim();
    if (!cssText) {
      element.removeAttribute("class");
      element.removeAttribute("style");
      return;
    }
    let className = styleClasses.get(cssText);
    if (!className) {
      className = `pb-style-${styleClasses.size + 1}`;
      styleClasses.set(cssText, className);
      rules.push(`.${className} { ${cssText} }`);
    }
    element.setAttribute("class", className);
    element.removeAttribute("style");
  });

  return {
    markup: clone.outerHTML,
    reactMarkup: serializeJsx(clone),
    templateMarkup: serializeJsx(clone, false),
    css: `html, body { margin: 0; min-height: 100%; }\nbody { overflow: auto; }\n${rules.join("\n")}`,
  };
}

export function createPublishingCode(
  markup: string,
  css = "",
  reactMarkup = markup,
  templateMarkup = markup,
): PublishingCode {
  return {
    css,
    html5: `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Planning Board Export</title>
    <link rel="stylesheet" href="./style.css" />
  </head>
  <body>
    ${markup}
  </body>
</html>`,
    react: `import "./style.css";

export default function PlanningBoardPage() {
  return (
    ${reactMarkup}
  );
}`,
    astro: `---
import "./style.css";
---

${templateMarkup}`,
    svelte: `<script lang="ts">
  import "./style.css";
</script>

${templateMarkup}`,
  };
}
