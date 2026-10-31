"use client";

import { useRef, useState } from "react";
import { BookOpen, ChevronLeft, ChevronRight, Eye, Plus, Trash2 } from "lucide-react";
import { useProjectPage } from "@/components/shared/project-page-context";
import { useRfpDocument } from "./use-rfp-document";
import type { RfpDraft, RfpRequirement, RfpScheduleItem, RfpEvaluationItem } from "@/lib/rfp-types";
import {
  createRfpSample,
  RFP_CATEGORIES,
  RFP_FIELDS,
  RFP_REQUIREMENT_FIELDS,
  RFP_SECTIONS,
  rfpRequiredProgress,
  rfpSectionStatus,
  rfpValidation,
  type RfpSectionId,
} from "@/lib/rfp-template";
import "./rfp-page.css";

type Field = { key: string; label: string; required?: boolean; multiline?: boolean; type?: string };
type TextSection = keyof typeof RFP_FIELDS;

function RfpField({ field, value, onChange, readOnly, id }: {
  field: Field;
  value: string;
  onChange: (value: string) => void;
  readOnly: boolean;
  id: string;
}) {
  return (
    <label className={`rfp-field${field.multiline ? " rfp-field-wide" : ""}`} htmlFor={id}>
      <span>{field.label}{field.required && <em aria-label="필수">필수</em>}</span>
      {field.multiline ? (
        <textarea id={id} value={value} onChange={(event) => onChange(event.target.value)} readOnly={readOnly} rows={4} />
      ) : (
        <input id={id} type={field.type ?? "text"} min={field.type === "number" ? "0" : undefined}
          value={value} onChange={(event) => onChange(event.target.value)} readOnly={readOnly} />
      )}
    </label>
  );
}

function PreviewValue({ value }: { value: string }) {
  return <span className={value.trim() ? "" : "rfp-empty-value"}>{value.trim() || "미작성"}</span>;
}

function RfpPreview({ draft }: { draft: RfpDraft }) {
  const fieldSection = (section: TextSection) => (
    <dl className="rfp-preview-fields">
      {RFP_FIELDS[section].map((field) => (
        <div key={field.key}>
          <dt>{field.label}</dt>
          <dd><PreviewValue value={(draft[section] as Record<string, string>)[field.key]} /></dd>
        </div>
      ))}
    </dl>
  );
  return (
    <article className="rfp-preview-document">
      <header>
        <span className="rfp-preview-kicker">제안요청서 · 화면 미리보기</span>
        <h2>{draft.title.trim() || "제목 미작성"}</h2>
        <p>문서 미리보기 · 입력값을 바탕으로 표시합니다.</p>
      </header>
      <nav aria-label="문서 목차">
        <strong>목차</strong>
        <ol>{RFP_SECTIONS.map((section) => <li key={section.id}>{section.title}</li>)}</ol>
      </nav>
      {RFP_SECTIONS.map((section, index) => (
        <section key={section.id}>
          <h3>{index + 1}. {section.title}</h3>
          {section.id === "basic" && fieldSection("basic")}
          {section.id === "scope" && fieldSection("scope")}
          {section.id === "requirements" && (draft.requirements.length ? draft.requirements.map((row, rowIndex) => (
            <div className="rfp-preview-requirement" key={row.id}>
              <h4>{rowIndex + 1}. <PreviewValue value={row.title} /> <small>{row.number || "번호 미작성"} · {row.category}</small></h4>
              <dl className="rfp-preview-fields">
                {RFP_REQUIREMENT_FIELDS.filter((field) => field.key !== "title").map((field) => (
                  <div key={field.key}><dt>{field.label}</dt><dd><PreviewValue value={row[field.key as keyof RfpRequirement]} /></dd></div>
                ))}
              </dl>
            </div>
          )) : <p className="rfp-empty-value">미작성</p>)}
          {section.id === "delivery" && <>
            <h4>주요 일정과 산출물</h4>
            {draft.delivery.schedule.length ? <div className="rfp-table-scroll"><table><thead><tr><th>단계</th><th>기간</th><th>산출물</th></tr></thead><tbody>
              {draft.delivery.schedule.map((row) => <tr key={row.id}><td><PreviewValue value={row.phase} /></td><td><PreviewValue value={row.period} /></td><td><PreviewValue value={row.deliverable} /></td></tr>)}
            </tbody></table></div> : <p className="rfp-empty-value">미작성</p>}
            {fieldSection("delivery")}
          </>}
          {section.id === "proposalGuide" && fieldSection("proposalGuide")}
          {section.id === "evaluation" && (draft.evaluation.length ? <div className="rfp-table-scroll"><table><thead><tr><th>평가 항목</th><th>설명</th><th>배점</th></tr></thead><tbody>
            {draft.evaluation.map((row) => <tr key={row.id}><td><PreviewValue value={row.criterion} /></td><td><PreviewValue value={row.description} /></td><td><PreviewValue value={row.points} /></td></tr>)}
          </tbody></table></div> : <p className="rfp-empty-value">미작성</p>)}
          {section.id === "appendix" && fieldSection("appendix")}
        </section>
      ))}
    </article>
  );
}

export function RfpPage() {
  const { data } = useProjectPage();
  const model = useRfpDocument();
  const { draft, canWrite, dirty } = model;
  const [section, setSection] = useState<RfpSectionId>("basic");
  const [selectedRequirementId, setSelectedRequirementId] = useState("sample-requirement-1");
  const selectedRequirement = draft.requirements.find((item) => item.id === selectedRequirementId) ?? draft.requirements[0];
  const dialogRef = useRef<HTMLDialogElement>(null);
  const previewButtonRef = useRef<HTMLButtonElement>(null);
  const progress = rfpRequiredProgress(draft);
  const issues = rfpValidation(draft);
  const sectionIndex = RFP_SECTIONS.findIndex((item) => item.id === section);
  const activeSection = RFP_SECTIONS[sectionIndex];
  function update(next: RfpDraft) { if (canWrite) model.update(next); }
  function changeSectionField(group: TextSection, key: string, value: string) {
    update({ ...draft, [group]: { ...draft[group], [key]: value } });
  }
  function changeRequirement(id: string, key: keyof RfpRequirement, value: string) {
    update({ ...draft, requirements: draft.requirements.map((row) => row.id === id ? { ...row, [key]: value } : row) });
  }
  function addRequirement() {
    const id = crypto.randomUUID();
    const row: RfpRequirement = { id, number: "", category: "SFR", title: "", definition: "", details: "", outputs: "", acceptance: "" };
    update({ ...draft, requirements: [...draft.requirements, row] });
    setSelectedRequirementId(id);
  }
  function removeRequirement(id: string) {
    const requirements = draft.requirements.filter((row) => row.id !== id);
    update({ ...draft, requirements });
    setSelectedRequirementId(requirements[0]?.id ?? "");
  }
  function updateSchedule(id: string, key: keyof RfpScheduleItem, value: string) {
    update({ ...draft, delivery: { ...draft.delivery, schedule: draft.delivery.schedule.map((row) => row.id === id ? { ...row, [key]: value } : row) } });
  }
  function updateEvaluation(id: string, key: keyof RfpEvaluationItem, value: string) {
    update({ ...draft, evaluation: draft.evaluation.map((row) => row.id === id ? { ...row, [key]: value } : row) });
  }
  function renderFields(group: TextSection) {
    return <div className="rfp-field-grid">{RFP_FIELDS[group].map((field) => (
      <RfpField key={field.key} id={`rfp-${group}-${field.key}`} field={field}
        value={(draft[group] as Record<string, string>)[field.key]}
        onChange={(value) => changeSectionField(group, field.key, value)} readOnly={!canWrite} />
    ))}</div>;
  }

  return (
    <section className="rfp-page" aria-labelledby="rfp-page-title">
      <header className="rfp-page-header">
        <div className="rfp-page-heading">
          <span className="rfp-page-icon"><BookOpen size={22} aria-hidden="true" /></span>
          <div><p className="rfp-eyebrow">PROJECT DOCUMENT · SAMPLE</p><h1 id="rfp-page-title">제안요청서 작성</h1><p>목차를 따라 사업 내용을 정리하고 전체 문서에서 확인하세요.</p></div>
        </div>
        <div className="rfp-header-actions">
          <button ref={previewButtonRef} type="button" className="rfp-action rfp-action-primary" onClick={() => dialogRef.current?.showModal()}><Eye size={16} aria-hidden="true" /> 전체 미리보기</button>
          <button type="button" className="rfp-action" disabled={model.busy} onClick={model.reload}>조회</button>
          {canWrite && <><button type="button" className="rfp-action rfp-action-primary" disabled={!dirty && !!model.document} onClick={model.save}>저장</button><button type="button" className="rfp-action" onClick={()=>{if(!dirty||window.confirm('현재 편집본을 샘플로 바꿀까요? DB 저장본은 저장 전까지 유지됩니다.')) update(createRfpSample(data.project.id,data.project.name));}}>샘플 불러오기</button></>}
          {model.document && model.canDelete && <button type="button" className="rfp-action" disabled={model.busy} onClick={model.deleteDocument}>삭제</button>}
        </div>
      </header>

      <div className="rfp-summary" role="status">
        <span className="rfp-sample-label">{dirty ? '미저장 변경사항 있음' : model.document ? `저장본 v${model.document.version}` : '저장된 문서 없음'}</span>
        <div className="rfp-summary-progress"><strong>필수 항목 {progress.completed} / {progress.total} 입력</strong><div className="rfp-progress-track"><span style={{ width: `${progress.completed / progress.total * 100}%` }} /></div></div>
        <span className="rfp-summary-muted">{model.document ? `${new Date(model.document.updatedAt).toLocaleString('ko-KR')} · ${model.document.updatedBy}` : '저장 버튼 또는 AI 작성 요청으로 DB에 저장합니다'}</span>
      </div>

      {model.error && <p className="error-message" role="alert">{model.error}</p>}
      {model.message && <p role="status">{model.message}</p>}
      <div className="rfp-layout">
        <nav className="rfp-outline" aria-label="제안요청서 목차">
          <div className="rfp-outline-title"><strong>문서 목차</strong><span>{RFP_SECTIONS.length}개 장</span></div>
          {RFP_SECTIONS.map((item, index) => <button type="button" key={item.id}
            className={section === item.id ? "rfp-outline-item is-active" : "rfp-outline-item"}
            aria-current={section === item.id ? "step" : undefined}
            onClick={() => setSection(item.id)}>
            <span className="rfp-outline-index">{String(index + 1).padStart(2, "0")}</span>
            <span className="rfp-outline-name">{item.title}<small>{rfpSectionStatus(draft, item.id)}</small></span>
          </button>)}
          <div className="rfp-outline-note">입력 완료는 필수값 충족을 뜻하며 검토·승인 상태가 아닙니다.</div>
        </nav>

        <div className="rfp-workspace">
          <div className="rfp-section-heading"><div><span>SECTION {String(sectionIndex + 1).padStart(2, "0")}</span><h2>{activeSection.title}</h2><p>{activeSection.hint}</p></div><strong className="rfp-section-status">{rfpSectionStatus(draft, section)}</strong></div>
          {section === "basic" && <>
            <RfpField id="rfp-title" field={{ key: "title", label: "문서 제목", required: true }} value={draft.title} onChange={(title) => update({ ...draft, title })} readOnly={!canWrite} />
            {renderFields("basic")}
          </>}
          {section === "scope" && renderFields("scope")}
          {section === "requirements" && <>
            <div className="rfp-inline-heading"><div><h3>원본 요구사항</h3><p>작성한 항목은 기존 요구사항 탭으로 자동 등록되지 않습니다.</p></div>{canWrite && <button type="button" className="rfp-action" onClick={addRequirement}><Plus size={15} aria-hidden="true" /> 요구사항 추가</button>}</div>
            <div className="rfp-requirement-layout">
              <div className="rfp-requirement-list" aria-label="원본 요구사항 목록">
                {draft.requirements.map((row) => <button type="button" key={row.id} className={row.id === selectedRequirement?.id ? "is-active" : ""} onClick={() => setSelectedRequirementId(row.id)} aria-current={row.id === selectedRequirement?.id ? "true" : undefined}>
                  <span>{row.number || "번호 미작성"} · {row.category}</span><strong>{row.title || "제목 없는 요구사항"}</strong><small>{[row.number, row.category, row.title, row.details].every((value) => value.trim()) ? "입력 완료" : "작성 중"}</small>
                </button>)}
                {!draft.requirements.length && <p className="rfp-empty-value">요구사항이 없습니다.</p>}
              </div>
              {selectedRequirement && <div className="rfp-requirement-detail"><div className="rfp-inline-heading"><h3>요구사항 상세</h3>{canWrite && <button type="button" className="rfp-icon-action" title="요구사항 삭제" aria-label="요구사항 삭제" onClick={() => removeRequirement(selectedRequirement.id)}><Trash2 size={16} /></button>}</div>
                <div className="rfp-field-grid">{RFP_REQUIREMENT_FIELDS.map((field) => field.key === "category" ?
                  <label key={field.key} className="rfp-field" htmlFor="rfp-requirement-category"><span>분류<em>필수</em></span><select id="rfp-requirement-category" value={selectedRequirement.category} disabled={!canWrite} onChange={(event) => changeRequirement(selectedRequirement.id, "category", event.target.value)}>{RFP_CATEGORIES.map(({ code, label }) => <option key={code} value={code}>{code} · {label}</option>)}</select></label> :
                  <RfpField key={field.key} id={`rfp-requirement-${field.key}`} field={field} value={selectedRequirement[field.key]} onChange={(value) => changeRequirement(selectedRequirement.id, field.key, value)} readOnly={!canWrite} />
                )}</div>
              </div>}
            </div>
          </>}
          {section === "delivery" && <>
            <div className="rfp-inline-heading"><div><h3>주요 일정과 산출물</h3><p>확정되지 않은 일정은 임시 문구로 표시할 수 있습니다.</p></div>{canWrite && <button type="button" className="rfp-action" onClick={() => update({ ...draft, delivery: { ...draft.delivery, schedule: [...draft.delivery.schedule, { id: crypto.randomUUID(), phase: "", period: "", deliverable: "" }] } })}><Plus size={15} aria-hidden="true" /> 단계 추가</button>}</div>
            <div className="rfp-table-scroll"><table className="rfp-edit-table"><thead><tr><th>단계</th><th>기간</th><th>산출물</th><th><span className="rfp-sr-only">관리</span></th></tr></thead><tbody>{draft.delivery.schedule.map((row) => <tr key={row.id}>{(["phase", "period", "deliverable"] as const).map((key) => <td key={key}><input aria-label={`${key === "phase" ? "단계" : key === "period" ? "기간" : "산출물"}`} value={row[key]} readOnly={!canWrite} onChange={(event) => updateSchedule(row.id, key, event.target.value)} /></td>)}<td>{canWrite && <button type="button" className="rfp-icon-action" aria-label="단계 삭제" onClick={() => update({ ...draft, delivery: { ...draft.delivery, schedule: draft.delivery.schedule.filter((item) => item.id !== row.id) } })}><Trash2 size={15} /></button>}</td></tr>)}</tbody></table></div>
            {renderFields("delivery")}
          </>}
          {section === "proposalGuide" && renderFields("proposalGuide")}
          {section === "evaluation" && <>
            <div className="rfp-inline-heading"><div><h3>평가 항목</h3><p>배점 합계를 확인하고 필요에 따라 기준을 작성하세요.</p></div>{canWrite && <button type="button" className="rfp-action" onClick={() => update({ ...draft, evaluation: [...draft.evaluation, { id: crypto.randomUUID(), criterion: "", description: "", points: "" }] })}><Plus size={15} aria-hidden="true" /> 평가 항목 추가</button>}</div>
            <div className="rfp-table-scroll"><table className="rfp-edit-table"><thead><tr><th>평가 항목</th><th>설명</th><th>배점</th><th><span className="rfp-sr-only">관리</span></th></tr></thead><tbody>{draft.evaluation.map((row) => <tr key={row.id}><td><input aria-label="평가 항목" value={row.criterion} readOnly={!canWrite} onChange={(event) => updateEvaluation(row.id, "criterion", event.target.value)} /></td><td><input aria-label="평가 설명" value={row.description} readOnly={!canWrite} onChange={(event) => updateEvaluation(row.id, "description", event.target.value)} /></td><td><input aria-label="배점" type="number" min="0" value={row.points} readOnly={!canWrite} onChange={(event) => updateEvaluation(row.id, "points", event.target.value)} /></td><td>{canWrite && <button type="button" className="rfp-icon-action" aria-label="평가 항목 삭제" onClick={() => update({ ...draft, evaluation: draft.evaluation.filter((item) => item.id !== row.id) })}><Trash2 size={15} /></button>}</td></tr>)}</tbody></table></div>
            {!draft.evaluation.length && <p className="rfp-empty-value">평가 항목이 없습니다. 필요한 경우 추가하세요.</p>}
            <p className="rfp-score-total">배점 합계 <strong>{draft.evaluation.reduce((sum, row) => sum + (Number(row.points) || 0), 0)}점</strong></p>
          </>}
          {section === "appendix" && renderFields("appendix")}
          {issues.some((issue) => issue.section === section) && <div className="rfp-issues" role="alert"><strong>확인할 내용</strong><ul>{issues.filter((issue) => issue.section === section).map((issue, index) => <li key={index}>{issue.message}</li>)}</ul></div>}
          <div className="rfp-section-footer"><button type="button" className="rfp-action" disabled={sectionIndex === 0} onClick={() => setSection(RFP_SECTIONS[sectionIndex - 1].id)}><ChevronLeft size={15} aria-hidden="true" /> 이전 항목</button><span>{sectionIndex + 1} / {RFP_SECTIONS.length}</span><button type="button" className="rfp-action rfp-action-primary" disabled={sectionIndex === RFP_SECTIONS.length - 1} onClick={() => setSection(RFP_SECTIONS[sectionIndex + 1].id)}>다음 항목 <ChevronRight size={15} aria-hidden="true" /></button></div>
        </div>
      </div>
      <dialog ref={dialogRef} className="workspace-dialog admin-detail-dialog rfp-preview-dialog" aria-labelledby="rfp-preview-title" onClick={(event) => { if (event.target === event.currentTarget) event.currentTarget.close(); }} onClose={() => previewButtonRef.current?.focus()}>
        <div className="dialog-header admin-detail-header">
          <h2 id="rfp-preview-title">전체 문서 미리보기</h2>
          <button type="button" autoFocus className="button admin-detail-close" onClick={() => dialogRef.current?.close()}>닫기</button>
        </div>
        <div className="admin-detail-body"><RfpPreview draft={draft} /></div>
      </dialog>
    </section>
  );
}
