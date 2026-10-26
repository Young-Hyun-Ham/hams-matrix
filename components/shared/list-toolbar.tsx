"use client";
import { Icon } from "@/components/icon";
export function ListToolbar({
  filter,
  query,
  total,
  onFilterChange,
  onQueryChange,
}: {
  filter: string;
  query: string;
  total: number;
  onFilterChange: (value: string) => void;
  onQueryChange: (value: string) => void;
}) {
  return (
    <div className="content-toolbar">
      <div className="filter-tabs" aria-label="상태 필터">
        {["전체", "진행 중", "검토 중", "완료", "예정"].map((s) => (
          <button
            key={s}
            className={filter === s ? "selected" : ""}
            onClick={() => onFilterChange(s)}
          >
            {s}
            {s === "전체" && <span>{total}</span>}
          </button>
        ))}
      </div>
      <label className="table-search">
        <Icon name="search" size={16} />
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="제목, ID, 담당자 검색"
          aria-label="항목 검색"
        />
      </label>
    </div>
  );
}
