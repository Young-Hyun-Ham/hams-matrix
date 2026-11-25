// Shared presentation/validation data. No browser or server dependencies.
type Field = Record<string, unknown>;
function slotValue(slots: Field, raw: unknown) {
  const path = String(raw ?? "").replace(/^\{\{\s*|\s*\}\}$/g, "");
  let value: unknown = slots;
  for (const key of path.split(".").filter(Boolean)) {
    if (
      ["__proto__", "constructor", "prototype"].includes(key) ||
      !value ||
      typeof value !== "object" ||
      !Object.hasOwn(value, key)
    )
      return undefined;
    value = (value as Field)[key];
  }
  return value;
}
export function formOptions(field: Field, slots: Field) {
  const source = field.optionsSlot
    ? slotValue(slots, field.optionsSlot)
    : field.options;
  return (Array.isArray(source) ? source : []).slice(0, 1000).map((value) => {
    const v = value && typeof value === "object" ? (value as Field) : null;
    return {
      value: String(v ? (v.value ?? v.label ?? "") : value),
      label: String(v ? (v.label ?? v.value ?? "") : value),
    };
  });
}
export function formGrid(field: Field, slots: Field) {
  const source = field.optionsSlot
    ? slotValue(slots, field.optionsSlot)
    : (field.rows ?? field.data);
  const data = Array.isArray(source) ? source.slice(0, 5000) : [];
  const display = Array.isArray(field.displayKeys) ? field.displayKeys : [];
  const rawColumns = Array.isArray(field.columns) ? field.columns : display;
  let rows: Field[], columns: { key: string; label: string }[];
  if (data.every((v) => v && typeof v === "object" && !Array.isArray(v))) {
    rows = data as Field[];
    columns = (rawColumns.length ? rawColumns : Object.keys(rows[0] ?? {})).map(
      (v) =>
        typeof v === "object" && v
          ? {
              key: String(v.key ?? v.field ?? v.name ?? ""),
              label: String(v.label ?? v.key ?? v.field ?? v.name ?? ""),
            }
          : { key: String(v), label: String(v) },
    );
  } else {
    const count = Math.min(
        100,
        Math.max(1, Number(field.columns) || rawColumns.length || 1),
      ),
      flat = data.flat();
    const headers = field.hasHeader ? flat.slice(0, count) : [];
    const body = field.hasHeader ? flat.slice(count) : flat;
    columns = Array.from({ length: count }, (_, i) => {
      const d = display[i];
      const key =
        typeof d === "object" && d
          ? String(d.key ?? i)
          : String(d ?? headers[i] ?? i);
      return {
        key,
        label:
          typeof d === "object" && d
            ? String(d.label ?? headers[i] ?? key)
            : String(headers[i] ?? key),
      };
    });
    rows = Array.from({ length: Math.ceil(body.length / count) }, (_, r) =>
      Object.fromEntries(
        columns.map((c, i) => [c.key, body[r * count + i] ?? ""]),
      ),
    );
  }
  columns = columns
    .filter((c) => !["__proto__", "constructor", "prototype"].includes(c.key))
    .filter(
      (c) =>
        !field.hideNullColumns ||
        rows.some((r) => r[c.key] != null && r[c.key] !== ""),
    );
  return { rows, columns };
}
