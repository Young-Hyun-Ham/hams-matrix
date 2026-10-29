"use client";

import { useRef, useState } from "react";
import { Plus, Search, X } from "lucide-react";

type Props = {
  terms: string[];
  onChange: (terms: string[]) => void;
};

const MAX_TERM_COUNT = 1000;

const comparable = (value: string) =>
  value.normalize("NFKC").toLocaleLowerCase("ko");

export function BlockedTermsEditor({ terms, onChange }: Props) {
  const [input, setInput] = useState("");
  const [filter, setFilter] = useState("");
  const [message, setMessage] = useState("");
  const visibleTerms = terms
    .map((term, index) => ({ term, index }))
    .filter(({ term }) => comparable(term).includes(comparable(filter.trim())));

  const inputRef = useRef<HTMLInputElement>(null);
  const handleFocus = () => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  function addTerm() {
    const term = input.trim();
    if (!term) return;
    if (terms.length >= MAX_TERM_COUNT) {
      setMessage(
        `차단 문구는 최대 ${MAX_TERM_COUNT}개까지 등록할 수 있습니다.`,
      );
      return;
    }
    if (terms.some((item) => comparable(item) === comparable(term))) {
      setMessage("이미 등록된 차단 문구입니다.");
      return;
    }
    onChange([...terms, term]);
    setInput("");
    setMessage("");
    handleFocus();
  }

  return (
    <div className="guardrail-blocked-terms">
      <div className="guardrail-blocked-heading">
        <label htmlFor="guardrail-blocked-input">사용자 지정 차단 문구</label>
        <small>
          문구를 입력하고 Enter 또는 입력 버튼을 누르세요. 쉼표도 문구의 일부로
          저장됩니다.
        </small>
      </div>
      <div className="guardrail-blocked-entry">
        <input
          id="guardrail-blocked-input"
          ref={inputRef}
          type="text"
          maxLength={100}
          value={input}
          onChange={(event) => {
            setInput(event.target.value);
            setMessage("");
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addTerm();
            }
          }}
          placeholder="차단할 문구 입력"
          autoComplete="off"
        />
        <button
          type="button"
          className="button"
          onClick={addTerm}
          disabled={!input.trim() || terms.length >= 1000}
        >
          <Plus size={14} aria-hidden="true" /> 입력
        </button>
      </div>
      <label
        className="guardrail-blocked-search"
        htmlFor="guardrail-blocked-filter"
      >
        <Search size={15} aria-hidden="true" />
        <input
          id="guardrail-blocked-filter"
          type="search"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="등록된 차단 문구 검색"
        />
      </label>
      <div className="guardrail-blocked-list" aria-label="등록된 차단 문구">
        {visibleTerms.length ? (
          visibleTerms.map(({ term, index }) => (
            <span className="guardrail-blocked-chip" key={`${term}-${index}`}>
              <span>{term}</span>
              <button
                type="button"
                aria-label={`${term} 삭제`}
                title={`${term} 삭제`}
                onClick={() => {
                  onChange(terms.filter((_, itemIndex) => itemIndex !== index));
                  setMessage("");
                }}
              >
                <X size={13} aria-hidden="true" />
              </button>
            </span>
          ))
        ) : (
          <span className="guardrail-blocked-empty">
            {terms.length
              ? "검색 결과가 없습니다."
              : "등록된 차단 문구가 없습니다."}
          </span>
        )}
      </div>
      <div className="guardrail-blocked-meta">
        <span>
          {filter ? `${visibleTerms.length}개 검색됨 · ` : ""}
          {terms.length}/{MAX_TERM_COUNT}개 등록
        </span>
        {message && <span role="status">{message}</span>}
      </div>
    </div>
  );
}
