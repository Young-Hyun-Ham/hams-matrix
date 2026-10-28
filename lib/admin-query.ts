import { HttpError } from './auth';
export function paging(url: URL) {
 const page = Number(url.searchParams.get('page') ?? 1), pageSize = Number(url.searchParams.get('pageSize') ?? 20);
 if (!Number.isSafeInteger(page) || page < 1 || ![10,20,50,100].includes(pageSize)) throw new HttpError(400,'페이지를 확인해 주세요.');
 return {page,pageSize};
}
export function searchValue(url: URL) {
 const q = url.searchParams.get('q')?.trim() ?? '';
 if (q.length > 100) throw new HttpError(400,'검색어는 100자 이하입니다.');
 return `%${q.replace(/[\\%_]/g, '\\$&')}%`;
}
export const noStore = {headers:{'Cache-Control':'no-store'}};
