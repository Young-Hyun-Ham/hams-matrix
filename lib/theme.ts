export type Theme = "light" | "dark";
// Default for the initial document; PreferencesRuntime applies the member's DB value.
export const THEME_INIT_SCRIPT = `document.documentElement.dataset.theme="light"`;
