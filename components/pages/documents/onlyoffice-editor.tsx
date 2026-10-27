"use client";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { jsonRequest } from "@/lib/client-request";
import type { OnlyofficeConfiguration } from "@/lib/onlyoffice-types";
import "./onlyoffice-editor.css";

const DocumentEditor = dynamic(() => import("@onlyoffice/document-editor-react").then(module => module.DocumentEditor), {
  ssr: false, loading: () => <p role="status">편집기를 준비하는 중입니다.</p>,
});

export function OnlyofficeEditor({ projectId, fileId }: { projectId: string; fileId: string }) {
  const [editor, setEditor] = useState<OnlyofficeConfiguration | null>(null);
  const [error, setError] = useState(""), [status, setStatus] = useState("문서 서버에 연결하는 중입니다.");
  useEffect(() => {
    const controller = new AbortController();
    jsonRequest(`/api/projects/${projectId}/documents/files/${fileId}/editor`, { signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) setEditor(result); })
      .catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "문서를 열지 못했습니다."); });
    return () => controller.abort();
  }, [projectId, fileId]);
  return <main className="onlyoffice-page">
    <header className="onlyoffice-toolbar">
      <div><h1>{editor?.name || "문서 편집"}</h1><p role="status">{editor ? `${editor.canEdit ? "편집 모드" : "읽기 전용"} · ${status}` : "문서를 불러오는 중입니다."}</p></div>
      <a className="button" href={`/projects/${projectId}`}>프로젝트로 이동</a>
    </header>
    {error && <div className="onlyoffice-error" role="alert"><p>{error}</p><button className="button" onClick={() => window.location.reload()}>다시 열기</button></div>}
    {!error && editor?.canEdit && <p className="onlyoffice-help">저장 버튼으로 변경 내용을 저장할 수 있습니다. 편집 종료 시에도 서버가 최종 저장을 처리합니다.</p>}
    <div className="onlyoffice-frame">
      {editor && <DocumentEditor id="project-document-editor" documentServerUrl={editor.documentServerUrl} config={editor.config}
        onLoadComponentError={() => setError("ONLYOFFICE 문서 서버에 연결하지 못했습니다. 문서 서버 주소와 브라우저의 접근 가능 여부를 확인해 주세요.")}
        events_onDocumentReady={() => setStatus("문서가 열렸습니다.")}
        events_onDocumentStateChange={event => setStatus((event as { data?: boolean }).data ? "문서를 수정하고 있습니다." : "문서 서버에 변경사항을 전달했습니다.")}
        events_onError={() => setError("문서 편집 또는 저장 중 오류가 발생했습니다. 문서를 닫기 전에 편집기의 오류 안내를 확인해 주세요.")}
      />}
    </div>
  </main>;
}
