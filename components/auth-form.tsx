"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- OAuth starts a full document redirect; these endpoints must not be prefetched by Link. */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Brand, Icon } from "./icon";
import { useWorkspace } from "@/stores/workspace";
const errors: Record<string, string> = {
  oauth_unavailable:
    "소셜 로그인 설정이 준비되지 않았습니다. 이메일로 시작해 주세요.",
  oauth_failed: "소셜 인증을 완료하지 못했습니다. 다시 시도해 주세요.",
  account_exists:
    "같은 이메일로 가입된 계정이 있습니다. 기존 로그인 방법을 사용해 주세요.",
};
export function AuthForm({
  mode,
  errorCode,
}: {
  mode: "login" | "signup";
  errorCode?: string;
}) {
  const signup = mode === "signup",
    router = useRouter(),
    setUser = useWorkspace((s) => s.setUser);
  const [showPassword, setShowPassword] = useState(false),
    [pending, setPending] = useState(false),
    [error, setError] = useState(errors[errorCode ?? ""] ?? "");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);
    const values = new FormData(event.currentTarget);
    if (signup && values.get("password") !== values.get("confirm")) {
      setError("비밀번호가 일치하지 않습니다.");
      setPending(false);
      return;
    }
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: values.get("email"),
          password: values.get("password"),
          name: values.get("name"),
          ...(signup ? { jobTitle: values.get("jobTitle") } : {}),
          accepted: values.get("accepted") === "on",
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setUser(result.user);
      router.replace(
        result.user.onboardingComplete ? "/dashboard" : "/onboarding",
      );
      router.refresh();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "연결을 확인하고 다시 시도해 주세요.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="auth-page">
      <aside className="auth-story">
        <Link href="/" aria-label="HAMS Matrix 홈">
          <Brand />
        </Link>
        <div className="story-content">
          <span className="story-tag">
            <Icon name="spark" size={15} /> YOUR TEAM’S NEXT CHAPTER
          </span>
          <h1>
            흩어진 생각을 연결해,
            <br />더 나은 프로젝트로.
          </h1>
          <p>
            고객의 첫 번째 요구부터 마지막 산출물까지.
            <br />
            프로젝트의 모든 순간을 하나의 매트릭스에서.
          </p>
          <div className="story-illustration" aria-hidden="true">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="floating-card card-requirement">
              <span className="mini-icon purple">
                <Icon name="list" />
              </span>
              <span>
                요구사항 정리<small>아이디어가 명확해지는 순간</small>
              </span>
              <span className="mini-check">✓</span>
            </div>
            <div className="matrix-node">
              <span className="brand-symbol">
                <i />
                <i />
                <i />
                <i />
              </span>
            </div>
            <div className="floating-card card-design">
              <span className="mini-icon blue">
                <Icon name="screen" />
              </span>
              <span>
                화면과 기능 연결<small>같은 방향을 바라보는 팀</small>
              </span>
            </div>
            <div className="floating-card card-team">
              <div className="avatar-stack">
                <b>J</b>
                <b>M</b>
                <b>S</b>
              </div>
              <span>
                함께 만드는 가능성<small>팀의 모든 맥락을 한곳에</small>
              </span>
              <Icon name="spark" />
            </div>
            <span className="illustration-dot dot-a" />
            <span className="illustration-dot dot-b" />
          </div>
          <div className="story-footnote">
            <Icon name="shield" size={17} /> 안전한 데이터, 투명한 변경 이력
          </div>
        </div>
        <div className="auth-copyright">
          © {new Date().getFullYear()} HAMS Matrix. All rights reserved.
        </div>
      </aside>
      <main className="auth-main">
        <div className="auth-top-link">
          {signup ? "이미 함께하고 계신가요?" : "화면을 먼저 둘러보세요"}
          <Link href={signup ? "/login" : "/guest/dashboard"}>
            {signup ? "로그인" : "게스트로 시작하기"}
            <Icon name="arrow" size={16} />
          </Link>
        </div>
        <div className="auth-form-wrap">
          <span className="eyebrow">MAKE WORK CONNECT</span>
          <h2>
            {signup ? "새로운 협업의 시작" : "다시 만나서 반가워요"}
            <span className="greeting-dot">.</span>
          </h2>
          <p className="auth-description">
            {signup
              ? "Free 플랜으로 프로젝트를 시작하세요."
              : "로그인하고, 팀과 함께 다음 가능성을 만들어 보세요."}
          </p>
          <div className="social-buttons">
            <a href="/api/auth/oauth/google" className="social-button google">
              <b>G</b>
              <span>Google로 {signup ? "시작하기" : "계속하기"}</span>
            </a>
            <div className="social-row">
              <a href="/api/auth/oauth/naver" className="social-button naver">
                <b>N</b>네이버
              </a>
              <a href="/api/auth/oauth/kakao" className="social-button kakao">
                <b>●</b>카카오
              </a>
            </div>
          </div>
          <div className="auth-divider">
            <span>또는 이메일로 {signup ? "가입하기" : "로그인"}</span>
          </div>
          <form onSubmit={submit} className="auth-form">
            {error && (
              <div role="alert" className="error-message">
                {error}
              </div>
            )}
            {signup && (
              <label htmlFor="name">
                이름
                <input
                  id="name"
                  name="name"
                  autoComplete="name"
                  placeholder="팀에서 사용할 이름"
                  required
                  minLength={2}
                  maxLength={80}
                />
              </label>
            )}
            {signup && (
              <label htmlFor="jobTitle">
                담당 역할·직무
                <input
                  id="jobTitle"
                  name="jobTitle"
                  maxLength={80}
                  placeholder="예: 프로젝트 매니저, 프론트엔드 개발자"
                />
              </label>
            )}
            <label htmlFor="email">
              이메일 주소
              <div className="auth-input">
                <Icon name="mail" size={18} />
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="name@company.com"
                  required
                  maxLength={254}
                />
              </div>
            </label>
            <label htmlFor="password">
              비밀번호
              <div className="auth-input">
                <Icon name="lock" size={18} />
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={signup ? "new-password" : "current-password"}
                  placeholder={
                    signup
                      ? "영문, 숫자 포함 10자 이상"
                      : "비밀번호를 입력해 주세요"
                  }
                  required
                  minLength={signup ? 10 : 1}
                  maxLength={128}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={
                    showPassword ? "비밀번호 숨기기" : "비밀번호 보기"
                  }
                  aria-pressed={showPassword}
                >
                  <Icon name="eye" size={18} />
                </button>
              </div>
            </label>
            {signup && (
              <>
                <label htmlFor="confirm">
                  비밀번호 확인
                  <input
                    id="confirm"
                    name="confirm"
                    type="password"
                    autoComplete="new-password"
                    placeholder="비밀번호를 한 번 더 입력해 주세요"
                    required
                    minLength={10}
                    maxLength={128}
                  />
                </label>
                <label className="agreement">
                  <input type="checkbox" name="accepted" required />
                  <span>
                    <Link href="/policies" target="_blank">
                      서비스 이용 및 개인정보 처리 안내
                    </Link>
                    를 확인하고 동의합니다. (필수)
                  </span>
                </label>
              </>
            )}
            <button className="button primary auth-submit" disabled={pending}>
              {pending
                ? "잠시만 기다려 주세요…"
                : signup
                  ? "회원가입"
                  : "로그인"}
              <Icon name="arrow" size={17} />
            </button>
          </form>
          {!signup && (
            <Link className="button auth-submit" href="/signup">
              회원등록
            </Link>
          )}
          <p className="auth-trust">
            <Icon name="shield" size={14} />{" "}
            {signup
              ? "결제 정보 없이 시작할 수 있어요."
              : "프로젝트의 모든 연결, HAMS Matrix"}
          </p>
        </div>
        <div className="auth-bottom">
          함께 연결하고, 더 멀리 나아가세요.<span>HAMS MATRIX</span>
        </div>
      </main>
    </div>
  );
}
