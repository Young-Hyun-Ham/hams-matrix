"use client";
import { useWorkspaceErrorState } from "@/components/query/use-workspace-error-state";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RegistrationChoiceDialog } from "./registration-choice-dialog";
import type { RegistrationChoice } from "@/lib/registration";
import { useWorkspace } from "@/stores/workspace";

import { useQueryClient } from "@tanstack/react-query";
import { useWorkspaceMutation as useMutation } from "@/components/query/use-workspace-mutation";
import { requestJson } from "@/lib/query/browser-fetch";
import { RequestError } from "@/lib/query/error-messages";
import type { User } from "@/lib/types";
export function OnboardingForm() {
  const client = useQueryClient();
  const command = useMutation({
    mutationFn: (data: object) =>
      requestJson<{ user: User }>("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    retry: false,
  });
  const logoutCommand = useMutation({
    mutationFn: async () => {
      try {
        await requestJson("/api/auth/logout", { method: "POST" });
      } catch (error) {
        if (!(error instanceof RequestError && error.status === 401))
          throw error;
      }
    },
    retry: false,
  });
  const router = useRouter();
  const setUser = useWorkspace((state) => state.setUser);
  const [role, setRole] = useState<"owner" | "user" | null>(null);
  const [choice, setChoice] = useState<RegistrationChoice | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useWorkspaceErrorState("");
  const [pending, setPending] = useState(false);
  const [jobTitle, setJobTitle] = useState("");
  async function logout() {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      await logoutCommand.mutateAsync();
      await client.cancelQueries();
      client.clear();
      setUser(null);
      router.replace("/login");
      router.refresh();
    } catch (error) {
      setError(error);
    } finally {
      setPending(false);
    }
  }
  async function complete() {
    if (!choice || pending) return;
    setPending(true);
    setError("");
    try {
      const result = await command.mutateAsync({ ...choice, jobTitle });
      await client.cancelQueries();
      client.clear();
      setUser(result.user);
      router.replace("/dashboard");
      router.refresh();
    } catch (error) {
      setError(error);
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
      <label>
        담당 역할·직무
        <input
          maxLength={80}
          value={jobTitle}
          disabled={pending}
          placeholder="예: 서비스 기획자"
          onChange={(event) => setJobTitle(event.target.value)}
        />
      </label>
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
