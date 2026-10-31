"use client";
import { useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import { koreaToday, scheduleDay, scheduleDate } from "@/lib/wbs-schedule";

export function WbsDatePicker({ value, onChange, disabled = false, name, label, required = false }: {
  value: string; onChange: (value: string) => void; disabled?: boolean; name?: string; label: string; required?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [month, setMonth] = useState((value || koreaToday()).slice(0, 7));
  const first = scheduleDay(`${month}-01`);
  const next = new Date(first * 86400000);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const count = scheduleDay(next.toISOString().slice(0, 10)) - first;
  const shiftMonth = (delta: number) => {
    const date = new Date(first * 86400000);
    date.setUTCMonth(date.getUTCMonth() + delta);
    setMonth(date.toISOString().slice(0, 7));
  };
  return <span className="wbs-date-picker">
    {name && <input type="hidden" name={name} value={value} />}
    <input type="text" value={value} readOnly required={required} disabled={disabled}
      aria-label={label} onPaste={(event) => event.preventDefault()} onDrop={(event) => event.preventDefault()} />
    <button ref={trigger} type="button" disabled={disabled} aria-label={`${label} 달력 열기`} onClick={() => {
      setMonth((value || koreaToday()).slice(0, 7)); dialog.current?.showModal();
    }}><CalendarDays size={14} aria-hidden="true" /></button>
    <dialog ref={dialog} className="workspace-dialog admin-detail-dialog wbs-calendar-dialog" aria-label={`${label} 선택`}
      onClose={() => trigger.current?.focus()} onClick={(event) => { if (event.target === event.currentTarget) event.currentTarget.close(); }}>
      <div className="dialog-header admin-detail-header"><h2>{label} 선택</h2><button className="button admin-detail-close" type="button" onClick={() => dialog.current?.close()}>닫기</button></div>
      <div className="admin-detail-body">
        <div className="wbs-calendar-heading"><button type="button" aria-label="이전 달" onClick={() => shiftMonth(-1)}>‹</button><strong aria-live="polite">{month}</strong><button type="button" aria-label="다음 달" onClick={() => shiftMonth(1)}>›</button></div>
        <div className="wbs-calendar-grid" role="grid" aria-label={month} onKeyDown={(event) => {
          const element = event.target as HTMLButtonElement;
          if (!element.dataset.day) return;
          const delta = ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 } as Record<string, number>)[event.key];
          if (delta === undefined) return;
          event.preventDefault();
          const day = Number(element.dataset.day) + delta, date = scheduleDate(day);
          setMonth(date.slice(0, 7));
          requestAnimationFrame(() => dialog.current?.querySelector<HTMLButtonElement>(`[data-day="${day}"]`)?.focus());
        }}>
          {["일", "월", "화", "수", "목", "금", "토"].map((day) => <span key={day} role="columnheader">{day}</span>)}
          {Array.from({ length: new Date(first * 86400000).getUTCDay() }, (_, index) => <span key={`blank-${index}`} />)}
          {Array.from({ length: count }, (_, index) => {
            const date = scheduleDate(first + index);
            return <button key={date} type="button" role="gridcell" data-day={first + index} aria-label={date} aria-selected={date === value}
              onClick={() => { if (!disabled) onChange(date); dialog.current?.close(); }}>{index + 1}</button>;
          })}
        </div>
        {!required && <button type="button" className="button" onClick={() => { if (!disabled) onChange(""); dialog.current?.close(); }}>날짜 지우기</button>}
      </div>
    </dialog>
  </span>;
}
