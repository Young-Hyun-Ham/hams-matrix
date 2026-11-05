import type { ReactNode } from "react";

export function Icon({ name, size = 16 }: { name: string; size?: number }) {
  const icons: Record<string, ReactNode> = {
    capturePage: (
      <>
        <path d="M14 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5M14 3l5 5h-5V3ZM7 8h3M7 12h3" />
        <rect x="12" y="13" width="10" height="8" rx="2" />
        <circle cx="17" cy="17" r="2" />
      </>
    ),
    captureRegion: (
      <>
        <path d="M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5" />
        <rect x="7" y="7" width="10" height="10" rx="1" strokeDasharray="2 2" />
      </>
    ),
    emoji: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M8 14a4 4 0 0 0 8 0M8 9h.01M16 9h.01" />
      </>
    ),
    eye: (
      <>
        <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
        <circle cx="12" cy="12" r="2.5" />
      </>
    ),
    eyeOff: (
      <>
        <path d="m3 3 18 18" />
        <path d="M10.6 6.2A10.5 10.5 0 0 1 12 6c6.5 0 10 6 10 6a17 17 0 0 1-3 3.7M6.6 6.6C3.5 8.4 2 12 2 12s3.5 6 10 6c1.3 0 2.5-.2 3.5-.7" />
      </>
    ),
    lock: (
      <>
        <rect x="5" y="10" width="14" height="11" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      </>
    ),
    unlock: (
      <>
        <rect x="5" y="10" width="14" height="11" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 7-2.6" />
      </>
    ),
    page: (
      <>
        <rect x="4" y="3" width="16" height="18" rx="2" />
        <path d="M8 7h8M8 11h8" />
      </>
    ),
    clipboard: (
      <>
        <rect x="5" y="4" width="14" height="17" rx="2" />
        <path d="M9 4V2h6v2M9 9h6M9 13h6" />
      </>
    ),
    chevron: <path d="m9 18 6-6-6-6" />,
    down: <path d="m6 9 6 6 6-6" />,
    frame: (
      <>
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <path d="M9 4v16M15 4v16" />
      </>
    ),
    group: (
      <>
        <rect x="4" y="4" width="6" height="6" />
        <rect x="14" y="14" width="6" height="6" />
      </>
    ),
    text: <path d="M5 6V4h14v2M12 4v16M8 20h8" />,
    image: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <circle cx="8.5" cy="9" r="1.5" />
        <path d="m21 15-5-5L5 20" />
      </>
    ),
    button: (
      <>
        <rect x="3" y="6" width="18" height="12" rx="3" />
        <path d="M9 12h6" />
      </>
    ),
    checkbox: (
      <>
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <path d="m8 12 3 3 5-6" />
      </>
    ),
    radio: (
      <>
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="3" fill="currentColor" />
      </>
    ),
    select: (
      <>
        <rect x="3" y="6" width="18" height="12" rx="2" />
        <path d="m16 10 2 2-2 2" />
      </>
    ),
    icon: (
      <>
        <circle cx="12" cy="12" r="8" />
        <path d="M12 8v8M8 12h8" />
      </>
    ),
    star: (
      <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z" />
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    undo: (
      <>
        <path d="m9 7-5 5 5 5" />
        <path d="M20 17a7 7 0 0 0-7-7H4" />
      </>
    ),
    redo: (
      <>
        <path d="m15 7 5 5-5 5" />
        <path d="M4 17a7 7 0 0 1 7-7h9" />
      </>
    ),
    play: <path d="m8 5 11 7-11 7V5Z" />,
    share: (
      <>
        <circle cx="18" cy="5" r="3" />
        <circle cx="6" cy="12" r="3" />
        <circle cx="18" cy="19" r="3" />
        <path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4" />
      </>
    ),
    sparkle: (
      <>
        <path d="m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3Z" />
        <path d="m18 14 .8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8L18 14Z" />
      </>
    ),
    cursor: <path d="m5 3 14 9-6 2-3 6L5 3Z" />,
    hand: (
      <path d="M8 11V7a2 2 0 0 1 4 0v3-5a2 2 0 0 1 4 0v5-2a2 2 0 0 1 4 0v6c0 4-3 7-7 7h-1c-3 0-5-2-6-4l-2-3a2 2 0 0 1 3-3l1 1Z" />
    ),
    comment: (
      <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8Z" />
    ),
    history: (
      <>
        <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
        <path d="M3 3v5h5M12 7v5l3 2" />
      </>
    ),
    note: (
      <>
        <path d="M5 3h14a2 2 0 0 1 2 2v11l-5 5H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
        <path d="M16 21v-5h5M7 8h10M7 12h7" />
      </>
    ),
    more: (
      <>
        <circle cx="5" cy="12" r="1" fill="currentColor" />
        <circle cx="12" cy="12" r="1" fill="currentColor" />
        <circle cx="19" cy="12" r="1" fill="currentColor" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {icons[name]}
    </svg>
  );
}
