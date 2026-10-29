"use client";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/stores/workspace";
import { usePreferences } from "@/stores/preferences";
import { toast } from "@/stores/toast";
import type { User } from "@/lib/types";
export function InterfaceSettings({ userId }: { userId: string }) {
  const initialized = usePreferences((s) => s.userId === userId);
  return initialized ? (
    <InterfaceForm />
  ) : (
    <p role="status">개인 설정을 불러오는 중입니다.</p>
  );
}
function InterfaceForm() {
  const { saved, preview, save, busy } = usePreferences();
  const [draft, setDraft] = useState(saved),
    [error, setError] = useState("");
  useEffect(
    () => () => {
      usePreferences.getState().preview(usePreferences.getState().saved);
    },
    [],
  );
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await save(draft);
      setDraft(usePreferences.getState().saved);
      toast("인터페이스 설정을 저장했습니다.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 실패");
    }
  }
  return (
    <form
      className="panel settings-form"
      style={{ padding: 24 }}
      onSubmit={submit}
    >
      <fieldset disabled={busy}>
        <legend>인터페이스 관리</legend>
        <label>
          토스트 위치
          <select
            value={draft.toastPosition}
            onChange={(e) => {
              const p = {
                ...draft,
                toastPosition: e.target.value as "top" | "bottom",
              };
              setDraft(p);
              preview(p);
            }}
          >
            <option value="top">상단</option>
            <option value="bottom">하단</option>
          </select>
        </label>
        <label>
          기본 테마
          <select
            value={draft.defaultTheme}
            onChange={(e) => {
              const p = {
                ...draft,
                defaultTheme: e.target.value as "light" | "dark",
              };
              setDraft(p);
              preview(p);
            }}
          >
            <option value="light">라이트</option>
            <option value="dark">다크</option>
          </select>
        </label>
        <label className="toast-color-setting">
          토스트 바탕화면 색
          <input
            type="color"
            value={draft.toastBackgroundColor}
            onChange={(e) => {
              const p = { ...draft, toastBackgroundColor: e.target.value };
              setDraft(p);
              preview(p);
            }}
          />
          <span>{draft.toastBackgroundColor}</span>
        </label>
        <label className="toast-color-setting">
          토스트 폰트 색상
          <input
            type="color"
            value={draft.toastFontColor}
            onChange={(e) => {
              const p = { ...draft, toastFontColor: e.target.value };
              setDraft(p);
              preview(p);
            }}
          />
          <span>{draft.toastFontColor}</span>
        </label>
        <button
          type="button"
          className="button"
          onClick={() => toast("토스트 미리보기")}
        >
          미리보기
        </button>
        <button className="button primary">저장</button>
        <button
          type="button"
          className="button"
          onClick={() => {
            setDraft(saved);
            preview(saved);
            setError("");
          }}
        >
          취소
        </button>
      </fieldset>
      {error && (
        <p role="alert">
          {error}{" "}
          <button type="button" onClick={() => location.reload()}>
            최신 설정 불러오기
          </button>
        </p>
      )}
    </form>
  );
}
export function AccountSettings({ user }: { user: User }) {
  const setUser = useWorkspace((s) => s.setUser),
    router = useRouter();
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const name = new FormData(e.currentTarget).get("name");
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setUser(data.user);
      router.refresh();
      toast("이름을 저장했습니다.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="panel settings-form"
      style={{ padding: 24 }}
      onSubmit={submit}
    >
      <h2>계정 설정</h2>
      <label>
        이름
        <input
          key={user.name}
          name="name"
          defaultValue={user.name}
          minLength={2}
          maxLength={80}
          required
          readOnly={user.accountRole === "master"}
        />
      </label>
      <p>이메일: {user.email ?? "이메일 없는 소셜 계정"}</p>
      <p>
        워크스페이스: {user.workspaceName} · 역할 {user.role}
      </p>
      <p>
        계정 역할: {user.accountRole} · 플랜: {user.plan}
      </p>
      {error && <p role="alert">{error}</p>}
      <button
        className="button primary"
        disabled={busy || user.accountRole === "master"}
      >
        저장
      </button>
    </form>
  );
}
