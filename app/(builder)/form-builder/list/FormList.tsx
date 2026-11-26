"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  formListPath,
  listForms,
  summarizeElements,
  type SavedForm,
} from "../../services/forms";
import styles from "./FormList.module.css";

const pageSize = 10;
const updated = (value: string) => Date.parse(value) || 0;
const dateFormat = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  dateStyle: "medium",
  timeStyle: "short",
});

function listUrl(title: string, sort: string, page: number) {
  return (
    formListPath +
    "?" +
    new URLSearchParams({ title, sort, page: String(page) })
  );
}

export default function FormList() {
  const params = useSearchParams();
  const router = useRouter();
  const title = params.get("title")?.trim() ?? "";
  const sort = params.get("sort") === "title" ? "title" : "updated";
  const [result, setResult] = useState<{ forms?: SavedForm[]; error?: string }>(
    {},
  );
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    listForms().then(
      (forms) => {
        if (active) setResult({ forms });
      },
      (error: unknown) => {
        if (active)
          setResult({
            error:
              error instanceof Error
                ? error.message
                : "폼을 조회하지 못했습니다.",
          });
      },
    );
    return () => {
      active = false;
    };
  }, [attempt]);

  function reload() {
    setResult({});
    setAttempt((value) => value + 1);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    router.push(
      listUrl(
        String(data.get("title") ?? "").trim(),
        String(data.get("sort")),
        1,
      ),
    );
    reload();
  }

  const rows =
    result.forms
      ?.filter((form) => form.title.toLowerCase().includes(title.toLowerCase()))
      .sort(
        (a, b) =>
          (sort === "title"
            ? a.title.localeCompare(b.title, "ko", { sensitivity: "base" })
            : updated(b.updatedAt) - updated(a.updatedAt)) ||
          a.id.localeCompare(b.id),
      ) ?? [];
  const last = Math.max(1, Math.ceil(rows.length / pageSize));
  const requested = Number(params.get("page") ?? 1);
  const page = Number.isSafeInteger(requested)
    ? Math.min(last, Math.max(1, requested))
    : 1;
  const start = (page - 1) * pageSize;
  const back = "&returnTo=" + encodeURIComponent(listUrl(title, sort, page));
  const editUrl = (id: string) =>
    "/form-builder?formId=" + encodeURIComponent(id) + back;
  const formKey = JSON.stringify([title, sort, attempt]);

  return (
    <section className={styles.list} aria-label="폼 목록">
      <form
        className={styles.searchBar}
        aria-label="폼 검색"
        key={formKey}
        onSubmit={submit}
      >
        <label>
          제목
          <input name="title" defaultValue={title} />
        </label>
        <label>
          정렬
          <select name="sort" defaultValue={sort}>
            <option value="updated">최근 수정순</option>
            <option value="title">제목순</option>
          </select>
        </label>
        <div className={styles.searchActions}>
          <button
            type="button"
            onClick={() => {
              router.push(listUrl("", "updated", 1));
              reload();
            }}
          >
            초기화
          </button>
          <button type="submit">조회</button>
          <Link href={"/form-builder?mode=new" + back}>신규 작성</Link>
        </div>
      </form>
      {result.error ? (
        <div role="alert">
          {result.error} <button onClick={reload}>다시 조회</button>
        </div>
      ) : !result.forms ? (
        <p role="status">폼을 불러오는 중입니다…</p>
      ) : (
        <>
          <p role="status">
            총 {rows.length}건
            {rows.length > 0 && (
              <>
                {" "}
                ({start + 1}–{Math.min(start + pageSize, rows.length)})
              </>
            )}
          </p>
          <div className={styles.tableWrap}>
            <table aria-label="저장된 폼">
              <thead>
                <tr>
                  {[
                    "No",
                    "Content ID",
                    "Content Title",
                    "Element",
                    "Updated",
                    "작업",
                  ].map((label) => (
                    <th key={label} scope="col">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(start, start + pageSize).map((form, index) => (
                  <tr key={form.id}>
                    <td>{start + index + 1}</td>
                    <td title={form.id}>{form.id}</td>
                    <td title={form.title}>
                      <Link href={editUrl(form.id)}>{form.title}</Link>
                    </td>
                    <td>{summarizeElements(form.elements)}</td>
                    <td>
                      {Number.isFinite(Date.parse(form.updatedAt))
                        ? dateFormat.format(new Date(form.updatedAt))
                        : "-"}
                    </td>
                    <td>
                      <Link href={editUrl(form.id)}>편집</Link>
                    </td>
                  </tr>
                ))}
                {!rows.length && (
                  <tr>
                    <td colSpan={6}>
                      {result.forms.length
                        ? "검색 결과가 없습니다."
                        : "저장된 폼이 없습니다."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <nav aria-label="폼 목록 페이지">
            <button
              disabled={page === 1}
              onClick={() => router.push(listUrl(title, sort, 1))}
            >
              처음
            </button>
            <button
              disabled={page === 1}
              onClick={() => router.push(listUrl(title, sort, page - 1))}
            >
              이전
            </button>
            <span>
              {page} / {last}
            </span>
            <button
              disabled={page === last}
              onClick={() => router.push(listUrl(title, sort, page + 1))}
            >
              다음
            </button>
            <button
              disabled={page === last}
              onClick={() => router.push(listUrl(title, sort, last))}
            >
              마지막
            </button>
          </nav>
        </>
      )}
    </section>
  );
}
