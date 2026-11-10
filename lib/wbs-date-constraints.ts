import type { Artifact } from "./artifact-types";
import { scheduleDay, scheduleDate } from "./wbs-schedule";

export type DateRange = { min?: string; max?: string };
const latest = (dates: (string | undefined)[]) =>
  dates.filter(Boolean).sort().at(-1);
export const inRange = (date: string, range: DateRange) =>
  !!date &&
  (!range.min || date >= range.min) &&
  (!range.max || date <= range.max);
export const emptyRange = (range: DateRange) =>
  !!(range.min && range.max && range.min > range.max);

export function wbsDateConstraints(task: Artifact, artifacts: Artifact[]) {
  const tasks = new Map(
    artifacts.filter((a) => a.kind === "wbs").map((a) => [a.id, a]),
  );
  tasks.set(task.id, task);
  const parentId = task.structure?.parentId || "";
  const dependencies = task.structure?.dependencies || [];
  const parent = tasks.get(parentId);
  const predecessors = dependencies.map((id) => tasks.get(id));
  let relationError = "";
  if (parentId && (!parent || parent.fields.taskType !== "요약"))
    relationError = "같은 프로젝트의 상위 요약 작업을 선택해 주세요.";
  if (predecessors.some((a) => !a || a.fields.taskType === "요약"))
    relationError = "유효한 선행 작업 또는 마일스톤을 선택해 주세요.";
  for (const kind of ["parent", "dependencies"] as const) {
    const visiting = new Set<string>(),
      visited = new Set<string>();
    const visit = (id: string): boolean => {
      if (visiting.has(id)) return true;
      if (visited.has(id)) return false;
      visiting.add(id);
      const a = tasks.get(id);
      const next =
        kind === "parent"
          ? a?.structure?.parentId
            ? [a.structure.parentId]
            : []
          : a?.structure?.dependencies || [];
      if (next.some(visit)) return true;
      visiting.delete(id);
      visited.add(id);
      return false;
    };
    if (visit(task.id)) relationError = "WBS 상위/선행 관계에 순환이 있습니다.";
  }
  const plan: DateRange = {
    min: latest([
      parent?.fields.startDate,
      ...predecessors.map((a) => a?.fields.endDate),
    ]),
    max: parent?.fields.endDate || undefined,
  };
  const actualKnown =
    !relationError &&
    (!parentId || !!(parent?.fields.actualStart && parent.fields.actualEnd)) &&
    predecessors.every((a) => !!a?.fields.actualEnd);
  const actual: DateRange = actualKnown
    ? {
        min: latest([
          parent?.fields.actualStart,
          ...predecessors.map((a) => a?.fields.actualEnd),
        ]),
        max: parent?.fields.actualEnd || undefined,
      }
    : {};
  return {
    plan,
    actual,
    actualKnown,
    relationError,
    hasRelations: !!parentId || dependencies.length > 0,
  };
}

export function dateFieldRanges(
  fields: Record<string, string>,
  plan: DateRange,
  actual: DateRange,
) {
  const pair = (range: DateRange, start: string, end: string) => [
    {
      ...range,
      max: inRange(end, range)
        ? range.max && range.max < end
          ? range.max
          : end
        : range.max,
    },
    {
      ...range,
      min: inRange(start, range)
        ? range.min && range.min > start
          ? range.min
          : start
        : range.min,
    },
  ];
  const [startDate, endDate] = pair(plan, fields.startDate, fields.endDate);
  const [actualStart, actualEnd] = pair(
    actual,
    fields.actualStart,
    fields.actualEnd,
  );
  return { startDate, endDate, actualStart, actualEnd };
}

export function adjustPlannedDates(
  fields: Record<string, string>,
  range: DateRange,
  earliest = false,
) {
  if (emptyRange(range) || !fields.startDate || !fields.endDate) return fields;
  const duration = scheduleDay(fields.endDate) - scheduleDay(fields.startDate);
  if (duration < 0 || !Number.isFinite(duration)) return fields;
  let start = fields.startDate;
  if (range.min && (earliest || start < range.min)) start = range.min;
  let end = scheduleDate(scheduleDay(start) + duration);
  if (range.max && end > range.max) {
    end = range.max;
    start = scheduleDate(scheduleDay(end) - duration);
  }
  if (!inRange(start, range) || !inRange(end, range)) return fields;
  return { ...fields, startDate: start, endDate: end };
}

export function validateWbsDates(task: Artifact, artifacts: Artifact[]) {
  const c = wbsDateConstraints(task, artifacts),
    f = task.fields;
  if (c.relationError) return c.relationError;
  if (emptyRange(c.plan))
    return "상위 기간과 선행 종료일이 충돌하여 선택 가능한 계획 기간이 없습니다.";
  if (!f.startDate || !f.endDate)
    return "계획 시작일과 종료일을 입력해 주세요.";
  try {
    for (const date of [f.startDate, f.endDate, f.actualStart, f.actualEnd])
      if (date) scheduleDay(date);
  } catch {
    return "올바른 날짜를 선택해 주세요.";
  }
  if (f.startDate > f.endDate) return "계획 종료일은 시작일 이후여야 합니다.";
  if (!inRange(f.startDate, c.plan) || !inRange(f.endDate, c.plan))
    return "계획 기간을 상위 기간 및 선행 종료일에 맞게 조정해 주세요. 기존 작업 기간은 자동 단축하지 않습니다.";
  if (f.actualEnd && !f.actualStart)
    return "실제 종료일을 입력하려면 실제 시작일이 필요합니다.";
  if (f.actualStart && f.actualEnd && f.actualStart > f.actualEnd)
    return "실제 종료일은 실제 시작일 이후여야 합니다.";
  if (
    (f.actualStart || f.actualEnd) &&
    (emptyRange(c.actual) ||
      (f.actualStart && !inRange(f.actualStart, c.actual)) ||
      (f.actualEnd && !inRange(f.actualEnd, c.actual)))
  )
    return "실제 기간을 확인된 상위 실제 기간 및 선행 실제 종료일에 맞게 입력해 주세요.";
  return "";
}
