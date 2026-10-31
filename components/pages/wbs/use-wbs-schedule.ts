"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Artifact, ProjectData } from "@/lib/artifact-types";
import { definitions } from "@/lib/artifact-types";
import { aggregateSchedule, koreaToday, scheduleContent } from "@/lib/wbs-schedule";
import { jsonRequest } from "@/lib/client-request";
import { useProjectPage } from "@/components/shared/project-page-context";

export type ScheduleRow = { id: string; wbs: string; title: string; assignee: string; startDate: string; endDate: string; progress: number; status: string; parentId: string | null; expanded: boolean; artifact: Artifact };
export function scheduleRows(artifacts: Artifact[], expanded: Record<string, boolean> = {}): ScheduleRow[] {
  const result: ScheduleRow[] = [], seen = new Set<string>();
  function walk(parent: string) {
    for (const artifact of artifacts.filter((artifact) => (artifact.structure?.parentId ?? "") === parent)) {
      if (seen.has(artifact.id)) continue;
      seen.add(artifact.id);
      result.push({ id: artifact.id, wbs: artifact.code || "미저장", title: artifact.title, assignee: artifact.fields.owner ?? "", startDate: artifact.fields.startDate, endDate: artifact.fields.endDate,
        progress: Number(artifact.fields.progress), status: artifact.status, parentId: artifact.structure?.parentId || null, expanded: expanded[artifact.id] ?? true, artifact });
      walk(artifact.id);
    }
  }
  walk("");
  return result;
}
export function useWbsSchedule() {
  const context = useProjectPage();
  const [baseline, setBaseline] = useState(context.data);
  const [draft, setDraft] = useState(() => context.artifacts.filter((artifact) => artifact.kind === "wbs"));
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const [editing, setEditing] = useState<Artifact | null>(null);
  const [confirmReload, setConfirmReload] = useState(false);
  const mounted = useRef(true), submitting = useRef(false);
  const retry = useRef<{ content: string; requestId: string } | null>(null);
  const originals = useMemo(() => new Map(baseline.artifacts.filter((artifact) => artifact.kind === "wbs").map((artifact) => [artifact.id, artifact])), [baseline]);
  const normalized = useMemo(() => aggregateSchedule(draft), [draft]);
  const changes = normalized.filter((artifact) => !originals.has(artifact.id) || scheduleContent(originals.get(artifact.id)!) !== scheduleContent(artifact));
  const removed = [...originals.values()].filter((artifact) => !draft.some((item) => item.id === artifact.id));
  const dirtyCount = changes.length + removed.length, dirty = dirtyCount > 0;
  const remoteChanged = context.data.artifacts.filter((artifact) => artifact.kind === "wbs")
    .map((artifact) => `${artifact.id}:${artifact.version}`).join("|") !== [...originals.values()].map((artifact) => `${artifact.id}:${artifact.version}`).join("|");
  const canEdit = context.can("wbs","UPDATE") && !busy;
  const canCreate = context.can("wbs","CREATE") && !busy, canDelete = context.can("wbs","DELETE") && !busy;
  const onDirtyChange = context.onDirtyChange;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    onDirtyChange?.(dirty);
    const prevent = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", prevent);
    return () => { window.removeEventListener("beforeunload", prevent); onDirtyChange?.(false); };
  }, [dirty, onDirtyChange]);
  const tasks = scheduleRows(normalized, expanded);
  function setTasks(update: ScheduleRow[] | ((current: ScheduleRow[]) => ScheduleRow[])) {
    const next = typeof update === "function" ? update(tasks) : update;
    if (tasks.some(task => !next.some(n => n.id === task.id)) && !canDelete) return;
    if (next.some(task => !tasks.some(t => t.id === task.id)) && !canCreate) return;
    if (next.some(task => { const old=tasks.find(t=>t.id===task.id); return old && JSON.stringify(old)!==JSON.stringify(task); }) && !canEdit) return;
    setDraft(next.map((task) => {
      const fields: Record<string, string> = { ...task.artifact.fields, owner: task.assignee, startDate: task.startDate, endDate: task.endDate, progress: String(task.progress) };
      if (fields.taskType === "마일스톤") {
        fields.endDate = fields.startDate !== task.artifact.fields.startDate ? fields.startDate : fields.endDate;
        fields.startDate = fields.endDate;
      }
      return { ...task.artifact, title: task.title, fields, structure: { ...task.artifact.structure, parentId: task.parentId ?? "" } };
    }));
  }
  function openTask(parentId: string | null = null, id?: string) {
    if (id ? !canEdit : !canCreate) return;
    setError("");
    if (id) { setEditing(normalized.find((artifact) => artifact.id === id) ?? null); return; }
    if (parentId && normalized.find((artifact) => artifact.id === parentId)?.fields.taskType !== "요약") { setError("하위 작업은 유형이 ‘요약’인 작업에 추가해 주세요."); return; }
    const fields = Object.fromEntries(definitions.wbs.fields.map((field) => [field.key, field.defaultValue ?? ""]));
    fields.startDate = fields.endDate = koreaToday(); fields.taskType = "작업";
    setEditing({ id: `temp-${crypto.randomUUID()}`, projectId: baseline.project.id, kind: "wbs", code: "", title: "", status: "초안", fields, links: [], structure: { parentId: parentId ?? "", dependencies: [] }, version: 0, createdAt: "", updatedAt: "" });
  }
  function applyTask(artifact: Artifact) {
    if (originals.has(artifact.id) ? !canEdit : !canCreate) return;
    const candidate = draft.some((task) => task.id === artifact.id)
      ? draft.map((task) => task.id === artifact.id ? artifact : task)
      : [...draft, artifact];
    try {
      const seen = new Set<string>([artifact.id]);
      let parent = artifact.structure?.parentId;
      while (parent) {
        if (seen.has(parent)) throw new Error("상위 작업에 순환이 있습니다.");
        seen.add(parent); parent = candidate.find((task) => task.id === parent)?.structure?.parentId;
      }
      if (artifact.fields.endDate < artifact.fields.startDate) throw new Error("종료일은 시작일 이후여야 합니다.");
      if (candidate.some((task) => task.structure?.parentId === artifact.id) && artifact.fields.taskType !== "요약") throw new Error("하위 작업이 있는 항목은 요약 유형이어야 합니다.");
      setDraft(candidate); setEditing(null); setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "작업 내용을 확인해 주세요."); }
  }
  async function load() {
    if (submitting.current) return;
    submitting.current = true; setBusy(true); setError(""); setConfirmReload(false);
    try {
      const data: ProjectData = await jsonRequest(`/api/projects/${baseline.project.id}/artifacts`);
      if (!mounted.current) return;
      setBaseline(data); setDraft(data.artifacts.filter((artifact) => artifact.kind === "wbs"));
      context.updateData?.(data); setMessage("최신 일정을 조회했습니다."); retry.current = null;
    } catch (reason) { if (mounted.current) setError(reason instanceof Error ? reason.message : "조회하지 못했습니다."); }
    finally { submitting.current = false; if (mounted.current) setBusy(false); }
  }
  async function save() {
    if (!(canEdit || canCreate || canDelete) || submitting.current || !dirty) return;
    submitting.current = true; setBusy(true); setError("");
    const payload = { changes: changes.map((artifact) => ({ id: artifact.id, ...(artifact.version ? { version: artifact.version } : {}), title: artifact.title, status: artifact.status, fields: artifact.fields, links: artifact.links, structure: artifact.structure })),
      deletes: removed.map((artifact) => ({ id: artifact.id, version: artifact.version })), versions: Object.fromEntries([...originals.values()].map((artifact) => [artifact.id, artifact.version])) };
    const content = JSON.stringify(payload);
    if (retry.current?.content !== content) retry.current = { content, requestId: crypto.randomUUID() };
    try {
      const actions = new Set<"CREATE"|"UPDATE"|"DELETE">(changes.map(artifact => originals.has(artifact.id) ? "UPDATE" : "CREATE"));
      if (removed.length) actions.add("DELETE");
      for (const action of actions) if (!await context.verifyPermission('wbs', action)) throw new Error('WBS permission changed. Reload project access.');
      const result = await jsonRequest(`/api/projects/${baseline.project.id}/wbs/schedule`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, requestId: retry.current!.requestId }) });
      if (!mounted.current) return;
      setBaseline(result.data); setDraft(result.data.artifacts.filter((artifact: Artifact) => artifact.kind === "wbs")); context.updateData?.(result.data);
      setMessage(`저장 완료 · ${new Date(result.savedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`); retry.current = null;
    } catch (reason) { if (mounted.current) setError(reason instanceof Error ? reason.message : "저장하지 못했습니다."); }
    finally { submitting.current = false; if (mounted.current) setBusy(false); }
  }
  return { tasks, setTasks, canEdit, canCreate, canDelete, busy, error, message, dirty, dirtyCount, remoteChanged, editing, setEditing, openTask, applyTask,
    toggleExpand: (id: string) => setExpanded((current) => ({ ...current, [id]: !(current[id] ?? true) })),
    query: () => dirty ? setConfirmReload(true) : void load(), confirmReload, setConfirmReload, load, save,
    otherArtifacts: [...baseline.artifacts.filter((artifact) => artifact.kind !== "wbs"), ...normalized], baseline,
  };
}
