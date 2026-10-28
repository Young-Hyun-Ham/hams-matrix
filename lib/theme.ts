export type Theme = "light" | "dark";
// Authenticated layouts apply the member's DB value before workspace content paints.
export const THEME_INIT_SCRIPT = `document.documentElement.dataset.theme="light"`;
