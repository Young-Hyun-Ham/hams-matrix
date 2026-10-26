"use client";
import { ArtifactList } from "@/components/shared/artifact-list";
import { useProjectPage } from "@/components/shared/project-page-context";
import { ArchitectureDiagram } from "./architecture-diagram";
import "./architecture-page.css";
export function ArchitecturePage() {
  const { artifacts, data } = useProjectPage();
  return (
    <>
      <ArchitectureDiagram key={data.project.id} artifacts={artifacts} />
      <ArtifactList kind="architecture" />
    </>
  );
}
