import type { MenuKey } from "./types";
export const menus: {
  key: MenuKey;
  label: string;
  en: string;
  icon: string;
  description: string;
}[] = [
  {
    key: "dashboard",
    label: "대시보드",
    en: "Overview",
    icon: "grid",
    description: "프로젝트의 흐름을 한눈에 살펴보세요.",
  },
  // {
  //   key: "requirements",
  //   label: "요구사항",
  //   en: "Requirements",
  //   icon: "list",
  //   description: "고객의 아이디어를 명확한 요구사항으로 연결하세요.",
  // },
  // {
  //   key: "screens",
  //   label: "화면 구성",
  //   en: "Screen design",
  //   icon: "screen",
  //   description: "사용자의 여정을 설계하고 화면의 맥락을 공유하세요.",
  // },
  // {
  //   key: "specifications",
  //   label: "프로그램 설계",
  //   en: "Specifications",
  //   icon: "code",
  //   description: "화면과 요구사항을 실제 동작으로 구체화하세요.",
  // },
  // {
  //   key: "history",
  //   label: "변경 이력",
  //   en: "Change history",
  //   icon: "history",
  //   description: "프로젝트가 발전해 온 모든 순간을 확인하세요.",
  // },
  // {
  //   key: "deliverables",
  //   label: "프로젝트 산출물",
  //   en: "Deliverables",
  //   icon: "folder",
  //   description: "팀의 결과물을 한곳에서 체계적으로 관리하세요.",
  // },
  {
    key: "team",
    label: "팀 공유",
    en: "Team space",
    icon: "team",
    description: "서로의 생각을 나누고 함께 더 나은 결정을 만드세요.",
  },
  {
    key: "ai",
    label: "AI Chatbot",
    en: "AI Chatbot",
    icon: "ai",
    description: "AI chatbot",
  },
];
