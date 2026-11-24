const labels: Record<string, string> = {
  Save: "저장",
  Close: "닫기",
  Cancel: "취소",
  Delete: "삭제",
  Search: "검색",
  Name: "이름",
  Description: "설명",
  "New Job": "새 시나리오",
  Publish: "버전 생성",
  Back: "목록",
  Deploy: "배포 버전 지정",
  "Flow edit": "편집",
  "Saved Form Content": "저장한 폼",
  "Content Title": "제목",
  "No data": "자료가 없습니다.",
  "Please enter a scenario name.": "시나리오 이름을 입력해 주세요.",
};
function t(key: string, options?: Record<string, unknown>) {
  let out = labels[key] ?? key;
  if (options?.count !== undefined)
    out =
      labels[`${key}_${Number(options.count) === 1 ? "one" : "other"}`] ?? out;
  return out.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, name) =>
    String(options?.[name] ?? ""),
  );
}
export function useTranslation() {
  return { t };
}
