"use client";
import { ArtifactList } from "@/components/shared/artifact-list";
import { useProjectPage } from "@/components/shared/project-page-context";
import type { Artifact } from "@/lib/artifact-types";
export function SpecificationsPage() {
  const { openCreate } = useProjectPage();
  function createDevelopmentTask(program: Artifact) {
    const today = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Seoul",
    }).format(new Date());
    openCreate("wbs", {
      ...program,
      id: "",
      kind: "wbs",
      status: "초안",
      title: `개발 · ${program.title}`.slice(0, 200),
      fields: {
        phase: "개발",
        taskType: "작업",
        startDate: today,
        endDate: today,
        plannedEffort: "0",
        actualEffort: "0",
        progress: "0",
        definition: `${program.code} ${program.title} 구현`,
        owner: program.fields.owner ?? "",
      },
      structure: {},
      links: [program.id],
    });
  }
  return (
    <ArtifactList
      kind="program"
      renderActions={(program) => (
        <button
          className="button"
          onClick={() => createDevelopmentTask(program)}
        >
          개발 WBS 등록
        </button>
      )}
    />
  );
}
