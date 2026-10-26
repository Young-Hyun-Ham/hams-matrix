"use client";
import {
  useEffect,
  useRef,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";
import "./date-input.css";

export function DateInput({
  id,
  name,
  label,
  value,
  onChange,
  required = false,
}: {
  id: string;
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  const [year = "", month = "", day = ""] = value.split("-");
  const yearRef = useRef<HTMLInputElement>(null),
    monthRef = useRef<HTMLInputElement>(null),
    dayRef = useRef<HTMLInputElement>(null),
    calendarRef = useRef<HTMLInputElement>(null);
  const complete = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const full = complete && Number(year) > 0;
  const timestamp = full ? Date.parse(`${value}T00:00:00Z`) : NaN;
  const valid =
    Number.isFinite(timestamp) &&
    new Date(timestamp).toISOString().slice(0, 10) === value;
  const hasValue = !!(year || month || day);
  useEffect(() => {
    dayRef.current?.setCustomValidity(
      complete && !valid ? "실제 존재하는 날짜를 입력해 주세요." : "",
    );
  }, [complete, valid, value]);
  function update(index: number, text: string) {
    const parts = [year, month, day];
    parts[index] = text.replace(/\D/g, "").slice(0, index === 0 ? 4 : 2);
    onChange(parts.some(Boolean) ? parts.join("-") : "");
    if (index < 2 && parts[index].length === (index === 0 ? 4 : 2)) {
      const next = index === 0 ? monthRef.current : dayRef.current;
      next?.focus();
      next?.select();
    }
  }
  function pad(index: number, text: string) {
    const parts = [year, month, day];
    if (text.length === 1) {
      parts[index] = text.padStart(2, "0");
      onChange(parts.join("-"));
    }
  }
  function paste(event: ClipboardEvent<HTMLInputElement>) {
    const text = event.clipboardData.getData("text").trim();
    const match =
      text.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/) ??
      text.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (!match) return;
    event.preventDefault();
    onChange(
      `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`,
    );
    dayRef.current?.focus();
    dayRef.current?.select();
  }
  function navigate(event: KeyboardEvent<HTMLInputElement>, index: number) {
    const input = event.currentTarget,
      refs = [yearRef, monthRef, dayRef];
    const previous =
      (event.key === "ArrowLeft" && input.selectionStart === 0) ||
      (event.key === "Backspace" && !input.value);
    const next =
      event.key === "ArrowRight" && input.selectionEnd === input.value.length;
    const target = previous
      ? refs[index - 1]?.current
      : next
        ? refs[index + 1]?.current
        : null;
    if (target) {
      event.preventDefault();
      target.focus();
      target.select();
    }
  }
  return (
    <span className="matrix-date-input" role="group" aria-label={label}>
      <input type="hidden" name={name} value={valid ? value : ""} />
      <input
        id={id}
        ref={yearRef}
        className="matrix-date-year"
        type="text"
        inputMode="numeric"
        autoComplete="off"
        aria-label={`${label} 연도`}
        placeholder="YYYY"
        maxLength={4}
        pattern="[0-9]{4}"
        required={required || hasValue}
        value={year}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => update(0, e.target.value)}
        onPaste={paste}
        onKeyDown={(e) => navigate(e, 0)}
      />
      <span aria-hidden="true">-</span>
      <input
        ref={monthRef}
        className="matrix-date-part"
        type="text"
        inputMode="numeric"
        autoComplete="off"
        aria-label={`${label} 월`}
        placeholder="MM"
        maxLength={2}
        pattern="(0[1-9]|1[0-2])"
        required={required || hasValue}
        value={month}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => update(1, e.target.value)}
        onBlur={(e) => pad(1, e.currentTarget.value)}
        onPaste={paste}
        onKeyDown={(e) => navigate(e, 1)}
      />
      <span aria-hidden="true">-</span>
      <input
        ref={dayRef}
        className="matrix-date-part"
        type="text"
        inputMode="numeric"
        autoComplete="off"
        aria-label={`${label} 일`}
        placeholder="DD"
        maxLength={2}
        pattern="(0[1-9]|[12][0-9]|3[01])"
        required={required || hasValue}
        value={day}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => update(2, e.target.value)}
        onBlur={(e) => pad(2, e.currentTarget.value)}
        onPaste={paste}
        onKeyDown={(e) => navigate(e, 2)}
      />
      <input
        ref={calendarRef}
        className="matrix-date-native"
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        min="0001-01-01"
        max="9999-12-31"
        value={valid ? value : ""}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        className="matrix-date-calendar"
        aria-label={`${label} 달력 열기`}
        onClick={() => {
          const input = calendarRef.current;
          if (input?.showPicker) input.showPicker();
          else input?.click();
        }}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          aria-hidden="true"
        >
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M16 3v4M8 3v4M3 11h18" />
        </svg>
      </button>
    </span>
  );
}
