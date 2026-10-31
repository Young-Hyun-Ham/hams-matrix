"use client";
import { useEffect, useRef } from "react";
import type { Artifact } from "@/lib/artifact-types";
import { definitions, allowedLinks, statuses } from "@/lib/artifact-types";
import { WbsFields } from "./wbs-fields";
import { WbsStructureEditor } from "./wbs-structure-editor";
import { useProjectPage } from '@/components/shared/project-page-context';

export function WbsTaskDialog({ artifact, artifacts, onSave, onClose, error }: { artifact: Artifact; artifacts: Artifact[]; onSave: (artifact: Artifact) => void; onClose: () => void; error?: string }) {
  const {can}=useProjectPage();
  const editable=can('wbs',artifact.version?'UPDATE':'CREATE');
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="matrix-dialog workspace-dialog admin-detail-dialog project-registration-dialog" aria-label="WBS 작업 편집" onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <form onSubmit={(event) => {
      event.preventDefault();
      if(!editable)return;
      const form = new FormData(event.currentTarget);
      const fields = { ...artifact.fields };
      for (const field of definitions.wbs.fields) fields[field.key] = String(form.get(field.key) ?? "");
      onSave({ ...artifact, title: String(form.get("title")), status: String(form.get("status")), fields,
        links: form.getAll("links").map(String), structure: { ...artifact.structure, parentId: String(form.get("parentId") ?? ""), dependencies: form.getAll("dependencies").map(String) } });
    }}>
      <div className="dialog-header admin-detail-header"><h2>{artifact.code || "신규 WBS"} · 작업 편집</h2><button type="button" className="button admin-detail-close" onClick={onClose}>닫기</button></div>
      <div className="admin-detail-body project-registration-body">
        {error && <p role="alert" className="matrix-error">{error}</p>}
        <p>입력한 내용은 편집 중인 일정에 적용됩니다. 상단 저장 버튼으로 서버에 저장하세요.</p>
        <fieldset disabled={!editable} style={{border:0,padding:0,margin:0}}>
        <label>명칭 *<input name="title" required maxLength={200} defaultValue={artifact.title} /></label>
        <label>상태<select name="status" defaultValue={artifact.status}>{statuses.map((status) => <option key={status}>{status}</option>)}</select></label>
        <WbsFields artifact={artifact} isExisting={!artifact.id.startsWith("temp-")} calendarOnly />
        <WbsStructureEditor artifact={artifact} artifacts={artifacts} />
        <fieldset className="matrix-links"><legend>연결할 산출물</legend>{artifacts.filter((target) => allowedLinks.wbs.includes(target.kind)).map((target) =>
          <label key={target.id}><input type="checkbox" name="links" value={target.id} defaultChecked={artifact.links.includes(target.id)} />{target.code} · {target.title}</label>)}</fieldset>
        </fieldset>
      </div>
      <div className="project-registration-footer"><button type="button" className="button" onClick={onClose}>취소</button><button type="submit" className="button primary" disabled={!editable}>일정에 적용</button></div>
    </form>
  </dialog>;
}
