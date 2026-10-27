"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { RegistrationChoiceDialog } from "./registration-choice-dialog";
import type { RegistrationChoice } from "@/lib/registration";
import { useWorkspace } from "@/stores/workspace";

export function OnboardingForm() {
  const router = useRouter();
  const setUser = useWorkspace((state) => state.setUser);
  const [role, setRole] = useState<"owner" | "user" | null>(null);
  const [choice, setChoice] = useState<RegistrationChoice | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [jobTitle, setJobTitle] = useState("");
  async function logout() {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok && response.status !== 401)
        throw new Error("로그아웃하지 못했습니다.");
      setUser(null);
      router.replace("/login");
      router.refresh();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "연결을 확인해 주세요.",
      );
    } finally {
      setPending(false);
    }
  }
  async function complete() {
    if (!choice || pending) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...choice, jobTitle }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setUser(result.user);
      router.replace("/dashboard");
      router.refresh();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "가입을 완료하지 못했습니다.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <main className="onboarding-page">
      <h1>가입 유형 선택</h1>
      <p>
        소셜 인증이 완료되었습니다. 역할과 플랜 또는 팀을 선택해 가입을
        마무리하세요.
      </p>
      <fieldset className="registration-role" disabled={pending}>
        <legend>가입 역할</legend>
        {(["owner", "user"] as const).map((value) => (
          <label key={value}>
            <input
              type="radio"
              name="onboarding-role"
              checked={role === value}
              onChange={() => {
                setRole(value);
                setChoice(null);
                setOpen(true);
              }}
            />
            {value}
          </label>
        ))}
      </fieldset>
      {choice && (
        <p>
          {choice.role === "owner"
            ? choice.plan.toUpperCase()
            : choice.teamId
              ? "팀 가입 신청 · 승인 대기"
              : "Guest · Free"}
          <button
            type="button"
            onClick={() => setOpen(true)}
            disabled={pending}
          >
            선택 변경
          </button>
        </p>
      )}
      <label>담당 역할·직무<input maxLength={80} value={jobTitle} disabled={pending} placeholder="예: 서비스 기획자" onChange={event => setJobTitle(event.target.value)} /></label>
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      <button
        className="button primary"
        disabled={!choice || pending}
        onClick={complete}
      >
        {pending ? "처리 중…" : "가입 완료"}
      </button>
      <button
        type="button"
        className="button"
        disabled={pending}
        onClick={logout}
      >
        로그아웃
      </button>
      {open && role && (
        <RegistrationChoiceDialog
          key={role}
          role={role}
          onClose={() => setOpen(false)}
          onSelect={(value) => {
            setChoice(value);
            setOpen(false);
          }}
        />
      )}
    </main>
  );
}
