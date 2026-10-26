"use client";
import { ArtifactList } from "@/components/shared/artifact-list";
import { useProjectPage } from "@/components/shared/project-page-context";
import { DatabaseDiagram } from "./database-diagram";
export function DatabasePage() {
  const { artifacts } = useProjectPage();
  return (
    <>
      <DatabaseDiagram artifacts={artifacts} />
      <ArtifactList kind="database" />
    </>
  );
}
