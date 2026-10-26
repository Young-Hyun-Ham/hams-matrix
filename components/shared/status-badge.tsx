const statusColor: Record<string, string> = {
  "진행 중": "purple",
  "검토 중": "orange",
  완료: "green",
  예정: "gray",
  "기획 중": "blue",
};
export function StatusBadge({ value }: { value: string }) {
  return (
    <span className={`badge ${statusColor[value] ?? "gray"}`}>
      <i className="status-dot" />
      {value}
    </span>
  );
}
