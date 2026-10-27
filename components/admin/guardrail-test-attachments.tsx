"use client";
import { AiImagePreview } from "@/components/ai/ai-image-preview";
import { GUARDRAIL_FILE_ACCEPT } from "@/lib/ai/guardrail-file-types";
import type { useGuardrailAttachments } from "./use-guardrail-attachments";
import "@/components/ai/ai-chatbot.css";

export function GuardrailTestAttachments({ attachments, disabled }: { attachments: ReturnType<typeof useGuardrailAttachments>; disabled: boolean }) {
  return <div className="guardrail-attachments">
    <label>첨부 파일<input type="file" accept={GUARDRAIL_FILE_ACCEPT} multiple disabled={disabled || attachments.loading} onChange={event => {
      const selected = Array.from(event.target.files ?? []); event.target.value = "";
      void attachments.addAttachments(selected);
    }} /></label>
    <p>PNG·JPEG·WebP, TXT·MD·CSV·JSON·LOG·YAML·XML, PDF, Word(DOCX)를 지원합니다. 테스트 내용에 Ctrl/⌘+V로 캡처 이미지를 붙여넣을 수 있습니다.</p>
    <p>이미지 최대 3장·장당 변환 후 2MB·4096px, 문서 최대 3개·개당 4MB·합계 8MB입니다. PDF는 최대 50페이지이며 스캔 본문·문서 내 삽입 이미지와 개체는 텍스트 검사에 포함되지 않습니다.</p>
    {!!attachments.images.length && <ul className="guardrail-image-list" aria-label="첨부 이미지">{attachments.images.map((image, index) => <li key={image.id}>
      <AiImagePreview src={image.dataUrl} label={`테스트 첨부 이미지 ${index + 1}`} /><span>{image.width} × {image.height}</span>
      <button className="button" type="button" disabled={disabled || attachments.loading} onClick={() => attachments.removeImage(image.id)} aria-label={`첨부 이미지 ${index + 1} 삭제`}>삭제</button>
    </li>)}</ul>}
    {!!attachments.files.length && <ul className="guardrail-file-list" aria-label="첨부 문서">{attachments.files.map(file => <li key={file.id}><span>{file.name} · {(file.byteLength / 1024).toFixed(1)} KB</span><button className="button" type="button" disabled={disabled || attachments.loading} onClick={() => attachments.removeFile(file.id)} aria-label={`${file.name} 삭제`}>삭제</button></li>)}</ul>}
    {attachments.loading && <p role="status">첨부 파일을 준비하고 있습니다.</p>}
    {attachments.error && <p className="guardrail-alert" role="alert">{attachments.error}</p>}
  </div>;
}
