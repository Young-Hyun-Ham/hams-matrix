import type { LayerStyle } from "../components/types";
export type EmojiPreset = {
  id: string;
  label: string;
  text: string;
  style: LayerStyle;
  size: number;
};
const emoji = (items: [string, string][]): EmojiPreset[] =>
  items.map(([text, label], index) => ({
    id: `${text}-${index}`,
    text,
    label,
    size: 40,
    style: {
      fontSize: 28,
      lineHeight: 1,
      textAlign: "center",
      verticalAlign: "middle",
      backgroundColor: "transparent",
      borderWidth: 0,
    },
  }));
export const emojiCategories = [
  {
    id: "numbers",
    label: "번호",
    items: Array.from(
      { length: 30 },
      (_, i): EmojiPreset => ({
        id: `number-${i + 1}`,
        label: `번호 ${i + 1}`,
        text: String(i + 1),
        size: 32,
        style: {
          backgroundColor: "#dc2626",
          color: "#ffffff",
          fontSize: 16,
          fontWeight: 700,
          lineHeight: 1,
          borderRadius: 16,
          borderWidth: 0,
          textAlign: "center",
          verticalAlign: "middle",
        },
      }),
    ),
  },
  {
    id: "faces",
    label: "표정",
    items: emoji([
      ["😀", "웃는 얼굴"],
      ["🙂", "미소"],
      ["😅", "머쓱한 웃음"],
      ["😢", "슬픔"],
      ["😡", "화남"],
    ]),
  },
  {
    id: "hands",
    label: "손동작",
    items: emoji([
      ["👍", "좋아요"],
      ["👎", "싫어요"],
      ["👏", "박수"],
      ["🙏", "부탁"],
    ]),
  },
  {
    id: "symbols",
    label: "기호",
    items: emoji([
      ["✅", "완료"],
      ["❌", "취소"],
      ["⚠️", "주의"],
      ["⭐", "별"],
      ["❤️", "하트"],
    ]),
  },
  {
    id: "work",
    label: "업무",
    items: emoji([
      ["📌", "핀"],
      ["📝", "작성"],
      ["📅", "일정"],
      ["💡", "아이디어"],
      ["🔍", "검색"],
    ]),
  },
];
