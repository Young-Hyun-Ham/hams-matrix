"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import styles from "./sample-page.module.css";
import AgentChatbotPage from "./componets/tabs/agent-chatbot";
import HitlChatPage from "./componets/tabs/agent-chat";
import SkeletonChatPage from "./componets/tabs/skeleton-chatbot";
import SkeletonPage from "./componets/tabs/skeleton";

const samples: any = [
  {
    id: "agent-chatbot",
    label: "Agent chatbot",
    body: <AgentChatbotPage />,
    description: `요청을 입력하면 에이전트의 처리 과정과 최종 답변을 확인할 수 있습니다. 
도구 실행를 선택 하여 해당 도구를 사용하도록 한다.`,
    exampleText: ``,
  },
  {
    id: "agent-chat",
    label: "Agent chat",
    body: <HitlChatPage />,
    description: `요청을 입력하면 에이전트의 처리 과정과 최종 답변을 확인할 수 있습니다.
도구 실행에 사용자 승인이 필요한 경우 승인·거절 버튼을 표시하며,
선택에 따라 작업을 이어가거나 취소합니다.`,
    exampleText: `사용자 ID 'user_123' 데이터를 삭제해줘`,
  },
  {
    id: "skeleton-chatbot",
    label: "Skeleton chatbot",
    body: <SkeletonChatPage />,
    description: `메시지를 보내면 답변을 기다리는 동안 ‘생각 중’ 애니메이션을 표시합니다.
답변이 도착하면 텍스트를 순차적으로 출력하고, 생성 중인 위치에 커서를 표시합니다.`,
    exampleText: `스켈레톤 UI와 로딩 UX의 개념, 장단점, 그리고 실제 서비스(토스, 유튜브 등)에서 어떻게 활용되고 있는지 5가지 문단으로 아주 길게 설명해줘.`,
  },
  {
    id: "skeleton",
    label: "Skeleton",
    body: <SkeletonPage />,
    description:
      "사용자 프로필을 불러오는 동안 아바타와 텍스트 형태의 스켈레톤을 표시합니다. 로딩이 끝나면 프로필 카드로 전환되는 과정을 확인할 수 있습니다.",
  },
];

export default function SamplePage() {
  const [activeIndex, setActiveIndex] = useState(0);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function handleTabKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) {
    let nextIndex: number;

    switch (event.key) {
      case "ArrowRight":
        nextIndex = (index + 1) % samples.length;
        break;
      case "ArrowLeft":
        nextIndex = (index - 1 + samples.length) % samples.length;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = samples.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    setActiveIndex(nextIndex);
    tabRefs.current[nextIndex]?.focus();
  }

  return (
    <main className={styles.page}>
      {/* <h1 className={styles.heading}>예시 화면</h1> */}
      <div className={styles.tabs} role="tablist" aria-label="예시 화면 선택">
        {samples.map((sample: any, index: number) => (
          <button
            key={sample.id}
            ref={(element) => {
              tabRefs.current[index] = element;
            }}
            className={styles.tab}
            type="button"
            role="tab"
            id={`sample-tab-${sample.id}`}
            aria-controls={`sample-panel-${sample.id}`}
            aria-selected={activeIndex === index}
            tabIndex={activeIndex === index ? 0 : -1}
            onClick={() => setActiveIndex(index)}
            onKeyDown={(event) => handleTabKeyDown(event, index)}
          >
            {sample.label}
          </button>
        ))}
      </div>
      <div className={styles.content}>
        {samples.map((sample: any, index: number) => (
          <section
            key={sample.id}
            className={styles.panel}
            role="tabpanel"
            id={`sample-panel-${sample.id}`}
            aria-labelledby={`sample-tab-${sample.id}`}
            hidden={activeIndex !== index}
          >
            <header className={styles.description}>
              <h2 className={styles.descriptionTitle}>{sample.label}</h2>
              <p className={styles.descriptionText}>{sample.description}</p>
              {sample.exampleText && (
                <p className={styles.descriptionText}>
                  ex) {sample.exampleText}
                </p>
              )}
            </header>
            {activeIndex === index && <>{sample.body}</>}
          </section>
        ))}
      </div>
    </main>
  );
}
