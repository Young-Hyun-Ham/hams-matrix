"use client";

import { useMemo, useRef, useState } from "react";
import { useTranslation } from "@/app/(builder)/hooks/useTranslation";

import styles from "./MemoPad.module.css";

import { getSafeUUID } from "../utils/util";

type ColorRange = {
  start: number;
  end: number;
  color: string;
};

type MemoItem = {
  id: string;
  text: string;
  backgroundColor: string;
  ranges: ColorRange[];
};

type MemoPadProps = {
  memos: MemoItem[];
  setMemos: React.Dispatch<React.SetStateAction<MemoItem[]>>;
};

type SelectionState = {
  start: number;
  end: number;
};

function normalizeRanges(ranges: ColorRange[]) {
  const cleaned = ranges
    .filter((range) => range.end > range.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const merged: ColorRange[] = [];

  for (const range of cleaned) {
    const last = merged[merged.length - 1];

    if (last && last.color === range.color && last.end >= range.start) {
      last.end = Math.max(last.end, range.end);
      continue;
    }

    if (last && last.color === range.color && last.end === range.start) {
      last.end = range.end;
      continue;
    }

    merged.push({ ...range });
  }

  return merged;
}

function applyColorToRanges(
  prevRanges: ColorRange[],
  selection: SelectionState,
  color: string,
) {
  const { start, end } = selection;
  if (start === end) return prevRanges;

  const next: ColorRange[] = [];

  for (const range of prevRanges) {
    const isOverlap = !(range.end <= start || range.start >= end);

    if (!isOverlap) {
      next.push(range);
      continue;
    }

    if (range.start < start) {
      next.push({
        start: range.start,
        end: start,
        color: range.color,
      });
    }

    if (range.end > end) {
      next.push({
        start: end,
        end: range.end,
        color: range.color,
      });
    }
  }

  next.push({ start, end, color });

  return normalizeRanges(next);
}

function renderHighlightedText(text: string, ranges: ColorRange[]) {
  const normalized = normalizeRanges(ranges);
  const parts: React.ReactNode[] = [];
  let cursor = 0;

  normalized.forEach((range, index) => {
    if (cursor < range.start) {
      parts.push(
        <span key={`plain-${index}-${cursor}`}>
          {text.slice(cursor, range.start)}
        </span>,
      );
    }

    parts.push(
      <span
        key={`color-${index}-${range.start}`}
        style={{ color: range.color }}
      >
        {text.slice(range.start, range.end)}
      </span>,
    );

    cursor = range.end;
  });

  if (cursor < text.length) {
    parts.push(<span key={`plain-last-${cursor}`}>{text.slice(cursor)}</span>);
  }

  if (text.length === 0) {
    parts.push(<span key="empty">{"\u200b"}</span>);
  }

  return parts;
}

export default function MemoPad({ memos, setMemos }: MemoPadProps) {
  const { t } = useTranslation();
  const textareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const overlayRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [selectionById, setSelectionById] = useState<
    Record<string, SelectionState>
  >({});

  const addMemo = () => {
    setMemos((prev) => [
      ...prev,
      {
        id: getSafeUUID(),
        text: "",
        backgroundColor: "#fff7c2",
        ranges: [],
      },
    ]);
  };

  const removeMemo = (id: string) => {
    setMemos((prev) => prev.filter((memo) => memo.id !== id));
  };

  const updateMemo = (id: string, patch: Partial<MemoItem>) => {
    setMemos((prev) =>
      prev.map((memo) => (memo.id === id ? { ...memo, ...patch } : memo)),
    );
  };

  const handleSelect = (id: string) => {
    const textarea = textareaRefs.current[id];
    if (!textarea) return;

    setSelectionById((prev) => ({
      ...prev,
      [id]: {
        start: textarea.selectionStart ?? 0,
        end: textarea.selectionEnd ?? 0,
      },
    }));
  };

  const handleApplyTextColor = (id: string, color: string) => {
    const selection = selectionById[id];
    if (!selection || selection.start === selection.end) return;

    setMemos((prev) =>
      prev.map((memo) =>
        memo.id === id
          ? {
              ...memo,
              ranges: applyColorToRanges(memo.ranges ?? [], selection, color),
            }
          : memo,
      ),
    );

    textareaRefs.current[id]?.focus();
  };

  const handleScroll = (id: string) => {
    const textarea = textareaRefs.current[id];
    const overlay = overlayRefs.current[id];
    if (!textarea || !overlay) return;

    overlay.scrollTop = textarea.scrollTop;
    overlay.scrollLeft = textarea.scrollLeft;
  };

  return (
    <div className={styles.memoPadContainer}>
      <div className={styles.memoPadHeader}>
        <h4 className={styles.memoPadTitle}>{t("Memo")}</h4>
        <button type="button" className={styles.addButton} onClick={addMemo}>
          {t("Add")}
        </button>
      </div>

      <div className={styles.memoList}>
        {memos.map((memo) => (
          <div key={memo.id} className={styles.memoCard}>
            <div className={styles.memoToolbar}>
              <label className={styles.colorLabel}>
                {t("Bg")}
                <input
                  type="color"
                  value={memo.backgroundColor}
                  onChange={(e) =>
                    updateMemo(memo.id, { backgroundColor: e.target.value })
                  }
                />
              </label>

              <label className={styles.colorLabel}>
                {t("Text")}
                <input
                  type="color"
                  defaultValue="#111827"
                  onChange={(e) =>
                    handleApplyTextColor(memo.id, e.target.value)
                  }
                />
              </label>

              <button
                type="button"
                className={styles.deleteButton}
                onClick={() => removeMemo(memo.id)}
              >
                {t("Delete")}
              </button>
            </div>

            <div
              className={styles.memoEditorWrap}
              style={{ backgroundColor: memo.backgroundColor }}
            >
              <div
                ref={(node) => {
                  overlayRefs.current[memo.id] = node;
                }}
                className={styles.memoOverlay}
                aria-hidden="true"
              >
                {renderHighlightedText(memo.text, memo.ranges ?? [])}
              </div>

              <textarea
                ref={(node) => {
                  textareaRefs.current[memo.id] = node;
                }}
                className={styles.memoTextarea}
                value={memo.text}
                onChange={(e) => updateMemo(memo.id, { text: e.target.value })}
                onSelect={() => handleSelect(memo.id)}
                onClick={() => handleSelect(memo.id)}
                onKeyUp={() => handleSelect(memo.id)}
                onScroll={() => handleScroll(memo.id)}
                spellCheck={false}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
