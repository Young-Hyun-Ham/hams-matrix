"use client";
import Link from "next/link";
import { useEffect, useRef } from "react";

export function SettingsTabs({
  base,
  tab,
  items,
  variant = "default",
}: {
  base: string;
  tab: string;
  items: readonly (readonly [string, string])[];
  variant?: "default" | "admin";
}) {
  const nav = useRef<HTMLElement>(null);
  useEffect(() => {
    if (variant !== "admin") return;
    const strip = nav.current;
    const selected = strip?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!strip || !selected) return;
    const bounds = strip.getBoundingClientRect(),
      active = selected.getBoundingClientRect();
    if (active.left < bounds.left)
      strip.scrollLeft -= bounds.left - active.left;
    else if (active.right > bounds.right)
      strip.scrollLeft += active.right - bounds.right;
  }, [tab, variant]);
  return (
    <nav
      ref={nav}
      aria-label={base === "/admin/settings" ? "관리자 설정 탭" : "설정 탭"}
      className={variant === "admin" ? "admin-settings-tabs" : undefined}
      style={
        variant === "default"
          ? { display: "flex", gap: 8, flexWrap: "wrap", margin: "20px 0" }
          : undefined
      }
    >
      {items.map(([key, label]) => (
        <Link
          key={key}
          href={`${base}?tab=${key}`}
          className={
            variant === "admin"
              ? "admin-settings-tab"
              : `button ${tab === key ? "primary" : ""}`
          }
          aria-current={tab === key ? "page" : undefined}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
