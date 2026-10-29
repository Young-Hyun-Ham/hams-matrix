"use client";

import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Copy,
  FileText,
  Folder,
  Info,
  ListX,
  Save,
  Search,
  X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import styles from "./MarkdownViewer.module.css";

type ViewMode = "preview" | "source";

type Heading = {
  id: string;
  text: string;
  level: number;
  line: number;
};

type MarkdownDocument = {
  name: string;
  relativePath: string;
  content: string;
  modifiedAt: string;
  size: number;
};

type DocumentFolder = {
  name: string;
  path: string;
  folders: DocumentFolder[];
  documents: MarkdownDocument[];
};

const buildDocumentTree = (documents: MarkdownDocument[]): DocumentFolder => {
  const root: DocumentFolder = {
    name: "",
    path: "",
    folders: [],
    documents: [],
  };

  documents.forEach((document) => {
    const segments = document.relativePath.split("/");
    const folderNames = segments.slice(0, -1);
    let current = root;

    folderNames.forEach((folderName) => {
      const folderPath = current.path
        ? `${current.path}/${folderName}`
        : folderName;
      let child = current.folders.find((folder) => folder.name === folderName);

      if (!child) {
        child = {
          name: folderName,
          path: folderPath,
          folders: [],
          documents: [],
        };
        current.folders.push(child);
      }

      current = child;
    });

    current.documents.push(document);
  });

  const sortFolder = (folder: DocumentFolder) => {
    folder.folders.sort((left, right) =>
      left.name.localeCompare(right.name, "ko"),
    );
    folder.documents.sort((left, right) =>
      left.relativePath.localeCompare(right.relativePath, "ko"),
    );
    folder.folders.forEach(sortFolder);
  };

  sortFolder(root);
  return root;
};

const getParentFolderPaths = (relativePath: string) => {
  const segments = relativePath.split("/").slice(0, -1);
  return segments.map((_, index) => segments.slice(0, index + 1).join("/"));
};

const resolveMarkdownLink = (currentPath: string, href?: string) => {
  if (!href || href.startsWith("#") || /^[a-z][a-z\d+.-]*:/i.test(href)) {
    return null;
  }

  const [rawPath, rawHash] = href.split("#", 2);
  const pathWithoutQuery = rawPath.split("?", 1)[0];
  if (!/\.md$/i.test(pathWithoutQuery)) return null;

  let decodedPath = pathWithoutQuery;
  try {
    decodedPath = decodeURIComponent(pathWithoutQuery);
  } catch {
    // Keep the original path when the href contains malformed escapes.
  }

  const segments = decodedPath.startsWith("/")
    ? []
    : currentPath.split("/").slice(0, -1);

  decodedPath
    .replace(/^\/+/, "")
    .split("/")
    .forEach((segment) => {
      if (!segment || segment === ".") return;
      if (segment === "..") segments.pop();
      else segments.push(segment);
    });

  return {
    path: segments.join("/"),
    hash: rawHash ? decodeURIComponent(rawHash) : "",
  };
};

const createSlugger = () => {
  const counts = new Map<string, number>();

  return (text: string) => {
    const base =
      text
        .toLowerCase()
        .trim()
        .replace(/[^\p{L}\p{N}\s-]/gu, "")
        .replace(/\s+/g, "-") || "section";
    const count = counts.get(base) ?? 0;
    counts.set(base, count + 1);
    return count ? `${base}-${count}` : base;
  };
};

const extractHeadings = (content: string): Heading[] => {
  const slug = createSlugger();

  return content
    .split("\n")
    .map((line, index) => {
      const match = /^(#{1,3})\s+(.+?)\s*#*$/.exec(line.trim());
      if (!match) return null;
      const text = match[2].replace(/[`*_~]/g, "").trim();
      return {
        id: slug(text),
        text,
        level: match[1].length,
        line: index + 1,
      };
    })
    .filter((heading): heading is Heading => heading !== null);
};

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
};

const formatDate = (value: string) => {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return value;

  // Keep the server-rendered text and the browser's first render identical.
  // Intl output can vary by runtime even when locale and timeZone are fixed.
  const koreaTime = new Date(timestamp + 9 * 60 * 60 * 1000);
  const year = koreaTime.getUTCFullYear();
  const month = String(koreaTime.getUTCMonth() + 1).padStart(2, "0");
  const day = String(koreaTime.getUTCDate()).padStart(2, "0");
  const hour = String(koreaTime.getUTCHours()).padStart(2, "0");
  const minute = String(koreaTime.getUTCMinutes()).padStart(2, "0");

  return `${year}.${month}.${day} ${hour}:${minute}`;
};

const getRiskCellClass = (value: string) => {
  const text = value.trim();

  if (/^(?:D:|X:)|\/(?:\s*)?(?:D:|X:)/.test(text)) {
    return styles.riskCritical;
  }
  if (/^C:|\/(?:\s*)?C:/.test(text)) return styles.riskHigh;
  if (/^B:|\/(?:\s*)?B:/.test(text)) return styles.riskMedium;
  if (/^A:/.test(text)) return styles.riskLow;

  if (/^XL\b|~XL\b/.test(text)) return styles.riskCritical;
  if (/^L\b|~L\b/.test(text)) return styles.riskHigh;
  if (/^M\b|~M\b/.test(text)) return styles.riskMedium;
  if (/^S\b/.test(text)) return styles.riskLow;

  return undefined;
};

export default function MarkdownViewer({
  documents: initialDocuments,
}: {
  documents: MarkdownDocument[];
}) {
  const viewerId = useId();
  const viewerRef = useRef<HTMLElement | null>(null);
  const tabsRef = useRef<HTMLDivElement | null>(null);
  // Measure the enclosing shell instead of duplicating its header/footer heights.
  useLayoutEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const parent = viewer.parentElement;
    const footer = parent?.nextElementSibling;
    const measure = () => {
      const bottomPadding = parent
        ? parseFloat(getComputedStyle(parent).paddingBottom) || 0
        : 0;
      const top = viewer.getBoundingClientRect().top + window.scrollY;
      const height = Math.max(
        360,
        window.innerHeight -
          top -
          bottomPadding -
          (footer?.getBoundingClientRect().height ?? 0),
      );
      viewer.style.setProperty("--viewer-height", `${Math.floor(height)}px`);
    };
    const observer = new ResizeObserver(measure);
    if (parent) observer.observe(parent);
    if (footer) observer.observe(footer);
    window.addEventListener("resize", measure);
    measure();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);
  const searchParams = useSearchParams();
  const requestedPath = searchParams.get("document");
  const initialPath =
    initialDocuments.find((document) => document.relativePath === requestedPath)
      ?.relativePath ??
    initialDocuments[0]?.relativePath ??
    "";
  const [documents, setDocuments] = useState(initialDocuments);
  const [selectedPath, setSelectedPath] = useState(initialPath);
  const [openDocumentPaths, setOpenDocumentPaths] = useState<string[]>(() =>
    initialPath ? [initialPath] : [],
  );
  const [query, setQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("preview");
  const [copied, setCopied] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    () => new Set(getParentFolderPaths(initialPath)),
  );
  const mainRef = useRef<HTMLDivElement | null>(null);

  const filteredDocuments = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase("ko");
    if (!keyword) return documents;
    return documents.filter(
      (document) =>
        document.relativePath.toLocaleLowerCase("ko").includes(keyword) ||
        document.content.toLocaleLowerCase("ko").includes(keyword),
    );
  }, [documents, query]);
  const documentTree = useMemo(
    () => buildDocumentTree(filteredDocuments),
    [filteredDocuments],
  );
  const isSearching = query.trim().length > 0;

  const selectedDocument =
    documents.find((document) => document.relativePath === selectedPath) ??
    null;
  const openDocuments = openDocumentPaths
    .map((path) => documents.find((document) => document.relativePath === path))
    .filter((document): document is MarkdownDocument => Boolean(document));
  const headings = useMemo(
    () => extractHeadings(selectedDocument?.content ?? ""),
    [selectedDocument],
  );
  const copyDocument = async () => {
    if (!selectedDocument) return;
    await navigator.clipboard.writeText(selectedDocument.content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  const saveDocument = async () => {
    if (!selectedDocument || saving) return;

    const content =
      drafts[selectedDocument.relativePath] ?? selectedDocument.content;
    if (content === selectedDocument.content) return;

    setSaving(true);
    setSaveMessage("");

    try {
      const response = await fetch("/api/markdown", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          relativePath: selectedDocument.relativePath,
          content,
        }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        modifiedAt?: string;
        size?: number;
      };

      if (!response.ok)
        throw new Error(result.error ?? "문서를 저장하지 못했습니다.");

      setDocuments((current) =>
        current.map((document) =>
          document.relativePath === selectedDocument.relativePath
            ? {
                ...document,
                content,
                modifiedAt: result.modifiedAt ?? document.modifiedAt,
                size: result.size ?? new Blob([content]).size,
              }
            : document,
        ),
      );
      setDrafts((current) => {
        const next = { ...current };
        delete next[selectedDocument.relativePath];
        return next;
      });
      setSaveMessage("저장되었습니다.");
    } catch (error) {
      setSaveMessage(
        error instanceof Error ? error.message : "문서를 저장하지 못했습니다.",
      );
    } finally {
      setSaving(false);
    }
  };

  const toggleFolder = (folderPath: string) => {
    setExpandedFolders((current) => {
      const next = new Set(current);
      if (next.has(folderPath)) next.delete(folderPath);
      else next.add(folderPath);
      return next;
    });
  };

  const scrollToHeading = (id: string, behavior: ScrollBehavior = "auto") => {
    const reader = mainRef.current;
    const heading = reader?.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
    if (!reader || !heading) return;
    reader.scrollTo({
      top:
        reader.scrollTop +
        heading.getBoundingClientRect().top -
        reader.getBoundingClientRect().top -
        16,
      behavior,
    });
  };

  const openDocument = (relativePath: string, hash = "") => {
    if (!documents.some((document) => document.relativePath === relativePath)) {
      return;
    }

    setOpenDocumentPaths((current) =>
      current.includes(relativePath) ? current : [...current, relativePath],
    );
    setExpandedFolders((current) => {
      const next = new Set(current);
      getParentFolderPaths(relativePath).forEach((path) => next.add(path));
      return next;
    });
    setSelectedPath(relativePath);
    setCopied(false);
    setSaveMessage("");

    window.requestAnimationFrame(() => {
      if (hash) {
        scrollToHeading(hash);
      } else {
        mainRef.current?.scrollTo({ top: 0 });
      }
    });
  };

  const closeDocument = (relativePath: string) => {
    const closingIndex = openDocumentPaths.indexOf(relativePath);
    if (closingIndex < 0) return;

    const nextPaths = openDocumentPaths.filter((path) => path !== relativePath);
    setOpenDocumentPaths(nextPaths);

    if (selectedPath === relativePath) {
      const nextSelectedPath =
        nextPaths[closingIndex] ?? nextPaths[closingIndex - 1] ?? "";
      setSelectedPath(nextSelectedPath);
      setCopied(false);
      setSaveMessage("");
      mainRef.current?.scrollTo({ top: 0 });
    }
  };

  const closeOtherDocuments = () => {
    if (!selectedPath) return;
    setOpenDocumentPaths([selectedPath]);
    setCopied(false);
    setSaveMessage("");
    mainRef.current?.scrollTo({ top: 0 });
  };

  const renderDocumentTree = (folder: DocumentFolder, depth = 0) => (
    <>
      {folder.folders.map((childFolder) => {
        const expanded = isSearching || expandedFolders.has(childFolder.path);
        return (
          <li key={childFolder.path} className={styles.folderItem}>
            <button
              type="button"
              className={styles.folderButton}
              style={{ paddingLeft: 10 + depth * 20 }}
              onClick={() => toggleFolder(childFolder.path)}
              aria-expanded={expanded}
            >
              {expanded ? (
                <ChevronUp
                  size={18}
                  aria-hidden="true"
                  className={styles.expandIcon}
                />
              ) : (
                <ChevronDown
                  size={18}
                  aria-hidden="true"
                  className={styles.expandIcon}
                />
              )}
              <Folder
                size={18}
                aria-hidden="true"
                className={styles.folderIcon}
              />
              <span className={styles.folderName}>{childFolder.name}</span>
            </button>
            {expanded && (
              <ul className={styles.folderChildren}>
                {renderDocumentTree(childFolder, depth + 1)}
              </ul>
            )}
          </li>
        );
      })}

      {folder.documents.map((document) => (
        <li key={document.relativePath} className={styles.folderItem}>
          <button
            type="button"
            className={styles.documentButton}
            style={{ paddingLeft: depth === 0 ? 8 : 36 + depth * 8 }}
            data-selected={
              document.relativePath === selectedDocument?.relativePath
            }
            aria-current={
              document.relativePath === selectedDocument?.relativePath
                ? "page"
                : undefined
            }
            onClick={() => openDocument(document.relativePath)}
          >
            <FileText
              size={18}
              aria-hidden="true"
              className={styles.fileIcon}
            />
            <span className={styles.fileText}>
              <span className={styles.fileName}>{document.name}</span>
              <span className={styles.filePath}>{document.relativePath}</span>
            </span>
          </button>
        </li>
      ))}
    </>
  );

  const headingComponent = (level: 1 | 2 | 3) => {
    const HeadingComponent = ({
      children,
      node,
    }: {
      children?: React.ReactNode;
      node?: { position?: { start: { line: number } } };
    }) => {
      const sourceLine = node?.position?.start.line;
      const id =
        headings.find((heading) => heading.line === sourceLine)?.id ??
        `section-${sourceLine ?? level}`;
      const Component = `h${level}` as const;
      return <Component id={id}>{children}</Component>;
    };
    HeadingComponent.displayName = `MarkdownHeading${level}`;
    return HeadingComponent;
  };

  return (
    <section
      className={styles.viewer}
      ref={viewerRef}
      aria-label="Markdown 문서 뷰어"
    >
      <div className={styles.workspace}>
        <aside className={styles.sidebar}>
          <div className={styles.sidebarHeader}>
            <div className={styles.sidebarTitle}>
              문서{" "}
              <span className={styles.documentCount}>
                {documents.length}개 문서
              </span>
            </div>
            <label className={styles.searchField}>
              <Search size={18} aria-hidden="true" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="파일명 또는 내용 검색"
                aria-label="파일명 또는 내용 검색"
              />
            </label>
          </div>
          <ul className={styles.documentList}>
            {renderDocumentTree(documentTree)}
            {!filteredDocuments.length && (
              <li className={styles.emptyList}>검색 결과가 없습니다.</li>
            )}
          </ul>
        </aside>
        <section className={styles.main} aria-label="문서 내용">
          {!selectedDocument ? (
            <div className={styles.emptyState} role="status">
              <Info size={20} aria-hidden="true" />
              {documents.length
                ? "열린 문서가 없습니다. 문서 목록에서 문서를 선택하세요."
                : "docs 폴더에 표시할 Markdown 문서가 없습니다."}
            </div>
          ) : (
            <>
              <div className={styles.documentTabs}>
                <button
                  type="button"
                  className={styles.tabScrollButton}
                  aria-label="이전 문서 탭"
                  onClick={() =>
                    tabsRef.current?.scrollBy({
                      left: -220,
                      behavior: "smooth",
                    })
                  }
                >
                  <ChevronLeft size={18} aria-hidden="true" />
                </button>
                <div
                  ref={tabsRef}
                  className={styles.tabsScroller}
                  role="tablist"
                  aria-label="열린 문서"
                >
                  {openDocuments.map((document) => (
                    <div
                      key={document.relativePath}
                      className={styles.tabItem}
                      data-selected={
                        document.relativePath === selectedDocument.relativePath
                      }
                    >
                      <button
                        type="button"
                        role="tab"
                        id={`${viewerId}-${encodeURIComponent(document.relativePath)}`}
                        aria-controls={`${viewerId}-panel`}
                        aria-selected={
                          document.relativePath ===
                          selectedDocument.relativePath
                        }
                        tabIndex={
                          document.relativePath ===
                          selectedDocument.relativePath
                            ? 0
                            : -1
                        }
                        className={styles.tabSelect}
                        title={document.relativePath}
                        onClick={() => openDocument(document.relativePath)}
                        onKeyDown={(event) => {
                          if (
                            ![
                              "ArrowLeft",
                              "ArrowRight",
                              "Home",
                              "End",
                            ].includes(event.key)
                          )
                            return;
                          event.preventDefault();
                          const tabs = Array.from(
                            tabsRef.current?.querySelectorAll<HTMLButtonElement>(
                              '[role="tab"]',
                            ) ?? [],
                          );
                          const index = tabs.indexOf(event.currentTarget);
                          const next =
                            event.key === "Home"
                              ? 0
                              : event.key === "End"
                                ? tabs.length - 1
                                : (index +
                                    (event.key === "ArrowRight" ? 1 : -1) +
                                    tabs.length) %
                                  tabs.length;
                          tabs[next]?.focus();
                          if (openDocuments[next])
                            openDocument(openDocuments[next].relativePath);
                        }}
                      >
                        <span className={styles.tabLabelText}>
                          {document.name}
                        </span>
                      </button>
                      <button
                        type="button"
                        className={styles.tabCloseButton}
                        aria-label={`${document.name} 탭 닫기`}
                        onClick={() => closeDocument(document.relativePath)}
                      >
                        <X size={16} aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className={styles.tabScrollButton}
                  aria-label="다음 문서 탭"
                  onClick={() =>
                    tabsRef.current?.scrollBy({ left: 220, behavior: "smooth" })
                  }
                >
                  <ChevronRight size={18} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={styles.closeOtherTabsButton}
                  disabled={openDocumentPaths.length <= 1}
                  onClick={closeOtherDocuments}
                >
                  <ListX size={18} aria-hidden="true" /> 다른 탭 닫기
                </button>
              </div>
              <div className={styles.documentHeader}>
                <div className={styles.documentTitle}>
                  <h2>{selectedDocument.name}</h2>
                  <p>
                    {selectedDocument.relativePath} ·{" "}
                    {formatBytes(selectedDocument.size)} ·{" "}
                    {formatDate(selectedDocument.modifiedAt)}
                  </p>
                </div>
                <div className={styles.headerActions}>
                  {saveMessage && viewMode === "source" && (
                    <span className={styles.saveMessage} role="status">
                      {saveMessage}
                    </span>
                  )}
                  {viewMode === "source" && (
                    <button
                      type="button"
                      className={styles.saveButton}
                      disabled={
                        saving ||
                        (drafts[selectedDocument.relativePath] ??
                          selectedDocument.content) === selectedDocument.content
                      }
                      onClick={() => void saveDocument()}
                    >
                      <Save size={18} aria-hidden="true" />{" "}
                      {saving ? "저장 중..." : "저장"}
                    </button>
                  )}
                  <div
                    className={styles.modeGroup}
                    role="group"
                    aria-label="문서 표시 모드"
                  >
                    <button
                      type="button"
                      value="preview"
                      aria-pressed={viewMode === "preview"}
                      onClick={() => setViewMode("preview")}
                    >
                      미리보기
                    </button>
                    <button
                      type="button"
                      value="source"
                      aria-pressed={viewMode === "source"}
                      onClick={() => setViewMode("source")}
                    >
                      원문
                    </button>
                  </div>
                  <button
                    type="button"
                    className={styles.copyButton}
                    title={copied ? "복사됨" : "Markdown 복사"}
                    aria-label={copied ? "Markdown 복사 완료" : "Markdown 복사"}
                    onClick={() => void copyDocument()}
                  >
                    <Copy size={18} aria-hidden="true" />
                  </button>
                </div>
              </div>
              <div
                className={styles.readingArea}
                ref={mainRef}
                data-view-mode={viewMode}
                role="tabpanel"
                id={`${viewerId}-panel`}
                aria-labelledby={`${viewerId}-${encodeURIComponent(selectedDocument.relativePath)}`}
                tabIndex={0}
              >
                <div className={styles.documentPaper}>
                  {viewMode === "source" ? (
                    <textarea
                      className={styles.sourceEditor}
                      aria-label={`${selectedDocument.name} 원문 편집`}
                      value={
                        drafts[selectedDocument.relativePath] ??
                        selectedDocument.content
                      }
                      onChange={(event) => {
                        setDrafts((current) => ({
                          ...current,
                          [selectedDocument.relativePath]: event.target.value,
                        }));
                        setSaveMessage("");
                      }}
                      onKeyDown={(event) => {
                        if (
                          (event.ctrlKey || event.metaKey) &&
                          event.key === "s"
                        ) {
                          event.preventDefault();
                          void saveDocument();
                        }
                      }}
                      spellCheck={false}
                    />
                  ) : (
                    <article className={styles.markdown}>
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          h1: headingComponent(1),
                          h2: headingComponent(2),
                          h3: headingComponent(3),
                          a: ({ href, children }) => {
                            const markdownLink = resolveMarkdownLink(
                              selectedDocument.relativePath,
                              href,
                            );
                            const canOpenInViewer = Boolean(
                              markdownLink &&
                              documents.some(
                                (document) =>
                                  document.relativePath === markdownLink.path,
                              ),
                            );

                            if (markdownLink && canOpenInViewer) {
                              return (
                                <a
                                  href={href}
                                  onClick={(event) => {
                                    event.preventDefault();
                                    openDocument(
                                      markdownLink.path,
                                      markdownLink.hash,
                                    );
                                  }}
                                >
                                  {children}
                                </a>
                              );
                            }

                            return (
                              <a href={href} target="_blank" rel="noreferrer">
                                {children}
                              </a>
                            );
                          },
                          code: ({ className, children, node, ...props }) => (
                            <code
                              className={className}
                              {...props}
                              data-line={node?.position?.start.line}
                            >
                              {children}
                            </code>
                          ),
                          td: ({ children, node, ...props }) => {
                            const cellText = String(children ?? "");
                            const riskClass = getRiskCellClass(cellText);

                            return (
                              <td
                                className={riskClass}
                                data-line={node?.position?.start.line}
                                {...props}
                              >
                                {children}
                              </td>
                            );
                          },
                        }}
                      >
                        {selectedDocument.content}
                      </ReactMarkdown>
                    </article>
                  )}
                </div>
                {viewMode === "preview" && headings.length > 1 && (
                  <nav className={styles.outline} aria-label="이 문서의 목차">
                    <strong>이 문서의 목차</strong>
                    <div className={styles.outlineLinks}>
                      {headings.map((heading) => (
                        <button
                          type="button"
                          key={heading.id}
                          className={styles.outlineButton}
                          style={{ paddingLeft: 8 + (heading.level - 1) * 12 }}
                          onClick={() => scrollToHeading(heading.id, "smooth")}
                        >
                          {heading.text}
                        </button>
                      ))}
                    </div>
                  </nav>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </section>
  );
}
