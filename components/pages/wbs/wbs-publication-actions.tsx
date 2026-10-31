"use client";
import { useEffect, useRef, useState } from "react";
import type { Artifact, ProjectData } from "@/lib/artifact-types";
import { definitions } from "@/lib/artifact-types";
import { scheduleDay, scheduleDate, scheduleVersions, type WbsPublication } from "@/lib/wbs-schedule";
import { jsonRequest } from "@/lib/client-request";
import { ConfirmationDialog } from "@/components/shared/confirmation-dialog";
import { scheduleRows } from "./use-wbs-schedule";
import { WbsOverview } from "./wbs-overview";
import { useProjectPage } from '@/components/shared/project-page-context';

function PublicationGraph({ artifacts }: { artifacts: Artifact[] }) {
  const dates = artifacts.flatMap((artifact) => [artifact.fields.startDate, artifact.fields.endDate]).filter(Boolean).sort();
  if (!dates.length) return <p>저장된 일정이 없습니다.</p>;
  const start = scheduleDate(scheduleDay(dates[0]) - 1);
  const days = Math.max(30, scheduleDay(dates.at(-1)!) - scheduleDay(start) + 2);
  return <div className="wbs-publication-graph"><WbsOverview tasks={scheduleRows(artifacts)} start={start} days={days} expanded /></div>;
}
function PublicationDialog({ publication, onClose }: { publication: WbsPublication; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  const { artifacts, project } = publication.snapshot;
  const codeFor = (id: string) => artifacts.find((artifact) => artifact.id === id)?.code ?? id;
  return <dialog ref={dialog} className="workspace-dialog admin-detail-dialog wbs-publication-dialog" aria-label="WBS 배포본 보기" onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <div className="dialog-header admin-detail-header"><h2>{project.name} · 배포본 v{publication.sequence}</h2><button type="button" className="button admin-detail-close" onClick={onClose}>닫기</button></div>
    <div className="admin-detail-body">
      <p>배포자: {publication.authorName} · {new Date(publication.createdAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} · 읽기 전용 확정 일정</p>
      <PublicationGraph artifacts={artifacts} />
      <div className="table-scroll"><table><thead><tr><th>관리번호</th><th>작업명</th><th>상태</th>{definitions.wbs.fields.map((field) => <th key={field.key}>{field.label}</th>)}<th>상위 작업</th><th>선행 작업</th><th>연결 산출물 ID</th><th>원본 버전</th></tr></thead>
        <tbody>{scheduleRows(artifacts).map(({ artifact }) => <tr key={artifact.id}><td>{artifact.code}</td><td>{artifact.title}</td><td>{artifact.status}</td>{definitions.wbs.fields.map((field) => <td key={field.key}>{artifact.fields[field.key] || "—"}</td>)}<td>{artifact.structure?.parentId ? codeFor(artifact.structure.parentId) : "—"}</td><td>{artifact.structure?.dependencies?.map(codeFor).join(", ") || "—"}</td><td>{artifact.links.join(", ") || "—"}</td><td>v{artifact.version}</td></tr>)}</tbody></table></div>
    </div>
  </dialog>;
}
export function WbsPublicationActions({ data, dirty, disabled }: { data: ProjectData; dirty: boolean; disabled: boolean }) {
  const context=useProjectPage();
  const canPublish=context.can('wbs','UPDATE')&&['owner','admin'].includes(context.data.projectRole);
  const [info, setInfo] = useState<{ publication: WbsPublication | null; canPublish: boolean } | null>(null);
  const [error, setError] = useState(""), [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<Artifact[] | null>(null), [viewing, setViewing] = useState<WbsPublication | null>(null);
  const [attempt, setAttempt] = useState(0);
  const submitting = useRef(false), mounted = useRef(true);
  const versionsKey = JSON.stringify(scheduleVersions(data.artifacts));
  const endpoint = `/api/projects/${data.project.id}/wbs/publications`;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    const controller = new AbortController();
    void jsonRequest(endpoint, { signal: controller.signal }).then((result) => {
      if (!controller.signal.aborted) { setInfo(result); setError(""); }
    }).catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "배포 정보를 조회하지 못했습니다."); });
    return () => controller.abort();
  }, [endpoint, versionsKey, attempt, canPublish, context.data.permissionVersion, context.data.projectRole]);
  async function publish() {
    if (submitting.current || !confirming || dirty || disabled) return;
    submitting.current = true; setBusy(true); setError("");
    try {
      if(!canPublish||!await context.verifyPermission('wbs','UPDATE')) throw new Error('현재 프로젝트 권한으로 배포할 수 없습니다.');
      const result = await jsonRequest(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ versions: scheduleVersions(confirming) }) });
      if (!mounted.current) return;
      setInfo(result); setConfirming(null); setAttempt((value) => value + 1); setMessage(result.reused ? "동일한 저장본이 이미 배포되어 있습니다." : `배포본 v${result.publication.sequence}을 배포했습니다.`);
    } catch (reason) { if (mounted.current) setError(reason instanceof Error ? reason.message : "배포하지 못했습니다."); }
    finally { submitting.current = false; if (mounted.current) setBusy(false); }
  }
  const publication = info?.publication;
  const current = publication && JSON.stringify(scheduleVersions(publication.snapshot.artifacts)) === versionsKey;
  return <>
    <button type="button" className="button" disabled={disabled || busy || dirty || !canPublish || !info?.canPublish || !data.artifacts.some((artifact) => artifact.kind === "wbs")}
      title={dirty ? "변경사항을 먼저 저장해 주세요." : "프로젝트 owner/admin이 마지막 저장본을 배포합니다."}
      onClick={() => setConfirming(data.artifacts.filter((artifact) => artifact.kind === "wbs"))}>배포</button>
    <button type="button" className="button" disabled={busy || !publication} onClick={() => publication && setViewing(publication)}>배포본 보기{publication ? ` v${publication.sequence}` : ""}</button>
    <span className="wbs-publication-status" role="status">{publication ? current ? "저장본과 배포본 동일" : "배포 이후 저장본 변경됨" : info ? "배포본 없음" : error ? "배포 정보 조회 실패" : "배포 정보 조회 중…"} {message}</span>
    {error && !confirming && <span role="alert" className="matrix-error">{error}<button type="button" className="button" onClick={() => setAttempt((value) => value + 1)}>배포 정보 다시 조회</button></span>}
    {confirming && <ConfirmationDialog title={`${data.project.name} · 확정 일정 배포`} confirmLabel="저장본 배포" busy={busy} confirmDisabled={!canPublish} onClose={() => setConfirming(null)} onConfirm={publish}>
      <p>저장된 전체 WBS {confirming.length}건을 확정 일정으로 배포합니다. 모든 프로젝트 멤버가 배포본을 조회할 수 있으며 이후 작업 수정으로 이 배포본이 변경되지 않습니다.</p>
      <PublicationGraph artifacts={confirming} />
      {error && <p role="alert" className="matrix-error">{error}</p>}
    </ConfirmationDialog>}
    {viewing && <PublicationDialog publication={viewing} onClose={() => setViewing(null)} />}
  </>;
}
