import type { Theme } from "@/lib/theme";
import { mixColor, personalPalette } from "@/lib/personal-palette";

// Explicit SVG colors also survive standalone SVG/PNG export.
export function architectureTheme(theme: Theme, accentColor: string | null = null) {
  const base = theme === "dark" ? {
    background: "#22222e", text: "#e7e7f0", muted: "#a6a5bb",
    border: "#69677e", line: "#aaa6c3", group: "#181821",
    infrastructure: "#302744", node: "#302744", shadow: "#000000",
    layers: { client: "#29354b", gateway: "#223f3a", frontend: "#293953",
      backend: "#3a2e50", data: "#443b29", external: "#313643" },
  } : {
    background: "#ffffff", text: "#202335", muted: "#818497",
    border: "#8196ac", line: "#526a85", group: "#f7f8fc",
    infrastructure: "#f0ecff", node: "#f0ecff", shadow: "#b7c8dc",
    layers: { client: "#e0edfb", gateway: "#dcf2ec", frontend: "#e1edff",
      backend: "#ede5fb", data: "#fef0d9", external: "#e7edf3" },
  };
  if (!accentColor) return base;
  const palette = personalPalette(theme, accentColor);
  return { ...base, infrastructure: palette.soft, node: palette.soft,
    line: palette.primary, border: mixColor(palette.primary, base.background, .65),
    layers: { ...base.layers, backend: palette.soft } };
}
