import type { LOCALE_TIME, LOCALE_TIME_TYPE } from "../types/types";

export const getSafeUUID = (): string => {
  // 1. 브라우저/Node 환경에서 표준 API가 존재하는지 확인
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  // 2. 구형 브라우저나 비보안(HTTP) 환경을 위한 대체 로직 (RFC4122 준수)
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    return (([1e7] as any) + -1e3 + -4e3 + -8e3 + -1e11).replace(
      /[018]/g,
      (c: any) =>
        (
          c ^
          (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))
        ).toString(16),
    );
  }

  // 3. 최후의 수단 (보안성은 낮으나 오류는 방지함)
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

export const toDateTimestamp = (
  dateValue: string,
  timeValue: string,
  hasTime: boolean,
): number => {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue);
  if (!dateMatch) return 0;

  const [, yearText, monthText, dayText] = dateMatch;
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(timeValue);
  const hours = hasTime && timeMatch ? Number(timeMatch[1]) : 0;
  const minutes = hasTime && timeMatch ? Number(timeMatch[2]) : 0;
  const year = Number(yearText);
  const month = Number(monthText) - 1;
  const day = Number(dayText);
  const date = new Date(year, month, day, hours, minutes, 0, 0);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month ||
    date.getDate() !== day ||
    date.getHours() !== hours ||
    date.getMinutes() !== minutes
  ) {
    return 0;
  }

  return date.getTime();
};

export const toLocaleTimeValue = (
  dateValue: string,
  timeValue: string,
  hasTime: boolean,
  locale: LOCALE_TIME,
): LOCALE_TIME_TYPE => ({
  date: toDateTimestamp(dateValue, timeValue, hasTime),
  locale,
});

/**
 * ISO 형식의 날짜 문자열을 'YYYY-MM-DD HH:MI:SS' 형식으로 변환합니다.
 * @param {string} dateString - 변환할 날짜 문자열 (예: "2025-09-18T07:41:29.425557")
 * @returns {string} 포맷팅된 날짜 문자열 (예: "2025-09-18 07:41:29")
 */

export function formatDateTime(dateString: any) {
  // dateString이 유효하지 않으면 빈 문자열을 반환합니다.
  if (!dateString) {
    return "";
  }

  let date: Date;
  if (typeof dateString === "object") {
    const milliseconds =
      dateString.seconds * 1000 + Math.floor(dateString.nanoseconds / 1000000);
    date = new Date(milliseconds);
  } else {
    date = new Date(dateString);
  }

  // 각 부분(년, 월, 일, 시, 분, 초)을 추출합니다.
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0"); // 월은 0부터 시작하므로 +1
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");

  // 형식에 맞게 문자열을 조합하여 반환합니다.
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * Comparator for objects with hierarchical numeric Indexs (e.g. 1.1, 1.1.1, 2.10)
 * @param a Object A
 * @param b Object B
 * @param key Property key that holds the hierarchical ID (default: "index")
 */

export function compareObjectsByHierarchicalId<T extends Record<string, any>>(
  a: T,
  b: T,
  key: keyof T = "index",
): number {
  const aParts = String(a[key]).split(".").map(Number);
  const bParts = String(b[key]).split(".").map(Number);

  const len = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < len; i++) {
    const diff = (aParts[i] ?? 0) - (bParts[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * @param data: types: Blob, File, URL string
 * @param fileName: (Ex: 'report.pdf')
 */
export const downloadFile = (data: Blob | string, fileName: string) => {
  const url =
    typeof data === "string" ? data : window.URL.createObjectURL(data);

  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", fileName);

  document.body.appendChild(link);
  link.click();

  document.body.removeChild(link);
  if (typeof data !== "string") {
    window.URL.revokeObjectURL(url);
  }
};
