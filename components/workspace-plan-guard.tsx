"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { User } from "@/lib/types";

import { useWorkspaces } from "@/components/query/use-workspaces";
type Mismatch = {
  observedAt?: number;
  workspaceId: string;
  workspacePlan: string;
  currentPlan: string;
  workspaceProductId?: string | null;
  currentProductId?: string | null;
};
const planNames: Record<string, string> = {
  free: "Free",
  pro: "Pro",
  team: "Team",
  business: "Business",
};

// Used by the shell and standalone editors. The server still enforces every
// policy; observing fetch only turns its structured rejection into shared UI.
export function WorkspacePlanGuard({
  user,
  children,
}: {
  user: User;
  children?: ReactNode;
}) {
  const workspaceQuery = useWorkspaces({
    userId: user.id,
    workspaceId: user.workspaceId,
  });
  const pathname = usePathname();
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [failure, setFailure] = useState<Mismatch | null>(null);
  const source = `${user.workspaceId}:${user.plan}:${user.workspacePlan}:${user.productId}:${user.workspaceProductId}`;

  const account = workspaceQuery.data?.user ?? user;
  const fromAccount =
    account.workspacePlan &&
    (account.plan !== account.workspacePlan ||
      account.productId !== account.workspaceProductId)
      ? {
          workspaceId: account.workspaceId,
          workspacePlan: account.workspacePlan,
          currentPlan: account.plan,
          workspaceProductId: account.workspaceProductId,
          currentProductId: account.productId,
        }
      : null;
  const mismatch =
    fromAccount ??
    (failure?.workspaceId === user.workspaceId &&
    (failure.observedAt ?? 0) > workspaceQuery.dataUpdatedAt
      ? failure
      : null);
  const recovery =
    pathname === "/settings/subscription" ||
    (pathname.startsWith("/super-admin/") &&
      account.accountRole === "master") ||
    (pathname === "/admin/settings" &&
      ["biz_admin", "team_admin"].includes(account.accountRole) &&
      Boolean(account.productId)) ||
    pathname === "/settings";
  const blocked = Boolean(mismatch) && !recovery;

  useEffect(() => {
    const originalFetch = window.fetch;
    const controller = new AbortController();
    const observedFetch: typeof fetch = async (...args) => {
      const response = await originalFetch(...args);
      if (
        response.status === 409 &&
        response.headers.get("X-Workspace-Plan-Mismatch") === "1"
      ) {
        try {
          const detail = await response.clone().json();
          if (
            !controller.signal.aborted &&
            detail.code === "WORKSPACE_PLAN_MISMATCH" &&
            detail.workspaceId === user.workspaceId
          )
            setFailure({ ...detail, observedAt: Date.now() });
        } catch {
          /* The original response remains available to the caller. */
        }
      }
      return response;
    };
    window.fetch = observedFetch;
    return () => {
      controller.abort();
      if (window.fetch === observedFetch) window.fetch = originalFetch;
    };
  }, [source, user.workspaceId]);

  useEffect(() => {
    if (blocked) dialog.current?.showModal();
    else dialog.current?.close();
  }, [blocked]);

  return (
    <>
      {(!mismatch || recovery) && children}
      <dialog
        ref={dialog}
        className="workspace-dialog"
        aria-labelledby="workspace-plan-title"
        closedby="none"
        onKeyDown={(event) => {
          if (event.key === "Escape") event.preventDefault();
        }}
        onCancel={(event) => event.preventDefault()}
      >
        <div style={{ padding: 24, maxWidth: 480 }}>
          <h2 id="workspace-plan-title">워크스페이스 플랜을 확인해 주세요</h2>
          <p>
            {user.workspaceName}의 플랜은{" "}
            {user.workspaceProductName ??
              planNames[mismatch?.workspacePlan ?? ""] ??
              mismatch?.workspacePlan}
            입니다.
          </p>
          <p>
            현재 계정 요금제는{" "}
            {user.productName ??
              planNames[mismatch?.currentPlan ?? ""] ??
              mismatch?.currentPlan}
            입니다. 워크스페이스 플랜에 맞게 요금제를 변경해야 이용할 수
            있습니다.
          </p>
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              marginTop: 20,
            }}
          >
            <button
              type="button"
              className="button primary"
              onClick={() => {
                dialog.current?.close();
                router.push("/settings/subscription?reason=workspace-plan");
              }}
            >
              요금제 변경하러 가기
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
