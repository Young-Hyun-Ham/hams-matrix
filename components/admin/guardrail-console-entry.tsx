"use client";
import { useState } from "react";
import {
  ConsoleWindowButton,
  useConsolePermission,
} from "@/components/shared/console-access";

export function GuardrailConsoleEntry({
  workspaceId,
  superMode = false,
  inWindow = false,
  approvalId = "",
  view = "",
}: {
  workspaceId: string;
  superMode?: boolean;
  inWindow?: boolean;
  approvalId?: string;
  view?: string;
}) {
  const [projectId, setProjectId] = useState("");
  const base =
    "/api/" + (superMode ? "super-admin" : "admin") + "/ai-console-access";
  const candidatesUrl = base + "?" + new URLSearchParams({ workspaceId });
  const candidates = useConsolePermission(candidatesUrl, workspaceId);
  const projects = !candidates.isError ? (candidates.data?.projects ?? []) : [];
  const selected = projects.some((p) => p.id === projectId) ? projectId : "";
  const query = new URLSearchParams({
    workspaceId,
    entryProjectId: selected,
    ...(approvalId ? { approvalId } : {}),
    ...(view ? { view } : {}),
  });
  const href =
    "/" +
    (superMode ? "super-admin" : "admin") +
    "/guardrail-control-tower?" +
    query;
  const picker = (
    <label>
      새창 진입 확인 프로젝트
      <select
        aria-label="새창 진입 확인 프로젝트"
        name="entryProjectId"
        value={selected}
        disabled={candidates.isFetching}
        onChange={(e) => setProjectId(e.target.value)}
      >
        <option value="">프로젝트 선택</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </label>
  );
  if (inWindow)
    return (
      <section className="guardrail-console-entry">
        <h2>진입 확인 프로젝트 선택</h2>
        <p>기존 관리자 권한과 대상 프로젝트의 owner 권한이 모두 필요합니다.</p>
        <form method="get">
          <input type="hidden" name="workspaceId" value={workspaceId} />
          {approvalId && (
            <input type="hidden" name="approvalId" value={approvalId} />
          )}
          {view && <input type="hidden" name="view" value={view} />}
          {picker}
          <button
            className="button"
            disabled={!selected || candidates.isFetching || candidates.isError}
          >
            관제 화면 열기
          </button>
        </form>
        {!projects.length && (
          <p role="status">
            {candidates.isFetching
              ? "프로젝트 확인 중"
              : "현재 workspace에서 소유하고 배정된 프로젝트가 없습니다."}
          </p>
        )}
        {candidates.isError && (
          <button className="button" onClick={() => void candidates.refetch()}>
            프로젝트 다시 확인
          </button>
        )}
      </section>
    );
  return (
    <div className="guardrail-console-entry">
      {picker}
      {selected ? (
        <ConsoleWindowButton
          key={selected}
          workspaceId={workspaceId}
          projectId={selected}
          accessUrl={base + "?" + query}
          href={href}
          label="컨트롤타워 이동 ↗"
        />
      ) : (
        <>
          <button type="button" className="button" disabled>
            컨트롤타워 이동 ↗
          </button>
          <small role="status">
            {candidates.isFetching
              ? "owner 프로젝트 확인 중"
              : "프로젝트 owner만 새창을 열 수 있습니다. 진입 확인 프로젝트를 선택해 주세요."}
          </small>
        </>
      )}
      {candidates.isError && (
        <button
          type="button"
          className="button"
          onClick={() => void candidates.refetch()}
        >
          프로젝트 다시 확인
        </button>
      )}
    </div>
  );
}
