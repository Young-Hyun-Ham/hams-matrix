import { scheduleDate, scheduleDay } from "@/lib/wbs-schedule";
import type { ScheduleRow } from "./use-wbs-schedule";
export function WbsOverview({ tasks, start, days, expanded = false }: { tasks: ScheduleRow[]; start: string; days: number; expanded?: boolean }) {
  const labelWidth = expanded ? 230 : 0;
  const chartWidth = expanded ? Math.max(1000, days * 18) : 1000;
  const headerHeight = expanded ? 54 : 32, rowHeight = 30;
  const height = headerHeight + Math.max(tasks.length, 1) * rowHeight;
  const first = scheduleDay(start), pixel = chartWidth / days;
  const dates = Array.from({ length: days }, (_, index) => ({ date: scheduleDate(first + index), index }));
  const step = Math.max(1, Math.ceil((expanded ? 72 : 110) / pixel));
  const ticks = dates.filter(({ index }) => index === 0 || index === days - 1 || index % step === 0 && index * pixel < chartWidth - 80);
  const months = dates.filter(({ date, index }) => index === 0 || date.endsWith("-01"));
  return <svg viewBox={`0 0 ${chartWidth + labelWidth} ${height}`} width={expanded ? chartWidth + labelWidth : undefined} height={expanded ? height : undefined}
    preserveAspectRatio={expanded ? "xMinYMin meet" : "none"} role="img" aria-label={`전체 일정 ${start} ~ ${scheduleDate(first + days - 1)}, 작업 ${tasks.length}개`}
    style={expanded ? { minWidth: chartWidth + labelWidth, width: chartWidth + labelWidth, height } : undefined}>
    <rect width={chartWidth + labelWidth} height={height} fill="var(--surface)" />
    <g data-layer="background">{dates.map(({ date, index }) => <rect key={date} x={labelWidth + index * pixel} y={0} width={pixel} height={height}
      fill={[0, 6].includes(new Date((first + index) * 86400000).getUTCDay()) ? "var(--primary-soft)" : "var(--surface)"} />)}</g>
    <g data-layer="grid">{ticks.map(({ date, index }) => <path key={date} d={`M ${labelWidth + index * pixel} 0 V ${height}`} stroke="var(--line)" strokeWidth={0.5} />)}
      {tasks.map((task, index) => <path key={task.id} d={`M 0 ${headerHeight + (index + 1) * rowHeight} H ${chartWidth + labelWidth}`} stroke="var(--line)" />)}</g>
    <g data-layer="bars">{tasks.map((task, index) => {
      const x = labelWidth + (scheduleDay(task.startDate) - first) * pixel;
      const width = (scheduleDay(task.endDate) - scheduleDay(task.startDate) + 1) * pixel;
      const y = headerHeight + index * rowHeight;
      const color = task.progress === 100 ? "#37ad81" : "var(--primary)";
      return <g key={task.id}><title>{`${task.wbs} ${task.title}: ${task.startDate} ~ ${task.endDate} (${task.progress}%)`}</title>
        <rect x={x} y={y + 6} width={width} height={18} rx={3} fill={color} opacity={0.35} />
        <rect x={x} y={y + 6} width={width * task.progress / 100} height={18} rx={3} fill={color} />
      </g>;
    })}</g>
    <g data-layer="labels">
      {expanded && months.map(({ date, index }, position) => {
        const width = ((months[position + 1]?.index ?? days) - index) * pixel;
        return width < 76 ? null : <text key={date} x={labelWidth + index * pixel + 4} y={17} fill="var(--ink)" fontSize={12}>{date.slice(0, 7)}</text>;
      })}
      {ticks.map(({ date, index }) => <text key={date} x={index === days - 1 ? labelWidth + chartWidth - 4 : labelWidth + index * pixel + 4}
        y={expanded ? 40 : 20} textAnchor={index === days - 1 ? "end" : "start"} fill="var(--muted)" fontSize={11}>{date.slice(5).replace("-", "/")}</text>)}
      {expanded && tasks.map((task, index) => <g key={task.id}>
        <text x={8} y={headerHeight + index * rowHeight + 20} fill="var(--ink)" fontSize={12}><title>{`${task.wbs} ${task.title}`}</title>{`${task.wbs} ${task.title}`.slice(0, 24)}</text>
        <text x={labelWidth + (scheduleDay(task.startDate) - first) * pixel + 5} y={headerHeight + index * rowHeight + 19} fill="var(--ink)" fontSize={11}>{task.progress}%</text>
      </g>)}
      {!tasks.length && <text x={20} y={headerHeight + 24} fill="var(--muted)" fontSize={12}>표시할 작업이 없습니다.</text>}
    </g>
  </svg>;
}
