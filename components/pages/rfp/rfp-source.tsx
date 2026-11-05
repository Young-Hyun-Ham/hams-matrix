"use client";
import { useEffect, useRef, useState, type DragEvent } from "react";
import { useProjectPage } from "@/components/shared/project-page-context";
import { Icon } from "@/components/icon";
import { RfpGenerationHistoryDialog } from "./rfp-generation-history";
import { ConfirmationDialog } from "@/components/shared/confirmation-dialog";
import {
  RFP_SOURCE_ACCEPT,
  RFP_GENERATION_PROMPT_MAX_LENGTH,
} from "@/lib/rfp-source-types";
import type { useRfpDocument } from "./use-rfp-document";
import { sourceError, useRfpSource } from "./use-rfp-source";

export function RfpSourcePanel({
  model,
  onBusyChange,
}: {
  model: ReturnType<typeof useRfpDocument>;
  onBusyChange: (busy: boolean) => void;
}) {
  const { data, can, selectTab } = useProjectPage(),
    state = useRfpSource(model);
  const {
    source,
    loading,
    blocked,
    working,
    requestId,
    stopping,
    models,
    selectedModel,
    canGenerate,
  } = state;
  const picker = useRef<HTMLInputElement>(null);
  const [confirmation, setConfirmation] = useState<
    "generate" | "detach" | null
  >(null);
  const [scopePrompt, setScopePrompt] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const historyButton = (
    <button
      type="button"
      className="rfp-action rfp-history-trigger"
      aria-label="AI 제안요청서 생성 이력"
      title="AI 제안요청서 생성 이력"
      onClick={() => setHistoryOpen(true)}
    >
      <Icon name="history" size={16} />
    </button>
  );
  useEffect(() => {
    onBusyChange(blocked);
    return () => onBusyChange(false);
  }, [blocked, onBusyChange]);
  const canAttach =
    can("rfp", source?.file ? "UPDATE" : "CREATE") &&
    can("documents", "CREATE");
  function drop(event: DragEvent) {
    event.preventDefault();
    if (!canAttach || blocked || loading) return;
    void state.upload(Array.from(event.dataTransfer.files));
  }
  return (
    <section
      className="rfp-source"
      aria-label="원본 제안요청서 파일"
      aria-busy={blocked}
      onDragOver={(event) => event.preventDefault()}
      onDrop={drop}
    >
      <strong>원본 제안요청서 파일</strong>
      <p className="rfp-source-help">
        한 개 · PDF/DOCX/UTF-8 TXT·MD · 최대 20MB · PDF 50페이지 · 스캔 PDF는
        OCR 후 첨부
      </p>
      <input
        ref={picker}
        aria-label="제안요청서 원본 파일 선택"
        type="file"
        accept={RFP_SOURCE_ACCEPT}
        hidden
        disabled={!canAttach || blocked || loading || model.busy}
        onChange={(event) => {
          void state.upload(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />
      {loading ? (
        <p role="status">원본을 불러오는 중입니다.</p>
      ) : source?.file ? (
        <div className="rfp-source-row">
          <div className="rfp-source-file">
            <strong>{source.file.name}</strong>
            <small>
              {(source.file.size / 1024).toFixed(1)}KB ·{" "}
              {source.file.uploadedBy} ·{" "}
              {new Date(source.file.createdAt).toLocaleDateString("ko-KR")}
            </small>
          </div>
          <div className="rfp-source-actions">
            <a
              className="rfp-action"
              href={`/api/projects/${data.project.id}/documents/files/${source.file.id}`}
            >
              다운로드
            </a>
            <button
              type="button"
              className="rfp-action"
              onClick={() => selectTab("documents")}
            >
              문서함에서 보기
            </button>
            {canGenerate && (
              <>
                <select
                  aria-label="제안요청서 생성 모델"
                  value={selectedModel}
                  disabled={blocked || !models.length}
                  onChange={(event) =>
                    state.setSelectedModel(event.target.value)
                  }
                >
                  {!models.length && (
                    <option value="">사용 가능한 모델 없음</option>
                  )}
                  {models.map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
                <button
                  type="button"
                  className="rfp-action rfp-action-primary"
                  disabled={
                    blocked ||
                    model.busy ||
                    !model.loaded ||
                    !selectedModel ||
                    model.dirty
                  }
                  onClick={() => setConfirmation("generate")}
                >
                  AI로 제안 요청서 생성
                </button>
              </>
            )}
            {historyButton}
            {canAttach && (
              <button
                type="button"
                className="rfp-action"
                disabled={blocked || model.busy}
                onClick={() => picker.current?.click()}
              >
                교체
              </button>
            )}
            {can("rfp", "DELETE") && (
              <button
                type="button"
                className="rfp-action"
                disabled={blocked || model.busy}
                onClick={() => setConfirmation("detach")}
              >
                첨부 해제
              </button>
            )}
          </div>
        </div>
      ) : (
        <div>
          {canAttach ? (
            <button
              type="button"
              className="rfp-action"
              disabled={blocked || model.busy}
              onClick={() => picker.current?.click()}
            >
              파일 첨부
            </button>
          ) : (
            <p>첨부된 원본 파일이 없습니다.</p>
          )}
          {historyButton}
        </div>
      )}
      {model.dirty && source?.file && canGenerate && (
        <p className="rfp-source-help">
          미저장 편집본을 먼저 저장하거나 조회에서 명시적으로 폐기한 후 생성해
          주세요.
        </p>
      )}
      {source?.active && !requestId && (
        <p role="status">이 프로젝트에서 원본 기반 AI 생성이 진행 중입니다.</p>
      )}
      {requestId && (
        <button
          type="button"
          className="rfp-action"
          disabled={stopping}
          onClick={() => void state.stop()}
        >
          {stopping ? "중지 요청 중…" : "생성 중지"}
        </button>
      )}
      {state.notice && <p role="status">{state.notice}</p>}
      {state.error && (
        <p role="alert" className="error-message">
          {state.error}{" "}
          <button
            type="button"
            className="rfp-action"
            disabled={working}
            onClick={() =>
              void state
                .refresh()
                .catch((error) => state.setError(sourceError(error)))
            }
          >
            원본 다시 조회
          </button>
        </p>
      )}
      {historyOpen && (
        <RfpGenerationHistoryDialog
          projectId={data.project.id}
          onClose={() => setHistoryOpen(false)}
        />
      )}
      {confirmation && (
        <ConfirmationDialog
          title={
            confirmation === "generate"
              ? "원본으로 제안요청서 생성"
              : "원본 첨부 해제"
          }
          busy={working}
          confirmLabel={
            confirmation === "generate" ? "생성하여 저장" : "첨부 해제"
          }
          onClose={() => setConfirmation(null)}
          onConfirm={() => {
            const action = confirmation;
            setConfirmation(null);
            void (action === "generate"
              ? state.generate(scopePrompt)
              : state.detach());
          }}
        >
          {confirmation === "generate" ? (
            <>
              <p>
                {source?.file?.name} 파일로 제안요청서를 생성하여 DB 초안으로
                저장합니다.
              </p>
              <label
                className="rfp-generation-scope"
                htmlFor="rfp-generation-scope"
              >
                <strong>생성 요청 범위 · 추가 프롬프트 (선택)</strong>
                <textarea
                  id="rfp-generation-scope"
                  rows={5}
                  maxLength={RFP_GENERATION_PROMPT_MAX_LENGTH}
                  value={scopePrompt}
                  disabled={working}
                  onChange={(event) => setScopePrompt(event.target.value)}
                  aria-describedby="rfp-generation-scope-help"
                  placeholder="예: 사업 개요와 추진 범위만 작성해 주세요. 세부 요구사항은 보안 관련 항목만 포함하고, 각 항목을 간결하게 정리해 주세요."
                />
                <small>
                  {scopePrompt.length.toLocaleString()} /{" "}
                  {RFP_GENERATION_PROMPT_MAX_LENGTH.toLocaleString()}자
                </small>
              </label>
              <p id="rfp-generation-scope-help">
                비워 두면 원본 전체를 대상으로 생성합니다. 범위를 지정하면 그
                밖의 항목은 비어 있을 수 있습니다.
              </p>
              {model.document && (
                <p>
                  기존 저장본 v{model.document.version}을 전체 교체합니다. 이전
                  내용은 변경 이력에 보존됩니다.
                </p>
              )}
              <p>AI 사용량이 발생하며 생성 후 내용을 검토해야 합니다.</p>
            </>
          ) : (
            <p>
              첨부 연결만 해제합니다. 원본은 문서함에, 생성한 제안요청서는
              저장본에 보존됩니다.
            </p>
          )}
        </ConfirmationDialog>
      )}
    </section>
  );
}
