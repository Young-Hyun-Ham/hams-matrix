"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/stores/workspace";
import { toast } from "@/stores/toast";
import type { User } from "@/lib/types";
export { InterfaceSettings } from "./interface-settings";
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
