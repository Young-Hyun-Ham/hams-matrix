import { HttpError } from "./auth";
export function paging(url: URL) {
  return pageInput(
    url.searchParams.get("page"),
    url.searchParams.get("pageSize"),
  );
}
export function pageInput(
  pageValue: string | null,
  pageSizeValue: string | null,
) {
  const page = Number(pageValue ?? 1),
    pageSize = Number(pageSizeValue ?? 20);
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    ![10, 20, 50, 100].includes(pageSize)
  )
    throw new HttpError(400, "페이지를 확인해 주세요.");
  return { page, pageSize };
}
export function searchValue(url: URL) {
  return searchPattern(url.searchParams.get("q") ?? "");
}
export function searchPattern(value: string) {
  const q = value.trim();
  if (q.length > 100) throw new HttpError(400, "검색어는 100자 이하입니다.");
  return `%${q.replace(/[\\%_]/g, "\\$&")}%`;
}
export type AdminListQuery = {
  q: string;
  projectId: string;
  page: string | null;
  pageSize: string | null;
};
// HTTP extraction only; services validate these values in their existing order.
export function adminListQuery(url: URL): AdminListQuery {
  return {
    q: url.searchParams.get("q") ?? "",
    projectId: url.searchParams.get("projectId") ?? "",
    page: url.searchParams.get("page"),
    pageSize: url.searchParams.get("pageSize"),
  };
}
export const noStore = { headers: { "Cache-Control": "no-store" } };
