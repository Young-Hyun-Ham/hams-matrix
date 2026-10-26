"use client";
import type { Artifact } from "@/lib/artifact-types";
import { taskMetrics } from "@/lib/integration";
export function WbsSchedule({ artifacts }: { artifacts: Artifact[] }) {
  const tasks = artifacts.filter((a) => a.kind === "wbs"),
    ordered: { task: Artifact; depth: number }[] = [],
    seen = new Set<string>();
  const walk = (parent: string, depth: number) => {
    for (const task of tasks.filter(
      (a) => (a.structure?.parentId ?? "") === parent,
    )) {
      if (seen.has(task.id)) continue;
      seen.add(task.id);
      ordered.push({ task, depth });
      walk(task.id, depth + 1);
    }
  };
  walk("", 0);
  const dates = tasks
    .flatMap((a) => [a.fields.startDate, a.fields.endDate])
    .filter(Boolean)
    .sort();
  if (!dates.length) return null;
  const first = Date.parse(dates[0]),
    last = Date.parse(dates[dates.length - 1]),
    span = Math.max(86400000, last - first + 86400000);
  return (
    <section className="panel matrix-section">
      <h2>WBS 일정과 공수</h2>
      <p>
        {dates[0]} ~ {dates[dates.length - 1]} · 선행 작업 종료 후 시작 · 요약
        작업은 하위 작업의 공수로 가중 집계합니다. 계획 공수가 0인 작업은 가중치
        1로 계산합니다.
      </p>
      <div className="table-scroll">
        <table className="matrix-gantt">
          <thead>
            <tr>
              <th>작업 / 계층</th>
              <th>단계</th>
              <th>계획 기간</th>
              <th>일정</th>
              <th>선행 작업</th>
              <th>계획 / 실제 (시간)</th>
              <th>진척률</th>
            </tr>
          </thead>
          <tbody>
            {ordered.map(({ task: t, depth }) => {
              const m = taskMetrics(artifacts, t),
                left = ((Date.parse(t.fields.startDate) - first) / span) * 100,
                width =
                  ((Date.parse(t.fields.endDate) -
                    Date.parse(t.fields.startDate) +
                    86400000) /
                    span) *
                  100;
              return (
                <tr key={t.id}>
                  <td>
                    <span style={{ paddingInlineStart: depth * 16 }}>
                      {t.fields.taskType === "요약"
                        ? "▾ "
                        : t.fields.taskType === "마일스톤"
                          ? "◆ "
                          : ""}
                      {t.code} · {t.title}
                    </span>
                  </td>
                  <td>{t.fields.phase}</td>
                  <td>
                    {t.fields.startDate} ~ {t.fields.endDate}
                  </td>
                  <td>
                    <div
                      className="matrix-gantt-track"
                      aria-label={`${t.title} 진척률 ${m.progress}%`}
                    >
                      <div
                        className="matrix-gantt-bar"
                        style={{ left: `${left}%`, width: `${width}%` }}
                      >
                        <i style={{ width: `${m.progress}%` }} />
                      </div>
                    </div>
                  </td>
                  <td>
                    {t.structure?.dependencies
                      ?.map((id) => tasks.find((a) => a.id === id)?.code)
                      .join(", ") || "—"}
                  </td>
                  <td>
                    {m.plannedEffort} / {m.actualEffort}
                  </td>
                  <td>{m.progress}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
