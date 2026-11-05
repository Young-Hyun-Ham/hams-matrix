import type { Layer } from "../components/types";

export function selectItems(layer: Layer) {
  return (layer.optionItems ?? [{ display: "Option", value: "option" }])
    .map((item, index) => ({ ...item, index }))
    .filter((item) => item.display.trim());
}
