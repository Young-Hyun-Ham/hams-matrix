"use client";
import { ArtifactList } from "@/components/shared/artifact-list";
import { useProjectPage } from "@/components/shared/project-page-context";
import { WbsSchedule } from "./wbs-schedule";
import "./wbs-page.css";
export function WbsPage() {
  const { artifacts } = useProjectPage();
  return (
    <>
      <WbsSchedule artifacts={artifacts} />
      <ArtifactList kind="wbs" />
    </>
  );
}
