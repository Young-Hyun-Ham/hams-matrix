"use client";
import { useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import { koreaToday, scheduleDay, scheduleDate } from "@/lib/wbs-schedule";
import { inRange, emptyRange } from "@/lib/wbs-date-constraints";
import "@/styles/pages/projects/tabs/wbs/wbs-date-picker.css";

export function WbsDatePicker({
  value,
  onChange,
  disabled = false,
  name,
  label,
  required = false,
  min,
  max,
  id,
  describedBy,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  name?: string;
  label: string;
  required?: boolean;
  min?: string;
  max?: string;
  id?: string;
  describedBy?: string;
}) {
  const range = { min, max };
  const allowed = (date: string) =>
    !disabled && !emptyRange(range) && inRange(date, range);
  const initialMonth = () => {
    let date = value || koreaToday();
    if (min && date < min) date = min;
    if (max && date > max) date = max;
    return date.slice(0, 7);
  };
  const monthAllowed = (candidate: string) =>
    !emptyRange(range) &&
    (!min || candidate >= min.slice(0, 7)) &&
    (!max || candidate <= max.slice(0, 7));
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const returnedFocus = useRef(false);
  const closeCalendar = () => {
    returnedFocus.current = true;
    dialog.current?.close();
    trigger.current?.focus({ preventScroll: true });
  };
  const [month, setMonth] = useState((value || koreaToday()).slice(0, 7));
  const first = scheduleDay(`${month}-01`);
  const next = new Date(first * 86400000);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const count = scheduleDay(next.toISOString().slice(0, 10)) - first;
  const shiftMonth = (delta: number) => {
    const date = new Date(first * 86400000);
    date.setUTCMonth(date.getUTCMonth() + delta);
    const candidate = date.toISOString().slice(0, 7);
    if (monthAllowed(candidate)) setMonth(candidate);
  };
  return (
    <span className="wbs-date-picker">
      {name && <input type="hidden" name={name} value={value} />}
      <input
        id={id}
        aria-describedby={describedBy}
        type="text"
        value={value}
        readOnly
        required={required}
        disabled={disabled}
        aria-label={label}
        onPaste={(event) => event.preventDefault()}
        onDrop={(event) => event.preventDefault()}
      />
      <button
        ref={trigger}
        type="button"
        disabled={disabled}
        aria-label={`${label} 달력 열기`}
        onClick={() => {
          returnedFocus.current = false;
          setMonth(initialMonth());
          dialog.current?.showModal();
        }}
      >
        <CalendarDays size={14} aria-hidden="true" />
      </button>
      <dialog
        ref={dialog}
        className="workspace-dialog admin-detail-dialog wbs-calendar-dialog"
        aria-label={`${label} 선택`}
        onClose={() => {
          if (!returnedFocus.current) trigger.current?.focus();
          returnedFocus.current = false;
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
      >
        <div className="dialog-header admin-detail-header">
          <h2>{label} 선택</h2>
          <button
            className="button admin-detail-close"
            type="button"
            onClick={closeCalendar}
          >
            닫기
          </button>
        </div>
        <div className="admin-detail-body">
          {(min || max) && (
            <p>
              {emptyRange(range)
                ? "선택 가능한 기간이 없습니다. 관계 또는 기간을 조정해 주세요."
                : `선택 가능: ${min || "제한 없음"} ~ ${max || "제한 없음"}`}
            </p>
          )}
          <div className="wbs-calendar-heading">
            <button
              type="button"
              aria-label="이전 달"
              disabled={
                emptyRange(range) || !!(min && month <= min.slice(0, 7))
              }
              onClick={() => shiftMonth(-1)}
            >
              ‹
            </button>
            <strong aria-live="polite">{month}</strong>
            <button
              type="button"
              aria-label="다음 달"
              disabled={
                emptyRange(range) || !!(max && month >= max.slice(0, 7))
              }
              onClick={() => shiftMonth(1)}
            >
              ›
            </button>
          </div>
          <div
            className="wbs-calendar-grid"
            role="grid"
            aria-label={month}
            onKeyDown={(event) => {
              const element = event.target as HTMLButtonElement;
              if (!element.dataset.day) return;
              const delta = (
                {
                  ArrowLeft: -1,
                  ArrowRight: 1,
                  ArrowUp: -7,
                  ArrowDown: 7,
                } as Record<string, number>
              )[event.key];
              if (delta === undefined) return;
              event.preventDefault();
              const day = Number(element.dataset.day) + delta,
                date = scheduleDate(day);
              if (!allowed(date)) return;
              setMonth(date.slice(0, 7));
              requestAnimationFrame(() =>
                dialog.current
                  ?.querySelector<HTMLButtonElement>(`[data-day="${day}"]`)
                  ?.focus(),
              );
            }}
          >
            {["일", "월", "화", "수", "목", "금", "토"].map((day) => (
              <span key={day} role="columnheader">
                {day}
              </span>
            ))}
            {Array.from(
              { length: new Date(first * 86400000).getUTCDay() },
              (_, index) => (
                <span key={`blank-${index}`} />
              ),
            )}
            {Array.from({ length: count }, (_, index) => {
              const date = scheduleDate(first + index);
              return (
                <button
                  key={date}
                  type="button"
                  role="gridcell"
                  data-day={first + index}
                  aria-label={date}
                  aria-selected={date === value}
                  disabled={!allowed(date)}
                  onClick={() => {
                    if (!allowed(date)) return;
                    onChange(date);
                    closeCalendar();
                  }}
                >
                  {index + 1}
                </button>
              );
            })}
          </div>
          {!required && (
            <button
              type="button"
              className="button"
              onClick={() => {
                if (!disabled) onChange("");
                closeCalendar();
              }}
            >
              날짜 지우기
            </button>
          )}
        </div>
      </dialog>
    </span>
  );
}
