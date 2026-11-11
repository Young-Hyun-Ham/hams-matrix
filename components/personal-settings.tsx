"use client";
import { useWorkspaceErrorState } from "@/components/query/use-workspace-error-state";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/stores/workspace";
import { toast } from "@/stores/toast";
import type { User } from "@/lib/types";
import { useQueryClient } from "@tanstack/react-query";
import { useWorkspaceMutation as useMutation } from "@/components/query/use-workspace-mutation";
import { requestJson } from "@/lib/query/browser-fetch";
import { matrixKeys } from "@/lib/query/keys";

import { useWorkspaceQueryPolicy } from "@/components/query/workspace-query-runtime";
export { InterfaceSettings } from "./interface-settings";
export function AccountSettings({ user }: { user: User }) {
  const { scope } = useWorkspaceQueryPolicy({
    userId: user.id,
    workspaceId: user.workspaceId,
  });
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: (name: FormDataEntryValue | null) =>
      requestJson<{ user: User }>("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      }),
    retry: false,
  });
  const setUser = useWorkspace((s) => s.setUser),
    router = useRouter();
  const [error, setError] = useWorkspaceErrorState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const name = new FormData(e.currentTarget).get("name");
    setBusy(true);
    setError("");
    try {
      const data = await mutation.mutateAsync(name);
      client.setQueryData(matrixKeys.me(scope), data);
      setUser(data.user);
      router.refresh();
      toast("이름을 저장했습니다.");
    } catch (e) {
      setError(e);
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
