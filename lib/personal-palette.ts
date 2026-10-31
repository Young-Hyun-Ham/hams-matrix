import type { Theme } from "./theme";
export function isAccentColor(value: unknown): value is string | null {
  return value === null || typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}
function rgb(hex: string) { return [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16)); }
function hex(channels: number[]) { return `#${channels.map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")}`; }
export function mixColor(color: string, background: string, amount: number) {
  const target = rgb(background);
  return hex(rgb(color).map((channel, index) => channel * amount + target[index] * (1 - amount)));
}
function luminance(color: string) {
  return rgb(color).map((channel) => channel / 255).map((channel) => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4)
    .reduce((sum, channel, index) => sum + channel * [.2126, .7152, .0722][index], 0);
}
export function contrastRatio(first: string, second: string) {
  const a = luminance(first), b = luminance(second);
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
}
export function personalPalette(theme: Theme, accentColor: string | null = null) {
  const dark = theme === "dark", background = dark ? "#22222e" : "#ffffff";
  let primary = dark ? "#a48bfa" : "#6d51e8";
  if (accentColor && isAccentColor(accentColor)) {
    primary = accentColor.toLowerCase();
    for (let step = 1; contrastRatio(primary, background) < 4.5 && step <= 20; step++)
      primary = mixColor(accentColor, dark ? "#ffffff" : "#000000", 1 - step / 20);
  }
  const soft = accentColor ? mixColor(primary, background, dark ? .2 : .1) : dark ? "#302744" : "#f0ecff";
  const onPrimary = contrastRatio(primary, "#ffffff") >= contrastRatio(primary, "#101018") ? "#ffffff" : "#101018";
  return { primary, soft, onPrimary };
}
export const personalTokenNames = ["--primary", "--primary-soft", "--on-primary"] as const;
