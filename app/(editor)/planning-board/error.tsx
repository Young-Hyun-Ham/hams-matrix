"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div role="alert">
      <p>플래닝보드를 불러오지 못했습니다.</p>
      <button onClick={reset}>다시 시도</button>
    </div>
  );
}
