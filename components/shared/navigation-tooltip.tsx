"use client";

import {
  cloneElement,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
} from "react";
import { createPortal } from "react-dom";

export function NavigationTooltip({
  label,
  resetKey,
  children,
}: {
  label: string;
  resetKey: string;
  children: ReactElement<{ "aria-describedby"?: string }>;
}) {
  const id = useId();
  const wrapper = useRef<HTMLSpanElement>(null);
  const tooltip = useRef<HTMLDivElement>(null);
  const hovered = useRef(false);
  const focused = useRef(false);
  const dismissed = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [position, setPosition] = useState<{
    left: number;
    top: number;
    context: string;
  } | null>(null);
  const [previousResetKey, setPreviousResetKey] = useState(resetKey);
  if (previousResetKey !== resetKey) {
    setPreviousResetKey(resetKey);
    setPosition(null);
  }
  const visible = position?.context === resetKey;

  function clearTimer() {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }

  function dismiss() {
    clearTimer();
    dismissed.current = true;
    setPosition(null);
  }

  function show() {
    clearTimer();
    const trigger = wrapper.current?.firstElementChild;
    if (!trigger || dismissed.current || document.querySelector("dialog[open]"))
      return;
    const rect = trigger.getBoundingClientRect();
    if (!rect.width || !rect.height || rect.right <= 0) return;
    setPosition({ left: rect.right + 8, top: rect.top, context: resetKey });
  }

  function leave() {
    clearTimer();
    if (!hovered.current && !focused.current) {
      dismissed.current = false;
      timer.current = setTimeout(() => setPosition(null), 120);
    }
  }

  useLayoutEffect(() => {
    if (!visible || !tooltip.current || !position) return;
    const rect = tooltip.current.getBoundingClientRect();
    const left = Math.max(
      8,
      Math.min(position.left, innerWidth - rect.width - 8),
    );
    const top = Math.max(
      8,
      Math.min(position.top, innerHeight - rect.height - 8),
    );
    if (left !== position.left || top !== position.top)
      setPosition({ ...position, left, top });
  }, [visible, position]);

  useEffect(() => {
    // A layout/route change cancels pending hover timers as well as visible tips.
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
      hovered.current = false;
      focused.current = false;
      dismissed.current = false;
    };
  }, [resetKey]);

  useEffect(() => {
    function close() {
      if (timer.current !== null) clearTimeout(timer.current);
      dismissed.current = hovered.current || focused.current;
      setPosition(null);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    function focus(event: FocusEvent) {
      if (
        event.target instanceof Element &&
        event.target.closest("dialog[open]")
      )
        close();
    }
    const observer = new MutationObserver(() => {
      if (document.querySelector("dialog[open]")) close();
    });
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["open"],
      subtree: true,
    });
    document.addEventListener("keydown", escape);
    document.addEventListener("focusin", focus);
    document.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      observer.disconnect();
      document.removeEventListener("keydown", escape);
      document.removeEventListener("focusin", focus);
      document.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, []);

  return (
    <span
      ref={wrapper}
      className="navigation-tooltip-trigger"
      onPointerEnter={(event) => {
        if (event.pointerType === "touch") return;
        dismissed.current = false;
        hovered.current = true;
        clearTimer();
        if (!dismissed.current) timer.current = setTimeout(show, 300);
      }}
      onPointerLeave={() => {
        hovered.current = false;
        leave();
      }}
      onFocus={() => {
        dismissed.current = false;
        focused.current = true;
        show();
      }}
      onBlur={() => {
        focused.current = false;
        leave();
      }}
      onClickCapture={dismiss}
    >
      {cloneElement(children, {
        "aria-describedby": visible
          ? [children.props["aria-describedby"], id].filter(Boolean).join(" ")
          : children.props["aria-describedby"],
      })}
      {visible &&
        position &&
        createPortal(
          <div
            ref={tooltip}
            id={id}
            role="tooltip"
            className="navigation-tooltip"
            style={{ left: position.left, top: position.top }}
            onPointerEnter={() => {
              hovered.current = true;
              clearTimer();
            }}
            onPointerLeave={() => {
              hovered.current = false;
              leave();
            }}
          >
            {label}
          </div>,
          document.body,
        )}
    </span>
  );
}
