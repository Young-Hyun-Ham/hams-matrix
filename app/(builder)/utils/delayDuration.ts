export const DELAY_UNITS = { S: 1000, M: 60000, H: 3600000 } as const;
export type DelayUnit = keyof typeof DELAY_UNITS;

export function getDelayUnit(unit: unknown): DelayUnit {
  return unit === "M" || unit === "H" ? unit : "S";
}

export function parseDelayDuration(value: string, unit: DelayUnit) {
  const amount = Number(value);
  const duration = Math.round(amount * DELAY_UNITS[unit]);
  if (!value.trim() || !Number.isFinite(amount) || amount <= 0) {
    return { error: "positive" as const, duration: null };
  }
  if (amount > 9999) return { error: "digits" as const, duration: null };
  if (duration < 1) return { error: "minimum" as const, duration: null };
  // Browser timers overflow above this limit and would execute immediately.
  if (duration > 2147483647)
    return { error: "maximum" as const, duration: null };
  return { error: null, duration };
}

export function formatDelayDuration(duration: number, unit: DelayUnit) {
  if (!Number.isFinite(duration) || duration <= 0)
    return `0${unit.toLowerCase()}`;
  return `${Number((duration / DELAY_UNITS[unit]).toPrecision(10))}${unit.toLowerCase()}`;
}
