"use client";
import { useProjectPage } from "@/components/shared/project-page-context";
import WbsComponement from "./wbs-schedule-chart.jsx";
import "@/styles/pages/projects/tabs/wbs/wbs-page.css";
export function WbsPage() {
  const { data, artifacts, openEdit, openDetail } = useProjectPage();
  const pending = artifacts.filter(
    (a) => a.kind === "wbs" && (!a.fields.startDate || !a.fields.endDate),
  );
  return (
    <>
      {pending.length > 0 && (
        <section className="panel matrix-section">
          <h2>일정 미정 WBS</h2>
          {pending.map((a) => (
            <p key={a.id}>
              <button
                className="text-button"
                onClick={() => (openDetail ?? openEdit)(a)}
              >
                {a.code} · {a.title}
              </button>{" "}
              <button className="button" onClick={() => openEdit(a)}>
                수정
              </button>
            </p>
          ))}
        </section>
      )}
      <WbsComponement key={data.project.id} />
    </>
  );
}
