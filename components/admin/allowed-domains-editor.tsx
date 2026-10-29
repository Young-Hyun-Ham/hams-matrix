"use client";

import { useRef, useState } from "react";
import { Plus, Search, X } from "lucide-react";

type Props = {
  domains: string[];
  onChange: (domains: string[]) => void;
};

const validDomain = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

export function AllowedDomainsEditor({ domains, onChange }: Props) {
  const [input, setInput] = useState("");
  const [filter, setFilter] = useState("");
  const [message, setMessage] = useState("");
  const visibleDomains = domains
    .map((domain, index) => ({ domain, index }))
    .filter(({ domain }) =>
      domain.toLowerCase().includes(filter.trim().toLowerCase()),
    );

  const inputRef = useRef<HTMLInputElement>(null);
  const handleFocus = () => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  function addDomain() {
    const domain = input.trim().toLowerCase();
    if (!domain) return;
    if (!validDomain.test(domain)) {
      setMessage(
        "example.com처럼 도메인만 입력하세요. 경로·와일드카드는 사용할 수 없습니다.",
      );
      return;
    }
    if (domains.length >= 50) {
      setMessage("허용 도메인은 최대 50개까지 등록할 수 있습니다.");
      return;
    }
    if (domains.some((item) => item.toLowerCase() === domain)) {
      setMessage("이미 등록된 도메인입니다.");
      return;
    }
    onChange([...domains, domain]);
    setInput("");
    setMessage("");
    handleFocus();
  }

  return (
    <div className="guardrail-blocked-terms guardrail-domain-editor">
      <div className="guardrail-blocked-heading">
        <label htmlFor="guardrail-domain-input">허용 외부 도메인</label>
        <small>예: example.com. 하위 도메인은 별도로 지정합니다.</small>
      </div>
      <div className="guardrail-blocked-entry">
        <input
          id="guardrail-domain-input"
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
              addDomain();
            }
          }}
          placeholder="example.com"
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="button"
          className="button"
          onClick={addDomain}
          disabled={!input.trim() || domains.length >= 50}
        >
          <Plus size={14} aria-hidden="true" /> 입력
        </button>
      </div>
      <label
        className="guardrail-blocked-search"
        htmlFor="guardrail-domain-filter"
      >
        <Search size={15} aria-hidden="true" />
        <input
          id="guardrail-domain-filter"
          type="search"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="등록된 허용 도메인 검색"
        />
      </label>
      <div
        className="guardrail-blocked-list"
        aria-label="등록된 허용 외부 도메인"
      >
        {visibleDomains.length ? (
          visibleDomains.map(({ domain, index }) => (
            <span className="guardrail-blocked-chip" key={`${domain}-${index}`}>
              <span title={domain}>{domain}</span>
              <button
                type="button"
                aria-label={`${domain} 삭제`}
                title={`${domain} 삭제`}
                onClick={() => {
                  onChange(
                    domains.filter((_, itemIndex) => itemIndex !== index),
                  );
                  setMessage("");
                }}
              >
                <X size={13} aria-hidden="true" />
              </button>
            </span>
          ))
        ) : (
          <span className="guardrail-blocked-empty">
            {domains.length
              ? "검색 결과가 없습니다."
              : "등록된 허용 도메인이 없습니다."}
          </span>
        )}
      </div>
      <div className="guardrail-blocked-meta">
        <span>
          {filter ? `${visibleDomains.length}개 검색됨 · ` : ""}
          {domains.length}/50개 등록
        </span>
        {message && <span role="status">{message}</span>}
      </div>
    </div>
  );
}
