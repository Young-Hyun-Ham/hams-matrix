export type Theme = "light" | "dark";
export const THEME_STORAGE_KEY = "hams-matrix-theme";
// Runs before the page paints. Restrict storage values to two known attribute values.
export const THEME_INIT_SCRIPT = `(()=>{let theme="light";try{if(localStorage.getItem("${THEME_STORAGE_KEY}")==="dark")theme="dark"}catch{}document.documentElement.dataset.theme=theme})()`;
