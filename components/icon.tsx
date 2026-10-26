import type { CSSProperties } from "react";

const paths: Record<string, string> = {
  pin: "m16 3 5 5-4 1-4 4v4l-2 2-6-6 2-2h4l4-4zM8 16l-5 5",
  edit: "m15 4 5 5M4 20l4-1L20 7a2.1 2.1 0 0 0-3-3L5 16z",
  trash: "M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7",
  "window-expand": "M4 4h16v16H4z",
  "window-restore": "M8 3h13v13M3 8h13v13H3z",
  "window-popout": "M14 3h7v7m0-7L11 13M10 5H3v16h16v-7",
  "window-dock": "M3 4h18v16H3zM9 4v16m7-11-3 3 3 3",
  chatbot:
    "M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8l-5 3V7a2 2 0 0 1 2-2ZM12 2v3M8 11h.01M16 11h.01M8 15h8",
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5",
  moon: "M20.5 13.5A9 9 0 0 1 10.5 3a9 9 0 1 0 10 10.5Z",
  grid: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  list: "M9 5h12M9 12h12M9 19h12M3 5h1M3 12h1M3 19h1",
  screen: "M3 4h18v13H3z M8 21h8M12 17v4M3 8h18",
  code: "m8 7-5 5 5 5m8-10 5 5-5 5m-3-13-2 16",
  history: "M3 11a9 9 0 1 1 2 7M3 4v7h7m2-4v5l3 2",
  folder: "M3 6h7l2 3h9v11H3zM3 6V4h7l2 2",
  team: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8m7-7a4 4 0 0 1 0 7.75",
  search: "m21 21-5-5M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16",
  bell: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4",
  plus: "M12 5v14M5 12h14",
  arrow: "M5 12h14m-5-5 5 5-5 5",
  chevron: "m9 5 7 7-7 7",
  down: "m6 9 6 6 6-6",
  close: "m6 6 12 12M6 18 18 6",
  menu: "M3 6h18M3 12h18M3 18h18",
  spark: "m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z",
  ai: "M12 2l2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5z",
  check: "m5 12 4 4L19 6",
  clock: "M12 8v4l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
  settings:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8m-8 4H2m20 0h-2M12 4V2m0 20v-2M6 6 4 4m16 16-2-2M6 18l-2 2M20 4l-2 2",
  logout: "M9 4H3v16h6m6-13 5 5-5 5m-7-5h12",
  help: "M9 8a3 3 0 1 1 5 2.2c-1.2.7-2 1.3-2 2.8m0 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12m13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  lock: "M5 10h14v11H5zM8 10V7a4 4 0 1 1 8 0v3",
  mail: "M3 5h18v14H3zM3 5l9 8 9-8",
  filter: "M4 7h16M7 12h10M10 17h4",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  file: "M5 2h9l5 5v15H5zM14 2v6h5M8 13h8M8 17h5",
  external: "M14 3h7v7m0-7L10 14M10 3H3v18h18v-7",
  shield: "m12 2 9 4v6c0 6-9 10-9 10S3 18 3 12V6z m-5 10 3 3 7-7",
};

export function Icon({
  name,
  size = 20,
  style,
  className,
}: {
  name: string;
  size?: number;
  style?: CSSProperties;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
      className={className}
    >
      <path d={paths[name] ?? paths.file} />
    </svg>
  );
}

export function Brand() {
  return (
    <span className="brand">
      <span className="brand-symbol">
        <i />
        <i />
        <i />
        <i />
      </span>
      <span>
        hams<span className="brand-light">matrix</span>
      </span>
    </span>
  );
}
