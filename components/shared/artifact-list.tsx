"use client";
import { useState, type ReactNode } from "react";
import {
  definitions,
  statuses,
  type Artifact,
  type ArtifactKind,
} from "@/lib/artifact-types";
import { useProjectPage } from "./project-page-context";
export function ArtifactList({
  kind,
  renderActions,
}: {
  kind: ArtifactKind;
  renderActions?: (artifact: Artifact) => ReactNode;
}) {
  const { can, artifacts, openCreate, openEdit, openDelete } =
    useProjectPage();
  const [query, setQuery] = useState(""),
    [status, setStatus] = useState("");
  const linkedText = (ids: string[]) =>
    ids
      .map((id) => artifacts.find((a) => a.id === id)?.code)
      .filter(Boolean)
      .join(", ") || "—";
  const filtered = artifacts.filter(
    (a) =>
      a.kind === kind &&
      (!status || a.status === status) &&
      `${a.code} ${a.title} ${Object.values(a.fields).join(" ")}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <section className="panel matrix-section">
      <div className="matrix-toolbar">
        <h2>
          {definitions[kind].document} <small>{filtered.length}건</small>
        </h2>
        {can(kind,'CREATE') && (
          <button className="button primary" onClick={() => openCreate(kind)}>
            {definitions[kind].label} 등록
          </button>
        )}
      </div>
      <div className="matrix-toolbar">
        <input
          aria-label="관리번호, 명칭, 내용 검색"
          placeholder="관리번호, 명칭, 내용 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          aria-label="상태 필터"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">전체 상태</option>
          {statuses.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>관리번호</th>
              <th>명칭</th>
              <th>상태</th>
              <th>담당자</th>
              <th>연결 문서</th>
              <th>버전</th>
              <th>최근 수정</th>
              <th>작업</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((a) => (
              <tr key={a.id}>
                <td>{a.code}</td>
                <td>
                  <button className="text-button" onClick={() => openEdit(a)}>
                    {a.title}
                  </button>
                </td>
                <td>{a.status}</td>
                <td>{a.fields.owner || "—"}</td>
                <td>{linkedText(a.links)}</td>
                <td>v{a.version}</td>
                <td>
                  {new Date(a.updatedAt).toLocaleString("ko-KR", {
                    timeZone: "Asia/Seoul",
                  })}
                </td>
                <td>
                  {can(kind,'UPDATE') || can(kind,'DELETE') ? (
                    <>
                      <button className="button" onClick={() => openEdit(a)}>
                        {can(kind,'UPDATE') ? '수정' : '상세'}
                      </button>{" "}
                      {renderActions?.(a)}
                      {can(kind,'DELETE') && <button className="button" onClick={() => openDelete(a)}>
                        삭제
                      </button>}
                    </>
                  ) : (
                    <button className="button" onClick={() => openEdit(a)}>
                      상세
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!filtered.length && (
        <p className="matrix-empty">
          등록된 항목이 없거나 검색 조건에 맞는 항목이 없습니다.
        </p>
      )}
    </section>
  );
}
