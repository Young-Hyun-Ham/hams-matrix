export const themePresets = [
  {
    id: "light-orange",
    label: "라이트 주황",
    theme: "light",
    color: "#ff6b00",
  },
  { id: "light-blue", label: "라이트 파랑", theme: "light", color: "#1f6fff" },
  { id: "light-green", label: "라이트 초록", theme: "light", color: "#00875f" },
  { id: "dark-orange", label: "다크 주황", theme: "dark", color: "#ff6b00" },
  { id: "dark-blue", label: "다크 파랑", theme: "dark", color: "#1f6fff" },
  { id: "dark-green", label: "다크 초록", theme: "dark", color: "#00875f" },
] as const;
export type ThemePreset = (typeof themePresets)[number]["id"] | "custom";
export function isThemePreset(value: unknown): value is ThemePreset {
  return (
    value === "custom" || themePresets.some((preset) => preset.id === value)
  );
}
