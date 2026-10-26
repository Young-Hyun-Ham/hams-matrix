"use client";
import { useProjectPage } from "@/components/shared/project-page-context";
import { definitions } from "@/lib/artifact-types";
export function HistoryPage() {
  const { data } = useProjectPage();
  return (
    <section className="panel matrix-section">
      <h2>프로젝트 변경 이력</h2>
      <p>최근 100건 · 한국 시간 · 삭제된 항목의 이력도 보존됩니다.</p>
      {!data.revisions.length && <p>변경 이력이 없습니다.</p>}
      {data.revisions.map((r) => (
        <details key={r.id}>
          <summary>
            {new Date(r.occurredAt).toLocaleString("ko-KR", {
              timeZone: "Asia/Seoul",
            })}{" "}
            · {r.actorName} · {r.snapshot.code} · v{r.version} ·{" "}
            {
              (
                {
                  CREATE: "등록",
                  UPDATE: "수정",
                  DELETE: "삭제",
                } as Record<string, string>
              )[r.action]
            }
          </summary>
          <p>
            {r.snapshot.title} · {r.snapshot.status}
          </p>
          <dl>
            {definitions[r.snapshot.kind].fields.map((f) => (
              <div key={f.key}>
                <dt>{f.label}</dt>
                <dd>{r.snapshot.fields[f.key] || "—"}</dd>
              </div>
            ))}
            <div>
              <dt>당시 연결 내부 ID</dt>
              <dd>{r.snapshot.links.join(", ") || "없음"}</dd>
            </div>
            <div>
              <dt>구조·일정·컬럼·검증 버전 스냅샷</dt>
              <dd>
                <pre>{JSON.stringify(r.snapshot.structure ?? {}, null, 2)}</pre>
              </dd>
            </div>
          </dl>
        </details>
      ))}
    </section>
  );
}
