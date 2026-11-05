import { useEffect, useRef, useState } from "react";
import { Icon } from "./editor-icon";
import { emojiCategories, type EmojiPreset } from "../data/emoji-presets";

export function EmojiPicker({
  disabled,
  onAdd,
  onOpen,
}: {
  disabled: boolean;
  onAdd: (preset: EmojiPreset) => void;
  onOpen: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target))
        setOpen(false);
    };
    const frame = requestAnimationFrame(() => {
      const rect = root.current
        ?.querySelector(".emoji-panel")
        ?.getBoundingClientRect();
      if (rect) setOffset(Math.min(0, window.innerWidth - rect.right - 8));
      root.current
        ?.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]')
        ?.focus();
    });
    window.addEventListener("pointerdown", close, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointerdown", close, true);
    };
  }, [open]);
  return (
    <div
      className="emoji-control"
      ref={root}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <button
        type="button"
        ref={trigger}
        disabled={disabled}
        aria-label="이모티콘 추가"
        title="이모티콘 추가"
        aria-expanded={open}
        aria-controls="planning-emoji-panel"
        onClick={() => {
          setOffset(0);
          setOpen(!open);
          if (!open) onOpen();
        }}
      >
        <Icon name="emoji" />
      </button>
      {open && (
        <div
          id="planning-emoji-panel"
          className="emoji-panel"
          style={{ marginLeft: offset }}
        >
          <div role="tablist" aria-label="이모티콘 분류" className="emoji-tabs">
            {emojiCategories.map((item, index) => (
              <button
                type="button"
                key={item.id}
                id={`emoji-tab-${item.id}`}
                role="tab"
                aria-selected={category === index}
                aria-controls={`emoji-items-${item.id}`}
                tabIndex={category === index ? 0 : -1}
                onClick={() => setCategory(index)}
                onKeyDown={(event) => {
                  if (
                    !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                      event.key,
                    )
                  )
                    return;
                  event.preventDefault();
                  const next =
                    event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? emojiCategories.length - 1
                        : (index +
                            (event.key === "ArrowRight" ? 1 : -1) +
                            emojiCategories.length) %
                          emojiCategories.length;
                  setCategory(next);
                  root.current
                    ?.querySelector<HTMLButtonElement>(
                      `#emoji-tab-${emojiCategories[next].id}`,
                    )
                    ?.focus();
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div
            role="tabpanel"
            id={`emoji-items-${emojiCategories[category].id}`}
            aria-labelledby={`emoji-tab-${emojiCategories[category].id}`}
            className="emoji-grid"
          >
            {emojiCategories[category].items.map((item) => (
              <button
                type="button"
                key={item.id}
                disabled={disabled}
                aria-label={item.label}
                title={item.label}
                onClick={() => {
                  onAdd(item);
                  setOpen(false);
                  trigger.current?.focus();
                }}
              >
                <span
                  style={{
                    backgroundColor: item.style.backgroundColor,
                    color: item.style.color,
                    borderRadius: item.style.borderRadius,
                    fontSize: item.style.fontSize,
                    fontWeight: item.style.fontWeight,
                  }}
                >
                  {item.text}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
