"use client";
import { useState } from "react";
import type { SharedCandidate } from "@/lib/ai/shared-answer-types";
import { SharedAnswerPreview } from "./shared-answer-dialog";
export function SharedAnswerCandidates({
  projectId,
  candidates,
  generateFresh,
  disabled,
}: {
  projectId: string;
  candidates: SharedCandidate[];
  generateFresh: () => void;
  disabled: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <section className="matrix-shared-candidates" aria-label="공유 답변 후보">
      <strong>등록된 공유 답변이 있습니다</strong>
      <p>적용 조건을 확인하고 원문을 열어보거나 새 답변을 생성하세요.</p>
      {candidates.map((c) => (
        <article key={c.id}>
          <p>{c.question}</p>
          <p>적용 조건: {c.contract.conditions}</p>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setSelected(c.id)}
          >
            공유 답변 열어보기
          </button>
        </article>
      ))}
      <button type="button" disabled={disabled} onClick={generateFresh}>
        새 답변 생성
      </button>
      {selected && (
        <SharedAnswerPreview
          projectId={projectId}
          id={selected}
          close={() => setSelected(null)}
        />
      )}
    </section>
  );
}
