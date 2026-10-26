export function MemberAvatars({ values }: { values: string[] }) {
  return (
    <div className="member-stack">
      {values.map((v, i) => (
        <span key={i}>{v}</span>
      ))}
    </div>
  );
}
