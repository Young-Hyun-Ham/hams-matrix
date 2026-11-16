import { scheduleDay } from "./wbs-schedule";

// Inclusive Monday–Friday calendar, eight hours per working day.
export function plannedWorkingHours(start: string, end: string): string {
  try {
    const first = scheduleDay(start);
    const last = scheduleDay(end);
    if (last < first) return "";
    const days = last - first + 1;
    let weekdays = Math.floor(days / 7) * 5;
    for (let offset = 0; offset < days % 7; offset++) {
      const weekday = new Date((first + offset) * 86400000).getUTCDay();
      if (weekday !== 0 && weekday !== 6) weekdays++;
    }
    return String(weekdays * 8);
  } catch {
    return "";
  }
}

export function withPlannedEffort(fields: Record<string, string>) {
  return {
    ...fields,
    plannedEffort:
      fields.taskType === "마일스톤"
        ? "0"
        : plannedWorkingHours(fields.startDate, fields.endDate),
  };
}
