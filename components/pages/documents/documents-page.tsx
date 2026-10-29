"use client";
import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
} from "react";
import { useProjectPage } from "@/components/shared/project-page-context";
import { jsonRequest } from "@/lib/client-request";
import {
  MAX_DOCUMENT_BYTES,
  type DocumentFolder,
  type DocumentListing,
  type DocumentFile,
} from "@/lib/document-types";
import "./documents-page.css";

type LibraryAction = {
  kind: "create" | "rename" | "delete";
  folder?: DocumentFolder;
  file?: DocumentFile;
};
function message(error: unknown) {
  return error instanceof Error ? error.message : "요청에 실패했습니다.";
}
function fileSize(size: number) {
  return size < 1024
    ? `${size} B`
    : size < 1024 * 1024
      ? `${(size / 1024).toFixed(1)} KB`
      : `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export function DocumentsPage() {
  const { data } = useProjectPage();
  const base = `/api/projects/${data.project.id}/documents`;
  const canWrite = data.canWrite;
  const [current, setCurrent] = useState<string | null>(null);
  const [listing, setListing] = useState<DocumentListing>({
    folders: [],
    files: [],
  });
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  const [action, setAction] = useState<LibraryAction | null>(null),
    [name, setName] = useState("");
  const picker = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0),
    uploading = useRef(false);
  const [dragging, setDragging] = useState(false);
  const disabled = loading || busy;

  function dragEnter(event: DragEvent<HTMLElement>) {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    dragDepth.current++;
    if (canWrite && !disabled) setDragging(true);
  }
  function dragOver(event: DragEvent<HTMLElement>) {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = canWrite && !disabled ? "copy" : "none";
  }
  function dragLeave(event: DragEvent<HTMLElement>) {
    if (!event.dataTransfer.types.includes("Files")) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (!dragDepth.current) setDragging(false);
  }
  function dropFiles(event: DragEvent<HTMLElement>) {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    if (!canWrite || disabled) return;
    const hasDirectory = Array.from(event.dataTransfer.items).some(
      (item) => item.webkitGetAsEntry?.()?.isDirectory,
    );
    if (hasDirectory) {
      setError("폴더 대신 폴더 안의 파일을 선택해서 놓아 주세요.");
      return;
    }
    void upload(Array.from(event.dataTransfer.files));
  }

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError("");
      try {
        const result = await jsonRequest(
          `${base}?${new URLSearchParams({ folderId: current ?? "" })}`,
          { signal: controller.signal },
        );
        if (!controller.signal.aborted) setListing(result);
      } catch (error) {
        if (!controller.signal.aborted) setError(message(error));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [base, current, revision]);

  const ancestors: DocumentFolder[] = [];
  const seen = new Set<string>();
  let ancestor = current;
  while (ancestor && !seen.has(ancestor)) {
    seen.add(ancestor);
    const folder = listing.folders.find((f) => f.id === ancestor);
    if (!folder) break;
    ancestors.unshift(folder);
    ancestor = folder.parentId;
  }
  const folders = listing.folders.filter((f) => f.parentId === current);
  function navigate(id: string | null) {
    setCurrent(id);
    setAction(null);
    setNotice("");
    setError("");
    setLoading(true);
  }
  function openAction(next: LibraryAction) {
    setAction(next);
    setName(next.kind === "rename" ? (next.file ?? next.folder)!.name : "");
    setError("");
    setNotice("");
  }
  async function saveAction(event: FormEvent) {
    event.preventDefault();
    if (!action || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await jsonRequest(
        action.file ? `${base}/files/${action.file.id}` : base,
        {
          method:
            action.kind === "create"
              ? "POST"
              : action.kind === "rename"
                ? "PATCH"
                : "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: action.folder?.id,
            name,
            parentId: current,
          }),
        },
      );
      const target = action.file ? "파일" : "폴더";
      setNotice(
        action.kind === "create"
          ? "폴더를 추가했습니다."
          : action.kind === "rename"
            ? `${target} 이름을 변경했습니다.`
            : `${target}를 삭제했습니다.`,
      );
      setAction(null);
      setRevision((r) => r + 1);
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy(false);
    }
  }
  async function upload(files: File[]) {
    if (!files.length || disabled || !canWrite || uploading.current) return;
    uploading.current = true;
    setBusy(true);
    setAction(null);
    setError("");
    setNotice("");
    let uploaded = 0;
    const failures: string[] = [];
    for (const file of files) {
      if (!file.size || file.size > MAX_DOCUMENT_BYTES) {
        failures.push(`${file.name}: 빈 파일이거나 20MB를 초과합니다.`);
        continue;
      }
      setNotice(
        `업로드 중 (${uploaded + failures.length + 1}/${files.length}): ${file.name}`,
      );
      try {
        await jsonRequest(
          `${base}/files?${new URLSearchParams({ folderId: current ?? "", name: file.name })}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/octet-stream" },
            body: file,
          },
        );
        uploaded++;
      } catch (error) {
        failures.push(`${file.name}: ${message(error)}`);
      }
    }
    setNotice(
      `${uploaded}개 파일을 업로드했습니다.${failures.length ? ` ${failures.length}개 실패.` : ""}`,
    );
    setError(failures.join("\n"));
    setBusy(false);
    uploading.current = false;
    setRevision((r) => r + 1);
  }
  async function download(file: DocumentFile) {
    setBusy(true);
    setError("");
    setNotice(`${file.name} 다운로드 준비 중…`);
    try {
      const response = await fetch(`${base}/files/${file.id}`, {
        cache: "no-store",
      });
      if (!response.ok)
        throw new Error(
          (await response.json()).error || "다운로드에 실패했습니다.",
        );
      const url = URL.createObjectURL(await response.blob()),
        link = document.createElement("a");
      link.href = url;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setNotice(`${file.name} 다운로드를 시작했습니다.`);
    } catch (error) {
      setNotice("");
      setError(message(error));
    } finally {
      setBusy(false);
    }
  }
  function openEditor(file: DocumentFile) {
    if (disabled) return;
    window.open(
      `/projects/${data.project.id}/documents/${file.id}`,
      "_blank",
      "noopener,noreferrer",
    );
  }
  return (
    <section
      className={`panel matrix-section document-library${dragging && !disabled ? " is-dragging" : ""}`}
      aria-busy={disabled}
      onDragEnter={dragEnter}
      onDragOver={dragOver}
      onDragLeave={dragLeave}
      onDrop={dropFiles}
    >
      <div className="matrix-toolbar">
        <div>
          <h2>문서함</h2>
          <p>프로젝트에 필요한 문서를 폴더별로 보관하고 내려받으세요.</p>
        </div>
        <div className="document-actions">
          <button
            className="button"
            disabled={disabled}
            onClick={() => setRevision((r) => r + 1)}
          >
            새로고침
          </button>
          {canWrite && (
            <>
              <button
                className="button"
                disabled={disabled}
                onClick={() => openAction({ kind: "create" })}
              >
                폴더 추가
              </button>
              <button
                className="button primary"
                disabled={disabled}
                onClick={() => picker.current?.click()}
              >
                파일 업로드
              </button>
              <input
                ref={picker}
                type="file"
                multiple
                hidden
                aria-label="업로드할 파일 선택"
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? []);
                  event.target.value = "";
                  void upload(files);
                }}
              />
            </>
          )}
        </div>
      </div>
      <nav className="document-breadcrumb" aria-label="문서함 폴더 경로">
        <button
          className="button"
          disabled={disabled}
          aria-current={current === null ? "location" : undefined}
          onClick={() => navigate(null)}
        >
          전체 문서
        </button>
        {ancestors.map((f) => (
          <span key={f.id}>
            {" "}
            /{" "}
            <button
              className="button"
              disabled={disabled}
              aria-current={current === f.id ? "location" : undefined}
              onClick={() => navigate(f.id)}
            >
              {f.name}
            </button>
          </span>
        ))}
      </nav>
      {canWrite && (
        <button
          type="button"
          className="document-dropzone"
          disabled={disabled}
          onClick={() => picker.current?.click()}
        >
          <strong>
            {dragging && !disabled
              ? "여기에 놓으면 업로드됩니다"
              : "파일을 여기에 끌어다 놓으세요"}
          </strong>
          <span>
            또는 클릭하여 파일 선택 · 여러 파일 업로드 · 현재 폴더에 저장
          </span>
        </button>
      )}
      <p className="document-help">
        파일명을 더블클릭하면 새 탭에서 문서를 엽니다. DOCX·XLSX·PPTX 편집 지원
        · 파일당 최대 20MB · 비어 있는 폴더만 삭제할 수 있습니다.
      </p>
      {!canWrite && (
        <p className="document-help">
          조회 권한으로 문서 목록과 다운로드를 이용할 수 있습니다.
        </p>
      )}
      {action && (
        <form className="document-folder-form" onSubmit={saveAction}>
          {action.kind === "delete" ? (
            <p>
              ‘{(action.file ?? action.folder)!.name}’{" "}
              {action.file ? "파일" : "폴더"}를 삭제하시겠습니까?
              {action.file && " 삭제한 파일은 복구할 수 없습니다."}
            </p>
          ) : (
            <label>
              {action.kind === "create"
                ? "새 폴더 이름"
                : action.file
                  ? "변경할 파일 이름 (확장자 포함)"
                  : "변경할 폴더 이름"}
              <input
                autoFocus
                required
                maxLength={action.file ? 255 : 100}
                value={name}
                disabled={busy}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
          )}
          <div className="document-actions">
            <button className="button primary" disabled={busy} type="submit">
              {action.kind === "delete" ? "삭제" : "저장"}
            </button>
            <button
              className="button"
              disabled={busy}
              type="button"
              onClick={() => setAction(null)}
            >
              취소
            </button>
          </div>
        </form>
      )}
      {notice && (
        <p role="status" className="matrix-notice">
          {notice}
        </p>
      )}
      {error && (
        <div role="alert" className="matrix-error document-error">
          {error}{" "}
          <button
            className="button"
            disabled={busy}
            onClick={() => {
              setAction(null);
              navigate(null);
              setRevision((r) => r + 1);
            }}
          >
            처음부터 다시 불러오기
          </button>
        </div>
      )}
      {loading ? (
        <p role="status">문서를 불러오는 중입니다.</p>
      ) : (
        <div className="document-table-wrap">
          <table className="document-table">
            <thead>
              <tr>
                <th scope="col">이름</th>
                <th scope="col">크기</th>
                <th scope="col">등록자</th>
                <th scope="col">등록일</th>
                <th scope="col">관리</th>
              </tr>
            </thead>
            <tbody>
              {current && (
                <tr>
                  <td colSpan={5}>
                    <button
                      className="document-name"
                      disabled={disabled}
                      onClick={() =>
                        navigate(ancestors.at(-1)?.parentId ?? null)
                      }
                    >
                      ↰ 상위 폴더
                    </button>
                  </td>
                </tr>
              )}
              {folders.map((folder) => (
                <tr key={folder.id}>
                  <td>
                    <button
                      className="document-name"
                      disabled={disabled}
                      onClick={() => navigate(folder.id)}
                    >
                      <span aria-hidden="true">📁 </span>
                      {folder.name}
                    </button>
                  </td>
                  <td>—</td>
                  <td>—</td>
                  <td>—</td>
                  <td>
                    {canWrite && (
                      <div className="document-actions">
                        <button
                          className="button"
                          disabled={disabled}
                          aria-label={`${folder.name} 이름 변경`}
                          onClick={() => openAction({ kind: "rename", folder })}
                        >
                          이름 변경
                        </button>
                        <button
                          className="button"
                          disabled={disabled}
                          aria-label={`${folder.name} 삭제`}
                          onClick={() => openAction({ kind: "delete", folder })}
                        >
                          삭제
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {listing.files.map((file) => (
                <tr key={file.id}>
                  <td>
                    <button
                      className="document-name"
                      disabled={disabled}
                      title="더블클릭하여 새 탭에서 열기"
                      aria-label={`${file.name} 새 탭에서 열기 (더블클릭 또는 Enter)`}
                      onDoubleClick={() => openEditor(file)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          openEditor(file);
                        }
                      }}
                    >
                      <span aria-hidden="true">📄 </span>
                      {file.name}
                    </button>
                  </td>
                  <td>{fileSize(file.size)}</td>
                  <td>{file.uploadedBy}</td>
                  <td>{new Date(file.createdAt).toLocaleString("ko-KR")}</td>
                  <td>
                    <div className="document-actions">
                      <button
                        className="button"
                        disabled={disabled}
                        aria-label={`${file.name} 다운로드`}
                        onClick={() => void download(file)}
                      >
                        다운로드
                      </button>
                      {canWrite && (
                        <>
                          <button
                            className="button"
                            disabled={disabled}
                            aria-label={`${file.name} 이름 변경`}
                            onClick={() => openAction({ kind: "rename", file })}
                          >
                            이름 변경
                          </button>
                          <button
                            className="button"
                            disabled={disabled}
                            aria-label={`${file.name} 삭제`}
                            onClick={() => openAction({ kind: "delete", file })}
                          >
                            삭제
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!folders.length && !listing.files.length && (
                <tr>
                  <td colSpan={5} className="document-empty">
                    이 폴더에 문서가 없습니다.
                    {canWrite && " 폴더를 추가하거나 파일을 업로드해 주세요."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
