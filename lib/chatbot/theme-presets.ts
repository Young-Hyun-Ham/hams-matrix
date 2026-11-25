export const chatbotThemes = {
  orange: ["#f77712", "#f7f9fb", "#ffffff", "#16385f"],
  blue: ["#2468e8", "#eff6ff", "#ffffff", "#153052"],
  green: ["#059669", "#f0faf6", "#ffffff", "#154536"],
  navy: ["#24354b", "#edf1f6", "#ffffff", "#203047"],
  sand: ["#786851", "#f8f5ee", "#fffef9", "#413d33"],
  slate: ["#52657d", "#182431", "#243446", "#f0f5ff"],
  forest: ["#357366", "#172d29", "#203d35", "#edf9f1"],
  charcoal: ["#55616e", "#20262e", "#303944", "#f4f6fa"],
} as const;
export const defaultSettings = {
  themePreset: "orange",
  language: "ko" as const,
  truncateLongResponses: false,
  inputPlaceholder: "메시지를 입력하세요",
  version: 0,
};
