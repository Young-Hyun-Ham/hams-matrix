import { useWorkspaceErrorState } from "@/components/query/use-workspace-error-state";
import { RequestError } from "@/lib/query/error-messages";
import { useBoardTransport } from "../lib/use-board-transport";
import { useEffect, useRef, useState } from "react";
import { useWorkspace } from "@/stores/workspace";
import Link from "next/link";
import { usePlanningAccess } from "@/app/(editor)/planning-board/stores/editor-provider";
import { AiScreenGenerator } from "./ai-screen-generator";
import { Icon } from "./editor-icon";
import { isDeleteShortcut } from "../lib/editor-delete";
import type { Layer } from "./types";
import type { ReviewDialogAction } from "./review-dialog";

type SelectionMode = "single" | "toggle" | "range";

type RowProps = {
  layer: Layer;
  depth?: number;
  selectedIds: string[];
  draggedIds: string[];
  dropTargetId: string | null;
  onSelect: (id: string, event: React.MouseEvent) => void;
  onDragStart: (event: React.DragEvent, id: string) => void;
  onDragEnd: () => void;
  onDragOver: (event: React.DragEvent, layer: Layer) => void;
  onDrop: (event: React.DragEvent, layer: Layer) => void;
  onRename: (id: string, name: string) => void;
  onContextMenu: (event: React.MouseEvent, layer: Layer) => void;
  onToggleVisibility: (id: string) => void;
  onToggleLock: (id: string) => void;
};
const layerIcon = (layer: Layer) =>
  layer.kind === "section"
    ? "frame"
    : layer.kind === "layer"
      ? "group"
      : layer.kind;

function LayerRow({
  layer,
  depth = 0,
  selectedIds,
  draggedIds,
  dropTargetId,
  onSelect,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onRename,
  onContextMenu,
  onToggleVisibility,
  onToggleLock,
}: RowProps) {
  const [open, setOpen] = useState(layer.kind !== "page"),
    [renaming, setRenaming] = useState(false);
  const nameRef = useRef<HTMLSpanElement>(null);
  const beginRename = (event: React.MouseEvent) => {
    event.stopPropagation();
    setRenaming(true);
    requestAnimationFrame(() => {
      const target = nameRef.current;
      if (!target) return;
      target.focus();
      const range = document.createRange(),
        selection = window.getSelection();
      range.selectNodeContents(target);
      selection?.removeAllRanges();
      selection?.addRange(range);
    });
  };
  return (
    <>
      <div
        className={`layer-row ${selectedIds.includes(layer.id) ? "selected" : ""} ${draggedIds.includes(layer.id) ? "dragging" : ""} ${dropTargetId === layer.id ? "drop-target" : ""} ${layer.visible === false ? "hidden-layer" : ""}`}
        style={{ paddingLeft: 10 + depth * 18 }}
        draggable={!renaming && layer.kind !== "page"}
        aria-selected={selectedIds.includes(layer.id)}
        data-layer-row-id={layer.id}
        onClick={(event) => onSelect(layer.id, event)}
        onContextMenu={(event) => onContextMenu(event, layer)}
        onDragStart={(event) => onDragStart(event, layer.id)}
        onDragEnd={onDragEnd}
        onDragOver={(event) => {
          if (
            layer.kind === "page" ||
            layer.kind === "section" ||
            layer.kind === "layer"
          ) {
            setOpen(true);
          }
          onDragOver(event, layer);
        }}
        onDrop={(event) => onDrop(event, layer)}
      >
        <span
          className="layer-toggle"
          onClick={(event) => {
            event.stopPropagation();
            setOpen(!open);
          }}
        >
          {layer.children ? (
            <Icon name={open ? "down" : "chevron"} size={12} />
          ) : null}
        </span>
        <span className={`layer-icon ${layer.kind}`}>
          <Icon name={layerIcon(layer)} size={14} />
        </span>
        <span
          ref={nameRef}
          className={renaming ? "layer-name editing" : "layer-name"}
          contentEditable={renaming}
          suppressContentEditableWarning
          onDoubleClick={beginRename}
          onBlur={(event) => {
            const name = event.currentTarget.innerText.trim();
            if (name) onRename(layer.id, name);
            else event.currentTarget.innerText = layer.name;
            setRenaming(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.blur();
            }
            if (event.key === "Escape") {
              event.currentTarget.innerText = layer.name;
              event.currentTarget.blur();
            }
          }}
        >
          {layer.name}
        </span>
        <span className="layer-row-actions">
          <button
            title={layer.visible === false ? "보이기" : "숨기기"}
            onClick={(event) => {
              event.stopPropagation();
              onToggleVisibility(layer.id);
            }}
          >
            <Icon name={layer.visible === false ? "eyeOff" : "eye"} size={14} />
          </button>
          <button
            className={layer.locked ? "active" : ""}
            title={layer.locked ? "잠금 해제" : "잠금"}
            onClick={(event) => {
              event.stopPropagation();
              onToggleLock(layer.id);
            }}
          >
            <Icon name={layer.locked ? "lock" : "unlock"} size={13} />
          </button>
        </span>
      </div>
      {open &&
        layer.children?.map((child) => (
          <LayerRow
            key={child.id}
            layer={child}
            depth={depth + 1}
            selectedIds={selectedIds}
            draggedIds={draggedIds}
            dropTargetId={dropTargetId}
            onSelect={onSelect}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onRename={onRename}
            onContextMenu={onContextMenu}
            onToggleVisibility={onToggleVisibility}
            onToggleLock={onToggleLock}
          />
        ))}
    </>
  );
}

type Props = {
  title: string;
  onRenameTitle: (name: string) => void;
  layers: Layer[];
  selectedIds: string[];
  selectionAnchor: string;
  onSelect: (id: string, mode?: SelectionMode, rangeIds?: string[]) => void;
  onMoveToParent: (ids: string[], parentId: string) => void;
  onRename: (id: string, name: string) => void;
  onAdd: (
    parentId: string,
    kind: Layer["kind"],
    legacyVariant?: "button",
  ) => void;
  onDelete: (id: string) => void;
  onDeleteMany: (ids: string[]) => boolean;
  onToggleVisibility: (id: string) => void;
  onToggleLock: (id: string) => void;
  onNewPage: () => void;
  onSave: () => void;
  onDeletePage: () => void;
  onOpenProject: (id: string) => Promise<void>;
  canDeletePage: boolean;
  saving: boolean;
  prompt: string;
  onPromptChange: (value: string) => void;
  models: string[];
  model: string;
  onModelChange: (value: string) => void;
  modelsLoading: boolean;
  modelWarning: string;
  projectId?: string;
  aiHistoryVersion: number;
  onGenerate: () => void;
  generating: boolean;
  readOnly: boolean;
  projectStatus: string;
  isReviewer: boolean;
  canManageReview: boolean;
  canCreateTemplate: boolean;
  onCreateTemplate: () => void;
  onReviewAction: (action: ReviewDialogAction) => void;
};

export function LeftPanel({
  title,
  onRenameTitle,
  layers,
  selectedIds,
  selectionAnchor,
  onSelect,
  onMoveToParent,
  onRename,
  onAdd,
  onDelete,
  onDeleteMany,
  onToggleVisibility,
  onToggleLock,
  onNewPage,
  onSave,
  onDeletePage,
  onOpenProject,
  canDeletePage,
  saving,
  prompt,
  onPromptChange,
  models,
  model,
  onModelChange,
  modelsLoading,
  modelWarning,
  projectId,
  aiHistoryVersion,
  onGenerate,
  generating,
  readOnly,
  projectStatus,
  isReviewer,
  canManageReview,
  canCreateTemplate,
  onCreateTemplate,
  onReviewAction,
}: Props) {
  const fetch = useBoardTransport();
  const user = useWorkspace((state) => state.user);
  const isLoadingUser = usePlanningAccess((state) => state.isLoading);
  const [menu, setMenu] = useState<{
      x: number;
      y: number;
      layer: Layer;
      selectedIds?: string[];
    } | null>(null),
    [pageMenu, setPageMenu] = useState(false);
  const [draggedIds, setDraggedIds] = useState<string[]>([]);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [tab, setTab] = useState<"layers" | "pages">("layers"),
    [projects, setProjects] = useState<
      {
        id: string;
        title: string;
        status: string;
        updatedAt: string | null;
        access: "owner" | "edit" | "view";
        ownerEmail: string;
      }[]
    >([]),
    [projectsLoading, setProjectsLoading] = useState(false),
    [projectsError, setProjectsError] = useWorkspaceErrorState("");
  useEffect(() => {
    const close = () => {
      setMenu(null);
      setPageMenu(false);
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("blur", close);
    };
  }, []);
  useEffect(() => {
    if (tab !== "layers") return;
    const button = document.querySelector<HTMLButtonElement>(
      ".left-panel .panel-tabs button:nth-child(2)",
    );
    const openPages = () => {
      setProjectsLoading(true);
      setProjectsError("");
      setTab("pages");
    };
    button?.addEventListener("click", openPages);
    return () => button?.removeEventListener("click", openPages);
  }, [tab, setProjectsError]);
  useEffect(() => {
    if (readOnly) return;
    if (tab !== "layers") return;
    const label = document.querySelector<HTMLSpanElement>(
      ".left-panel .page-label > span",
    );
    if (!label) return;
    label.innerText = title;
    const edit = () => {
      label.contentEditable = "true";
      label.classList.add("editing");
      label.focus();
      const range = document.createRange(),
        selection = window.getSelection();
      range.selectNodeContents(label);
      selection?.removeAllRanges();
      selection?.addRange(range);
    };
    const commit = () => {
      const name = label.innerText.trim();
      label.contentEditable = "false";
      label.classList.remove("editing");
      if (name) onRenameTitle(name);
      else label.innerText = title;
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Enter") {
        event.preventDefault();
        label.blur();
      }
      if (event.key === "Escape") {
        label.innerText = title;
        label.blur();
      }
    };
    label.title = "더블클릭하여 문서 제목 변경";
    label.addEventListener("dblclick", edit);
    label.addEventListener("blur", commit);
    label.addEventListener("keydown", key);
    return () => {
      label.removeEventListener("dblclick", edit);
      label.removeEventListener("blur", commit);
      label.removeEventListener("keydown", key);
    };
  }, [readOnly, tab, title, onRenameTitle]);
  useEffect(() => {
    if (tab !== "pages") return;
    const controller = new AbortController();
    fetch("/api/projects", { signal: controller.signal })
      .then(async (response) => {
        const result = (await response.json()) as {
          projects?: {
            id: string;
            title: string;
            status: string;
            updatedAt: string | null;
            access: "owner" | "edit" | "view";
            ownerEmail: string;
          }[];
          error?: string;
        };
        if (!response.ok) throw new Error(result.error ?? "조회 실패");
        setProjects(result.projects ?? []);
      })
      .catch((error) => {
        if (error instanceof Error && error.name !== "AbortError")
          setProjectsError(
            error instanceof RequestError ? error : error.message,
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setProjectsLoading(false);
      });
    return () => controller.abort();
  }, [tab, user, fetch, setProjectsError]);
  const additions: { kind: Layer["kind"]; label: string }[] = [
    { kind: "layer", label: "Layer" },
    { kind: "section", label: "Section" },
    { kind: "text", label: "Text" },
    { kind: "image", label: "Image" },
    { kind: "clipboard", label: "Clipboard" },
    { kind: "button", label: "Button" },
    { kind: "checkbox", label: "Checkbox" },
    { kind: "radio", label: "Radio" },
    { kind: "select", label: "Select" },
    { kind: "icon", label: "Icon" },
  ];
  const canHaveChildren =
    menu &&
    (menu.layer.kind === "page" ||
      menu.layer.kind === "section" ||
      menu.layer.kind === "layer");
  const openMenu = (event: React.MouseEvent, layer: Layer) => {
    event.preventDefault();
    event.stopPropagation();
    const multi = selectedIds.length > 1 && selectedIds.includes(layer.id);
    if (!multi) onSelect(layer.id);
    setMenu({
      selectedIds: multi ? [...selectedIds] : undefined,
      x: Math.min(event.clientX, window.innerWidth - 170),
      y: Math.min(event.clientY, window.innerHeight - 390),
      layer,
    });
  };
  const findInTree = (items: Layer[], id: string): Layer | undefined => {
    for (const item of items) {
      if (item.id === id) return item;
      const found = item.children && findInTree(item.children, id);
      if (found) return found;
    }
  };
  const containsLayer = (layer: Layer, id: string): boolean =>
    layer.id === id ||
    Boolean(layer.children?.some((child) => containsLayer(child, id)));
  const canReceiveDrop = (layer: Layer) =>
    (layer.kind === "page" ||
      layer.kind === "section" ||
      layer.kind === "layer") &&
    !draggedIds.some((id) => {
      const draggedLayer = findInTree(layers, id);
      return draggedLayer ? containsLayer(draggedLayer, layer.id) : false;
    });
  const selectTreeLayer = (id: string, event: React.MouseEvent) => {
    if (
      !(
        event.target instanceof Element &&
        event.target.closest('[contenteditable="true"]')
      )
    )
      event.currentTarget
        .closest<HTMLElement>(".layer-tree")
        ?.focus({ preventScroll: true });
    if (event.shiftKey) {
      const visibleIds = Array.from(
        document.querySelectorAll<HTMLElement>(
          ".left-panel .layer-tree [data-layer-row-id]",
        ),
        (row) => row.dataset.layerRowId,
      ).filter((rowId): rowId is string => Boolean(rowId));
      const anchorIndex = visibleIds.indexOf(selectionAnchor);
      const selectedIndex = visibleIds.indexOf(id);
      if (anchorIndex >= 0 && selectedIndex >= 0) {
        const start = Math.min(anchorIndex, selectedIndex);
        const end = Math.max(anchorIndex, selectedIndex);
        onSelect(id, "range", visibleIds.slice(start, end + 1));
        return;
      }
    }
    onSelect(id, event.ctrlKey || event.metaKey ? "toggle" : "single");
  };
  const startDrag = (event: React.DragEvent, id: string) => {
    const ids = selectedIds.includes(id)
      ? selectedIds.filter(
          (selectedId) => findInTree(layers, selectedId)?.kind !== "page",
        )
      : [id];
    if (!selectedIds.includes(id)) onSelect(id);
    setDraggedIds(ids);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", ids.join(","));
  };
  const endDrag = () => {
    setDraggedIds([]);
    setDropTargetId(null);
  };
  const dragOver = (event: React.DragEvent, layer: Layer) => {
    if (!draggedIds.length || !canReceiveDrop(layer)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    setDropTargetId(layer.id);
  };
  const drop = (event: React.DragEvent, layer: Layer) => {
    event.preventDefault();
    event.stopPropagation();
    if (draggedIds.length && canReceiveDrop(layer)) {
      onMoveToParent(draggedIds, layer.id);
    }
    endDrag();
  };
  if (tab === "pages")
    return (
      <aside className="left-panel">
        <div className="panel-tabs">
          <button onClick={() => setTab("layers")}>레이어</button>
          <button className="active">페이지</button>
        </div>
        <div className="project-list-head">
          <strong>저장된 페이지</strong>
          <span>{projects.length}</span>
        </div>
        <div className="project-list">
          {isLoadingUser ? (
            <div className="project-list-state">로그인 확인 중...</div>
          ) : !user ? (
            <div className="project-login-state">
              <p>로그인하면 저장된 페이지를 확인할 수 있습니다.</p>
              <Link href="/login">로그인</Link>
            </div>
          ) : projectsLoading ? (
            <div className="project-list-state">불러오는 중...</div>
          ) : projectsError ? (
            <div className="project-list-state error">{projectsError}</div>
          ) : projects.length === 0 ? (
            <div className="project-list-state">저장된 문서가 없습니다.</div>
          ) : (
            projects.map((project) => (
              <div
                className="project-list-item"
                key={project.id}
                title="더블클릭하여 열기"
                onDoubleClick={async () => {
                  setProjectsError("");
                  try {
                    await onOpenProject(project.id);
                    setTab("layers");
                  } catch (error) {
                    setProjectsError(
                      error instanceof RequestError
                        ? error
                        : error instanceof Error
                          ? error.message
                          : "문서를 불러오지 못했습니다.",
                    );
                  }
                }}
              >
                <span className="project-list-icon">
                  <Icon name="page" size={14} />
                </span>
                <div>
                  <strong>{project.title}</strong>
                  <small>
                    {project.updatedAt
                      ? new Date(project.updatedAt).toLocaleString("ko-KR")
                      : "저장 시간 없음"}
                  </small>
                  {project.access !== "owner" && (
                    <small>
                      공유됨 ·{" "}
                      {project.access === "edit" ? "수정 가능" : "보기 전용"}
                    </small>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </aside>
    );
  return (
    <aside className="left-panel">
      <div className="panel-tabs">
        <button className="active">레이어</button>
        <button>페이지</button>
      </div>
      <div className="page-label">
        <span>홈</span>
        <button
          className="page-more-button"
          disabled={readOnly && !isReviewer && !canManageReview}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => setPageMenu(!pageMenu)}
        >
          <Icon name="more" size={15} />
        </button>
        {pageMenu && (
          <div
            className="page-menu"
            onPointerDown={(event) => event.stopPropagation()}
          >
            {canCreateTemplate && (
              <button
                disabled={readOnly || saving || generating}
                onClick={() => {
                  setPageMenu(false);
                  onCreateTemplate();
                }}
              >
                템플릿 생성
              </button>
            )}
            {!isReviewer && (
              <button
                onClick={() => {
                  onNewPage();
                  setPageMenu(false);
                }}
              >
                <Icon name="plus" size={14} />새 페이지 추가
              </button>
            )}
            {!isReviewer && (
              <span
                className="page-menu-button-tooltip"
                title={!user ? "로그인을 해주세요" : undefined}
              >
                <button
                  onClick={() => {
                    onSave();
                    setPageMenu(false);
                  }}
                  disabled={
                    saving || readOnly || !user || projectStatus === "review"
                  }
                >
                  <span>◇</span>
                  {saving ? "저장 중..." : "저장"}
                </button>
              </span>
            )}
            {isReviewer ? (
              <>
                <button
                  className="context-delete"
                  onClick={() => {
                    onReviewAction("reject");
                    setPageMenu(false);
                  }}
                >
                  × 반려
                </button>
                <button
                  onClick={() => {
                    onReviewAction("complete");
                    setPageMenu(false);
                  }}
                >
                  ✓ 완료
                </button>
              </>
            ) : canManageReview ? (
              <>
                <button
                  disabled={!projectId}
                  onClick={() => {
                    onReviewAction("request");
                    setPageMenu(false);
                  }}
                >
                  ◎ {projectStatus === "review" ? "검토자 재지정" : "검토"}
                </button>
                <button
                  disabled={!projectId || projectStatus === "review"}
                  onClick={() => {
                    onReviewAction("complete");
                    setPageMenu(false);
                  }}
                >
                  ✓ 완료
                </button>
              </>
            ) : null}
            <div className="context-separator" />
            {!isReviewer && (
              <button
                className="context-delete"
                disabled={!canDeletePage}
                onClick={() => {
                  onDeletePage();
                  setPageMenu(false);
                }}
              >
                × 삭제
              </button>
            )}
          </div>
        )}
      </div>
      <div
        className="layer-tree"
        tabIndex={0}
        aria-label="요소 트리"
        onKeyDown={(event) => {
          if (
            !readOnly &&
            isDeleteShortcut(event) &&
            onDeleteMany(selectedIds)
          ) {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
      >
        {layers.map((layer) => (
          <LayerRow
            key={layer.id}
            layer={layer}
            selectedIds={selectedIds}
            draggedIds={draggedIds}
            dropTargetId={dropTargetId}
            onSelect={selectTreeLayer}
            onDragStart={startDrag}
            onDragEnd={endDrag}
            onDragOver={dragOver}
            onDrop={drop}
            onRename={onRename}
            onContextMenu={readOnly ? () => undefined : openMenu}
            onToggleVisibility={onToggleVisibility}
            onToggleLock={onToggleLock}
          />
        ))}
      </div>
      {menu && (
        <div
          className="layer-context-menu"
          style={{ left: menu.x, top: menu.y }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {menu.selectedIds ? (
            <>
              <p className="multi-selection-menu-title">
                {menu.selectedIds.length}개 요소 선택
              </p>
              <div className="context-separator" />
              <button
                className="context-delete"
                onClick={() => {
                  onDeleteMany(menu.selectedIds!);
                  setMenu(null);
                }}
              >
                삭제
              </button>
            </>
          ) : (
            <>
              {canHaveChildren && (
                <>
                  <div className="layer-add-group">
                    <button className="layer-add-trigger">
                      <Icon name="plus" size={14} />
                      <span>{menu.layer.name}에 추가</span>
                      <span className="context-arrow">▸</span>
                    </button>
                    <div className="layer-add-submenu">
                      {additions.map((item) => (
                        <button
                          key={item.kind}
                          onClick={() => {
                            onAdd(menu.layer.id, item.kind);
                            setMenu(null);
                          }}
                        >
                          <Icon
                            name={
                              item.kind === "section"
                                ? "frame"
                                : item.kind === "layer"
                                  ? "group"
                                  : item.kind
                            }
                            size={14}
                          />
                          <span>{item.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="context-separator" />
                </>
              )}
              <button
                className="context-delete"
                disabled={
                  menu.layer.kind === "page" &&
                  layers.filter((item) => item.kind === "page").length <= 1
                }
                onClick={() => {
                  onDelete(menu.layer.id);
                  setMenu(null);
                }}
              >
                × 삭제
              </button>
            </>
          )}
        </div>
      )}
      <AiScreenGenerator
        prompt={prompt}
        onPromptChange={onPromptChange}
        models={models}
        model={model}
        onModelChange={onModelChange}
        modelsLoading={modelsLoading}
        modelWarning={modelWarning}
        projectId={projectId}
        aiHistoryVersion={aiHistoryVersion}
        onGenerate={onGenerate}
        generating={generating}
        readOnly={readOnly}
      />
    </aside>
  );
}
