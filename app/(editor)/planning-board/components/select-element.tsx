import { useState } from "react";
import { selectItems } from "../lib/select-options";
import type { Layer } from "./types";

export function SelectElement({
  layer,
  readOnly = false,
  onRemove,
}: {
  layer: Layer;
  readOnly?: boolean;
  onRemove?: (index: number) => void;
}) {
  const [removed, setRemoved] = useState<number[]>([]);
  const items = selectItems(layer);
  if (layer.selectMode !== "multi") {
    return (
      <select aria-label={layer.name} defaultValue={items[0]?.value ?? ""}>
        {!items.length && <option value="" />}
        {items.map((item) => (
          <option key={item.index} value={item.value}>
            {item.display}
          </option>
        ))}
      </select>
    );
  }
  return (
    <span className="planning-select-multi" aria-label={layer.name}>
      <span className="planning-select-items">
        {items
          .filter((item) => onRemove || !removed.includes(item.index))
          .map((item) => (
            <span className="planning-select-chip" key={item.index}>
              <span className="planning-select-label">{item.display}</span>
              <button
                className="planning-select-remove"
                type="button"
                aria-label={`${item.display} 삭제`}
                disabled={readOnly}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  if (readOnly) return;
                  if (onRemove) onRemove(item.index);
                  else setRemoved((old) => [...old, item.index]);
                }}
              >
                ×
              </button>
            </span>
          ))}
      </span>
      <span className="planning-select-arrow" aria-hidden="true">
        ▾
      </span>
    </span>
  );
}
