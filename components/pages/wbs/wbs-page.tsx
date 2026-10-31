"use client";
import { useProjectPage } from "@/components/shared/project-page-context";
import WbsComponement from "./wbs-schedule-chart.jsx";
import "./wbs-page.css";
export function WbsPage() {
  const { data } = useProjectPage();
  return (
    <>
      <WbsComponement key={data.project.id} />
    </>
  );
}
