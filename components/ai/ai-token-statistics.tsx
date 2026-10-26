"use client";
import { useEffect, useState } from "react";
import type { TokenStatistics, TokenBucket } from "@/lib/ai/token-types";
import "./ai-token-statistics.css";

const number = (value: number) => value.toLocaleString("ko-KR");
export function AiTokenStatistics() {
  const now = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }),
  );
  const [year, setYear] = useState(now.getFullYear()),
    [month, setMonth] = useState(now.getMonth() + 1);
  const [group, setGroup] = useState("monthly"),
    [project, setProject] = useState("all"),
    [room, setRoom] = useState("");
  const [data, setData] = useState<TokenStatistics | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [version, setVersion] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const from =
    group === "monthly"
      ? `${year}-01-01`
      : `${year}-${String(month).padStart(2, "0")}-01`;
  const to =
    group === "monthly"
      ? `${year}-12-31`
      : new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  const params = new URLSearchParams({
    from,
    to,
    group,
    ...(project !== "all" ? { projectId: project } : {}),
    ...(room ? { convId: room } : {}),
  });
  const query = params.toString();
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/ai/usage?${query}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        if (!controller.signal.aborted) {
          setData(result);
          setError("");
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setError(
            error instanceof Error
              ? error.message
              : "통계를 불러오지 못했습니다.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [query, version]);
  function change(update: () => void) {
    setLoading(true);
    setSelected(null);
    update();
  }
  const years = Array.from(
    new Set([now.getFullYear(), year, ...(data?.years ?? [])]),
  ).sort((a, b) => b - a);
  const bucket = data?.series.find((item) => item.key === selected);
  return (
    <section className="ai-token-statistics" aria-label="AI 토큰 사용 통계">
      <header>
        <div>
          <h3>AI 토큰 사용량</h3>
          <p>내 계정의 프로젝트·채팅방별 실제 사용 내역</p>
        </div>
        <button
          type="button"
          className="button"
          disabled={loading}
          onClick={() => change(() => setVersion((v) => v + 1))}
        >
          새로고침
        </button>
      </header>
      <div className="ai-usage-filters">
        <label>
          연도
          <select
            aria-label="통계 연도"
            value={year}
            onChange={(event) =>
              change(() => setYear(Number(event.target.value)))
            }
          >
            {years.map((value) => (
              <option key={value} value={value}>
                {value}년
              </option>
            ))}
          </select>
        </label>
        {group !== "monthly" && (
          <label>
            월
            <select
              aria-label="통계 월"
              value={month}
              onChange={(event) =>
                change(() => setMonth(Number(event.target.value)))
              }
            >
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {i + 1}월
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          프로젝트
          <select
            aria-label="사용량 프로젝트"
            value={project}
            onChange={(event) =>
              change(() => {
                setProject(event.target.value);
                setRoom("");
              })
            }
          >
            <option value="all">전체 프로젝트</option>
            {data?.projects.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          채팅방
          <select
            aria-label="사용량 채팅방"
            value={room}
            onChange={(event) => change(() => setRoom(event.target.value))}
          >
            <option value="">전체 채팅방</option>
            {data?.conversations
              .filter((item) => project === "all" || item.projectId === project)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.deleted ? "[삭제됨] " : ""}
                  {item.title}
                </option>
              ))}
          </select>
        </label>
      </div>
      <div className="ai-usage-group" role="group" aria-label="통계 단위">
        {[
          ["monthly", "월별"],
          ["weekday", "요일별"],
          ["daily", "일별"],
        ].map(([key, label]) => (
          <button
            type="button"
            key={key}
            aria-pressed={group === key}
            onClick={() => change(() => setGroup(key))}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="ai-usage-period">
        {from} ~ {to} · 한국 시간(KST)
      </p>
      {loading ? (
        <p role="status">토큰 사용량을 불러오는 중입니다.</p>
      ) : error ? (
        <p role="alert" className="error-message">
          {error}
        </p>
      ) : (
        data && (
          <>
            <div className="ai-usage-summary">
              {[
                ["입력 토큰", data.totals.input],
                ["출력 토큰", data.totals.output],
                ["전체 토큰", data.totals.total],
                [
                  "질문 / AI 호출",
                  `${number(data.totals.requests)} / ${number(data.totals.calls)}`,
                ],
              ].map(([label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong>
                    {typeof value === "number" ? number(value) : value}
                  </strong>
                </div>
              ))}
            </div>
            <div className="ai-usage-legend">
              <span>
                <i className="is-input" />
                입력
              </span>
              <span>
                <i className="is-output" />
                출력
              </span>
              <small>단위: tokens</small>
            </div>
            {!data.totals.calls && (
              <p className="ai-usage-empty">
                선택한 기간에 기록된 AI 사용량이 없습니다.
              </p>
            )}
            <UsageChart
              series={data.series}
              selected={selected}
              onSelect={setSelected}
            />
            <p className="ai-usage-selected" aria-live="polite">
              {bucket
                ? `${group === "weekday" ? `${bucket.label}요일` : bucket.key} · 입력 ${number(bucket.input)} / 출력 ${number(bucket.output)} / 합계 ${number(bucket.total)} tokens`
                : "그래프에 마우스를 올리거나 막대를 선택하면 상세 사용량을 볼 수 있습니다."}
            </p>
            <div className="ai-usage-details">
              <span>캐시 입력 {number(data.totals.cached)}</span>
              <span>추론 {number(data.totals.reasoning)}</span>
              <span>사용량 미확인 {number(data.totals.unknown)}건</span>
            </div>
            <details>
              <summary>상세 통계 표</summary>
              <div className="ai-usage-table">
                <table>
                  <caption className="sr-only">기간별 토큰 사용량</caption>
                  <thead>
                    <tr>
                      <th>구분</th>
                      <th>입력</th>
                      <th>출력</th>
                      <th>합계</th>
                      <th>AI 호출</th>
                      <th>미확인</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.series.map((item) => (
                      <tr key={item.key}>
                        <th>
                          {group === "weekday" ? `${item.label}요일` : item.key}
                        </th>
                        <td>{number(item.input)}</td>
                        <td>{number(item.output)}</td>
                        <td>{number(item.total)}</td>
                        <td>{number(item.calls)}</td>
                        <td>{number(item.unknown)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        )
      )}
      <p className="ai-usage-note">
        입력에는 시스템 지침·이전 대화·이미지·도구 데이터가 포함됩니다.
        캐시·추론 토큰은 입력·출력의 세부 항목이며 합계에 중복 추가하지
        않습니다. 미확인 사용량과 기록 기능 도입 전 사용량은 합계에서
        제외됩니다.
      </p>
    </section>
  );
}
function UsageChart({
  series,
  selected,
  onSelect,
}: {
  series: TokenBucket[];
  selected: string | null;
  onSelect: (key: string) => void;
}) {
  const max = Math.max(1, ...series.map((item) => item.total));
  return (
    <div
      className="ai-usage-chart"
      aria-label="입력 및 출력 토큰 사용량 그래프"
    >
      <span className="ai-usage-axis">{number(max)}</span>
      <div className="ai-usage-chart-scroll">
        <div
          className="ai-usage-bars"
          style={{
            gridTemplateColumns: `repeat(${series.length},minmax(30px,1fr))`,
          }}
        >
          {series.map((item) => (
            <button
              type="button"
              key={item.key}
              className={selected === item.key ? "is-selected" : ""}
              aria-label={`${item.label}, 입력 ${item.input}, 출력 ${item.output}, 합계 ${item.total} tokens`}
              title={`${item.key}: ${number(item.total)} tokens`}
              onMouseEnter={() => onSelect(item.key)}
              onFocus={() => onSelect(item.key)}
              onClick={() => onSelect(item.key)}
            >
              <span className="ai-usage-column">
                <i
                  className="is-output"
                  style={{ height: `${(item.output / max) * 100}%` }}
                />
                <i
                  className="is-input"
                  style={{ height: `${(item.input / max) * 100}%` }}
                />
              </span>
              <span className="ai-usage-bar-label">{item.label}</span>
            </button>
          ))}
        </div>
      </div>
      <span className="ai-usage-zero">0</span>
    </div>
  );
}
