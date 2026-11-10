"use client";
import { useEffect, useId, useRef, useState } from "react";
import type { DatabaseDomain } from "@/lib/database-domain-types";
import { databaseTypeLabel } from "@/lib/database-data-types";
import { jsonRequest } from "@/lib/client-request";

type Listing = {
  items: DatabaseDomain[];
  total: number;
  page: number;
  pageSize: number;
};
export function DatabaseDomainSelect({
  projectId,
  columnName,
  value,
  selected,
  disabled,
  onSelect,
}: {
  projectId: string;
  columnName: string;
  value: string;
  selected: boolean;
  disabled?: boolean;
  onSelect: (domain: DatabaseDomain | null) => void;
}) {
  const id = useId(),
    root = useRef<HTMLDivElement>(null),
    input = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null),
    sequence = useRef(0),
    compositionEnd = useRef(0);
  const [open, setOpen] = useState(false),
    [draft, setDraft] = useState(""),
    [applied, setApplied] = useState("");
  const [list, setList] = useState<Listing | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const [active, setActive] = useState(-1);
  useEffect(
    () => () => {
      sequence.current++;
      controller.current?.abort();
    },
    [projectId],
  );
  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);
  function close() {
    sequence.current++;
    controller.current?.abort();
    setOpen(false);
  }
  async function search(q: string, page = 1) {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    const current = ++sequence.current;
    setApplied(q);
    setLoading(true);
    setError("");
    setList(null);
    setActive(-1);
    try {
      const result = await jsonRequest(
        `/api/projects/${encodeURIComponent(projectId)}/database/domains?${new URLSearchParams({ q, page: String(page), pageSize: "10" })}`,
        { signal: request.signal },
      );
      if (current === sequence.current) setList(result);
    } catch (e) {
      if (!request.signal.aborted && current === sequence.current)
        setError(e instanceof Error ? e.message : "조회하지 못했습니다.");
    } finally {
      if (current === sequence.current) setLoading(false);
    }
  }
  function choose(domain: DatabaseDomain) {
    if (disabled || !domain.databaseType) return;
    onSelect(domain);
    close();
  }
  return (
    <div
      className="database-domain-select"
      data-domain-search
      ref={root}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) close();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.preventDefault();
          e.stopPropagation();
          close();
        }
      }}
    >
      <span id={`${id}-label`}>도메인</span>
      <button
        type="button"
        className="button database-domain-trigger"
        disabled={disabled}
        aria-labelledby={`${id}-label ${id}-value`}
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        onClick={() => {
          if (open) close();
          else {
            setOpen(true);
            setDraft(columnName);
            void search(columnName);
          }
        }}
      >
        <span id={`${id}-value`}>{value || "도메인 선택"}</span>
      </button>
      {selected && (
        <button
          type="button"
          className="button"
          disabled={disabled}
          onClick={() => {
            onSelect(null);
            close();
          }}
        >
          도메인 선택 해제
        </button>
      )}
      {open && (
        <div id={`${id}-panel`} className="database-domain-panel">
          <div className="database-domain-search-row">
            <input
              ref={input}
              role="combobox"
              aria-label="도메인 검색어"
              aria-autocomplete="list"
              aria-expanded={open}
              aria-controls={`${id}-list`}
              aria-activedescendant={
                active >= 0 ? `${id}-option-${active}` : undefined
              }
              maxLength={100}
              value={draft}
              disabled={disabled}
              onChange={(e) => {
                setDraft(e.target.value);
                setActive(-1);
              }}
              onCompositionEnd={() => {
                compositionEnd.current = Date.now();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  e.stopPropagation();
                  if (
                    e.nativeEvent.isComposing ||
                    e.nativeEvent.keyCode === 229 ||
                    Date.now() - compositionEnd.current < 50
                  )
                    return;
                  const option = list?.items[active];
                  if (option) choose(option);
                  else void search(draft);
                } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                  e.preventDefault();
                  const count = list?.items.length ?? 0;
                  if (count)
                    setActive((i) =>
                      e.key === "ArrowDown"
                        ? (i + 1) % count
                        : i <= 0
                          ? count - 1
                          : i - 1,
                    );
                }
              }}
            />
            <button
              type="button"
              className="button"
              disabled={disabled}
              onClick={() => void search(draft)}
            >
              검색
            </button>
          </div>
          {loading && <p role="status">불러오는 중…</p>}
          {error && (
            <p role="alert">
              {error}{" "}
              <button
                type="button"
                className="button"
                onClick={() => void search(applied)}
              >
                다시 조회
              </button>
            </p>
          )}
          <div
            id={`${id}-list`}
            role="listbox"
            aria-label="도메인 검색 결과"
            aria-busy={loading}
            className="database-domain-options"
          >
            {list?.items.map((domain, index) => (
              <button
                key={domain.id}
                id={`${id}-option-${index}`}
                type="button"
                role="option"
                aria-selected={active === index}
                disabled={disabled || !domain.databaseType}
                title={domain.description}
                onClick={() => choose(domain)}
              >
                {domain.logicalName} / {domain.physicalName} /{" "}
                {databaseTypeLabel(domain.databaseType)} / {domain.dataType}
                {domain.length ? `(${domain.length})` : ""}
                {!domain.databaseType && " (DB 지정 후 선택 가능)"}
              </button>
            ))}
          </div>
          {list && (
            <>
              {!list.total && <p role="status">검색 결과가 없습니다.</p>}
              <nav aria-label="도메인 검색 페이지" className="matrix-toolbar">
                <button
                  type="button"
                  className="button"
                  disabled={disabled || list.page <= 1}
                  onClick={() => void search(applied, list.page - 1)}
                >
                  이전
                </button>
                <span>
                  {list.page} / {Math.max(1, Math.ceil(list.total / 10))} ·{" "}
                  {list.total}건
                </span>
                <button
                  type="button"
                  className="button"
                  disabled={disabled || list.page * 10 >= list.total}
                  onClick={() => void search(applied, list.page + 1)}
                >
                  다음
                </button>
              </nav>
            </>
          )}
        </div>
      )}
    </div>
  );
}
