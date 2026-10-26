"use client";
import { projects } from "@/lib/sample-data";
import { Icon } from "@/components/icon";
export function ProjectFilter({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="project-filter">
      <Icon name="folder" size={16} />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="프로젝트 선택"
      >
        <option>전체 프로젝트</option>
        {projects.map((p) => (
          <option key={p.id}>{p.name}</option>
        ))}
      </select>
    </label>
  );
}
