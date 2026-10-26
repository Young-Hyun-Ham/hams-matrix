import type { ArtifactKind } from "./artifact-types";
export type ProjectTab =
  | ArtifactKind
  | "overview"
  | "trace"
  | "history"
  | "export"
  | "acceptance";
export const projectSections: Record<string, ProjectTab> = {
  requirements: "requirement",
  screens: "screen",
  specifications: "program",
  deliverables: "export",
  history: "history",
};
export const projectTabLabels: Record<ProjectTab, string> = {
  overview: "개요",
  wbs: "WBS 일정",
  architecture: "아키텍처",
  requirement: "요구사항",
  screen: "화면 설계",
  database: "DB 설계 / ERD",
  program: "프로그램 정의",
  test: "검증 / 검수",
  trace: "요구사항 추적표",
  acceptance: "통합 검수",
  history: "변경 이력",
  export: "산출물",
};
