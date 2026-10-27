import type { AiImageInfo } from "./ai-image-types";
import { projectTabLabels, type ProjectTab } from "./project-tabs";

export type AiContext = {
  pathname: string;
  screen: string;
  tab: ProjectTab | null;
  projectId: string;
  projectName: string;
};
export type AiChat = {
  id: string;
  convId: string;
  prompt: string;
  model: string;
  screenTitle: string;
  createdAt: string;
  result: string;
  images?: AiImageInfo[];
};
export type AiConversation = {
  convId: string;
  projectId: string;
  title: string;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
};
export const emptyAiContext: AiContext = {
  pathname: "",
  screen: "대시보드",
  tab: null,
  projectId: "",
  projectName: "",
};
const examples: Partial<Record<ProjectTab, string>> = {
  wbs: "6개월 프로젝트의 분석·설계·개발 일정과 마일스톤을 만들어줘",
  architecture: "Spring과 React 기반 시스템의 아키텍처를 정의해줘",
  requirement: "회원 가입 기능의 요구사항과 검수 기준을 작성해줘",
  screen: "관리자 회원 관리 화면의 구성과 동작을 설계해줘",
  database: "회원 관리에 필요한 테이블과 PK·FK 관계를 설계해줘",
  program: "회원 조회 API의 프로그램 명세를 작성해줘",
  test: "회원 가입 요구사항의 테스트와 검수 시나리오를 만들어줘",
  trace: "요구사항과 화면·DB·프로그램의 연결 누락을 검토해줘",
  acceptance: "검수 준비 상태와 보완할 항목을 정리해줘",
  history: "문서 변경에 따른 영향 범위를 검토해줘",
  export: "산출물별 작성 항목과 연결 관계를 정리해줘",
};
export function aiPresentation(context: AiContext) {
  const label = context.tab ? projectTabLabels[context.tab] : context.screen;
  const title =
    context.tab === "screen"
      ? "AI로 화면 생성"
      : context.tab === "wbs"
        ? "AI로 WBS 생성"
        : context.tab === "architecture"
          ? "AI로 아키텍처 생성"
          : context.tab === "requirement"
            ? "AI로 요구사항 생성"
            : context.tab === "database"
              ? "AI로 DB설계서 생성"
              : context.tab === "program"
                ? "AI로 프로그램 정의서 생성"
                : context.tab === "test"
                  ? "AI로 검수/검증 생성"
                  : context.tab === "trace"
                    ? "AI로 요구사항 추적표 생성"
                    : "AI로 설계하기";
  return {
    title,
    label,
    placeholder: `예: ${(context.tab && examples[context.tab]) || (context.screen === "팀 공유" ? "팀의 산출물 검토 역할과 협업 절차를 정리해줘" : "프로젝트의 목표와 단계별 산출물을 정리해줘")}`,
  };
}
