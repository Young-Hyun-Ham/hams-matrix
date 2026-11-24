import type { LOCALE_TIME, LOCALE_TIME_TYPE } from "../type";

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
