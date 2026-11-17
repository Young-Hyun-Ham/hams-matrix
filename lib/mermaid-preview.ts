export function safeMermaidSvg(source: string) {
  const doc = new DOMParser().parseFromString(source, "image/svg+xml");
  if (
    doc.querySelector("parsererror") ||
    doc.documentElement.localName !== "svg"
  )
    throw new Error("미리보기 SVG 형식이 올바르지 않습니다.");
  const tags = new Set([
    "svg",
    "g",
    "defs",
    "marker",
    "path",
    "rect",
    "circle",
    "ellipse",
    "line",
    "polyline",
    "polygon",
    "text",
    "tspan",
    "title",
    "desc",
    "style",
    "clipPath",
  ]);
  const unsafeUrl = (value: string) =>
    value.includes("\\") ||
    Array.from(value.matchAll(/url\(([^)]*)\)/gi)).some(
      (match) =>
        !/^#[\w.:-]+$/.test(match[1].trim().replace(/^["']|["']$/g, "")),
    );
  const svgId = doc.documentElement.getAttribute("id");
  for (const element of Array.from(doc.querySelectorAll("*"))) {
    if (!tags.has(element.localName)) {
      element.remove();
      continue;
    }
    if (
      element.localName === "style" &&
      (/@import|(?:https?|data|javascript):/i.test(element.textContent ?? "") ||
        unsafeUrl(element.textContent ?? ""))
    ) {
      element.remove();
      continue;
    }
    // Inline SVG CSS belongs to the host document too. Parse and scope both
    // root and descendant selectors, keeping comma lists inside :is().
    if (element.localName === "style") {
      if (!svgId) { element.remove(); continue; }
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(element.textContent ?? "");
      const scope = `#${CSS.escape(svgId)}`;
      const scopedCss = Array.from(sheet.cssRules)
        .filter((rule): rule is CSSStyleRule => rule instanceof CSSStyleRule)
        .map((rule) => `${scope}:is(${rule.selectorText}), ${scope} :is(${rule.selectorText}) {${rule.style.cssText}}`)
        .join("\n");
      // XML serialization escapes CSS child combinators as &gt;, which an
      // inline SVG <style> does not decode. Foreign-content CDATA preserves
      // selectors without allowing </style> to escape into the HTML document.
      element.replaceChildren(doc.createCDATASection(scopedCss.replaceAll("]]>", "]]\\3e ")));
    }
    for (const attr of Array.from(element.attributes)) {
      if (
        /^on/i.test(attr.name) ||
        /href/i.test(attr.name) ||
        (/(?:javascript:|data:|https?:|@import)/i.test(attr.value) &&
          !attr.name.startsWith("xmlns")) ||
        unsafeUrl(attr.value)
      )
        element.removeAttribute(attr.name);
    }
  }
  return new XMLSerializer().serializeToString(doc.documentElement);
}
export function readableMermaidLabels(svg: SVGSVGElement, fallback: string) {
  for (const group of svg.querySelectorAll<SVGGElement>(
    "g.node, g.cluster, g.edgeLabel",
  )) {
    const shape = group.querySelector<SVGElement>(
      "rect, polygon, circle, ellipse, path",
    );
    const fill = shape ? getComputedStyle(shape).fill : "";
    const rgb = fill.match(/^rgba?\(\s*(\d+)[, ]+\s*(\d+)[, ]+\s*(\d+)/);
    let color = fallback;
    if (rgb && !/rgba\([^)]*,\s*0\s*\)/.test(fill)) {
      const luminance = [1, 2, 3]
        .map((index) => Number(rgb[index]) / 255)
        .map((channel) =>
          channel <= 0.04045
            ? channel / 12.92
            : ((channel + 0.055) / 1.055) ** 2.4,
        )
        .reduce(
          (sum, channel, index) =>
            sum + channel * [0.2126, 0.7152, 0.0722][index],
          0,
        );
      color = luminance > 0.179 ? "#172033" : "#f4f4fb";
    }
    for (const text of group.querySelectorAll<SVGElement>("text, tspan")) {
      text.style.setProperty("fill", color, "important");
      text.style.setProperty("color", color, "important");
    }
  }
}
