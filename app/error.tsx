"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="empty">
      <h1>화면을 불러오지 못했어요.</h1>
      <p>DB 연결과 초기화 상태를 확인한 뒤 다시 시도해 주세요.</p>
      <button className="button primary" onClick={reset}>
        다시 시도
      </button>
    </main>
  );
}
