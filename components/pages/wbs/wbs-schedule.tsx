"use client";
import { useRef, useState } from "react";
import { toPng } from "html-to-image";
import type { Artifact } from "@/lib/artifact-types";
import { taskMetrics } from "@/lib/integration";
import {
  WbsScheduleImage,
  type WbsScheduleItem,
} from "./wbs-schedule-image";
export function WbsSchedule({ artifacts }: { artifacts: Artifact[] }) {
  const tasks = artifacts.filter((a) => a.kind === "wbs"),
    ordered: WbsScheduleItem[] = [],
    seen = new Set<string>();
  const imageRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");
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
  ordered.sort(
    (a, b) =>
      a.task.fields.startDate.localeCompare(b.task.fields.startDate) ||
      a.task.fields.endDate.localeCompare(b.task.fields.endDate),
  );
  const dates = tasks
    .flatMap((a) => [a.fields.startDate, a.fields.endDate])
    .filter(Boolean)
    .sort();
  if (!dates.length) return null;
  const first = Date.parse(dates[0]),
    last = Date.parse(dates[dates.length - 1]),
    span = Math.max(86400000, last - first + 86400000);
  const downloadImage = async () => {
    if (!imageRef.current || downloading) return;
    setDownloading(true);
    setDownloadError("");
    try {
      await document.fonts.ready;
      const dataUrl = await toPng(imageRef.current, {
        backgroundColor: "#f5f6fa",
        cacheBust: true,
        pixelRatio: 2,
      });
      const link = document.createElement("a");
      const today = new Intl.DateTimeFormat("sv-SE").format(new Date());
      link.download = `WBS-일정-${today}.png`;
      link.href = dataUrl;
      link.click();
    } catch {
      setDownloadError("WBS 이미지를 만들지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setDownloading(false);
    }
  };
  return (
    <section className="panel matrix-section">
      <div className="matrix-wbs-schedule-heading">
        <h2>WBS 일정과 공수</h2>
        <button
          type="button"
          className="button matrix-wbs-image-button"
          disabled={downloading}
          onClick={() => void downloadImage()}
        >
          {downloading ? "이미지 생성 중..." : "이미지 다운로드"}
        </button>
      </div>
      {downloadError && (
        <p role="alert" className="matrix-error">
          {downloadError}
        </p>
      )}
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
      <WbsScheduleImage
        ref={imageRef}
        artifacts={artifacts}
        tasks={tasks}
        ordered={ordered}
        firstDate={dates[0]}
        lastDate={dates[dates.length - 1]}
        first={first}
        span={span}
      />
    </section>
  );
}
