"use client";
import { useEffect, useRef, useState } from "react";
import type { RegistrationChoice } from "@/lib/registration";
import "./registration.css";

export function RegistrationChoiceDialog({
  role,
  onClose,
  onSelect,
}: {
  role: "owner" | "user";
  onClose: () => void;
  onSelect: (choice: RegistrationChoice) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [plan, setPlan] = useState<"team" | "business" | null>(null);
  const [kind, setKind] = useState<"guest" | "team" | null>(null);
  const [teamId, setTeamId] = useState("");
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  useEffect(() => {
    if (role !== "user" || kind !== "team") return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(
          `/api/signup/teams?q=${encodeURIComponent(query)}`,
          { cache: "no-store", signal: controller.signal },
        );
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setTeams(data.teams);
      } catch (error) {
        if (!controller.signal.aborted)
          setError(
            error instanceof Error
              ? error.message
              : "팀을 조회하지 못했습니다.",
          );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [role, kind, query, attempt]);
  const valid =
    role === "owner"
      ? !!plan
      : kind === "guest" || (kind === "team" && !!teamId && !loading && !error);
  return (
    <dialog
      ref={dialog}
      className="registration-dialog"
      aria-labelledby="registration-choice-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="registration-dialog-header">
        <div>
          <h2 id="registration-choice-title">
            {role === "owner" ? "팀 플랜 선택" : "Guest 또는 팀 선택"}
          </h2>
          <p>
            {role === "owner"
              ? "Team 또는 Business를 선택하면 가입할 수 있습니다."
              : "Guest로 시작하거나 함께할 팀에 가입을 신청하세요."}
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="닫기">
          ×
        </button>
      </div>
      {role === "owner" ? (
        <>
          <p className="registration-note">
            현재는 테스트 기간으로 플랜 선택만 진행하며 요금은 청구되지
            않습니다.
          </p>
          <div
            className="registration-plan-grid"
            role="radiogroup"
            aria-label="플랜 선택"
          >
            {[
              {
                id: "team" as const,
                title: "Team",
                price: "99,000원",
                subtitle: "소규모 개발팀",
                features: [
                  "5명 사용 기준",
                  "월 500개 화면 생성",
                  "공유·협업·버전 관리",
                ],
              },
              {
                id: "business" as const,
                title: "Business",
                price: "별도 견적",
                subtitle: "SI·기업 고객",
                features: [
                  "조직별 사용량 협의",
                  "표준 템플릿 적용",
                  "보안·관리 기능",
                ],
              },
            ].map((item) => (
              <label
                key={item.id}
                className={`registration-plan ${plan === item.id ? "selected" : ""}`}
              >
                <input
                  type="radio"
                  name="registration-plan"
                  checked={plan === item.id}
                  onChange={() => setPlan(item.id)}
                />
                <strong>{item.title}</strong>
                <b>{item.price}</b>
                <span>{item.subtitle}</span>
                <ul>
                  {item.features.map((feature) => (
                    <li key={feature}>✓ {feature}</li>
                  ))}
                </ul>
              </label>
            ))}
          </div>
          <p className="registration-note">
            표시된 가격과 사용량은 제안 기준입니다. 결제와 사용량 제한은 추후
            적용됩니다.
          </p>
        </>
      ) : (
        <>
          <div
            className="registration-kind"
            role="radiogroup"
            aria-label="user 가입 유형"
          >
            <label>
              <input
                type="radio"
                name="registration-kind"
                checked={kind === "guest"}
                onChange={() => {
                  setKind("guest");
                  setTeamId("");
                }}
              />
              <span>
                <strong>Guest · Free</strong>
                <small>0원 · 팀 없이 서비스 체험 · 조회 전용</small>
              </span>
            </label>
            <label>
              <input
                type="radio"
                name="registration-kind"
                checked={kind === "team"}
                onChange={() => setKind("team")}
              />
              <span>
                <strong>팀 가입 신청</strong>
                <small>owner 승인 후 팀 프로젝트 조회 가능</small>
              </span>
            </label>
          </div>
          {kind === "team" && (
            <div className="registration-team-picker">
              <label htmlFor="registration-team-search">
                팀 이름 검색
                <input
                  id="registration-team-search"
                  type="search"
                  placeholder="가입할 팀 이름"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setTeamId("");
                  }}
                />
              </label>
              <p className="registration-note">
                최대 30개 팀을 표시합니다. 찾는 팀이 없으면 이름으로 검색하세요.
              </p>
              {loading ? (
                <p role="status">팀을 조회하는 중입니다.</p>
              ) : error ? (
                <div role="alert">
                  {error}
                  <button
                    type="button"
                    onClick={() => setAttempt((value) => value + 1)}
                  >
                    다시 조회
                  </button>
                </div>
              ) : (
                <div className="registration-team-options">
                  {teams.length ? (
                    teams.map((team) => (
                      <label key={team.id}>
                        <input
                          type="radio"
                          name="registration-team"
                          checked={teamId === team.id}
                          onChange={() => setTeamId(team.id)}
                        />
                        {team.name}
                      </label>
                    ))
                  ) : (
                    <p>가입 가능한 팀이 없습니다.</p>
                  )}
                </div>
              )}
            </div>
          )}
          <p className="registration-note">
            user 계정은 조회만 가능합니다. 팀 가입 신청 중에는 팀 데이터에
            접근할 수 없습니다.
          </p>
        </>
      )}
      <div className="registration-dialog-actions">
        <button type="button" className="button" onClick={onClose}>
          취소
        </button>
        <button
          type="button"
          className="button primary"
          disabled={!valid}
          onClick={() => {
            if (valid)
              onSelect(
                role === "owner"
                  ? { role, plan: plan!, teamId: null }
                  : {
                      role,
                      plan: "free",
                      teamId: kind === "team" ? teamId : null,
                    },
              );
          }}
        >
          선택 완료
        </button>
      </div>
    </dialog>
  );
}
