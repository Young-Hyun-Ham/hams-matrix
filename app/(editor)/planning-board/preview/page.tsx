"use client";
import { SelectElement } from "../components/select-element";
import { PreviewCapture } from "../components/preview-capture";

import { boardFetch } from "../lib/client-api";
import { boardScope } from "../lib/client-api";
import { normalizeDocumentImages } from "../lib/asset-url";
import { useEffect, useMemo, useRef, useState } from "react";
import { muiIcons } from "@/app/(editor)/planning-board/components/icons/mui";
import { svgIcons } from "@/app/(editor)/planning-board/components/icons/svg";
import type {
  Layer,
  LayerSize,
  LayerStyle,
  PreviewDocument,
} from "@/app/(editor)/planning-board/components/types";
import "../styles/preview.css";

const defaultSize = (kind: Layer["kind"]): LayerSize =>
  kind === "page"
    ? { width: 860, height: 560 }
    : kind === "section" || kind === "layer"
      ? { width: 150, height: 100 }
      : kind === "text" || kind === "button" || kind === "select"
        ? { width: 110, height: 32 }
        : kind === "checkbox" || kind === "radio"
          ? { width: 140, height: 32 }
          : kind === "icon"
            ? { width: 32, height: 32 }
            : { width: 110, height: 80 };

function effectStyle(style: LayerStyle): React.CSSProperties {
  if (style.effect === "shadow")
    return { boxShadow: "0 8px 20px rgb(0 0 0 / 25%)" };
  if (style.effect === "soft-shadow")
    return { boxShadow: "0 16px 40px rgb(0 0 0 / 14%)" };
  if (style.effect === "blur") return { filter: "blur(3px)" };
  if (style.effect === "grayscale") return { filter: "grayscale(1)" };
  if (style.effect === "text-shadow")
    return { textShadow: "0 3px 8px rgb(0 0 0 / 30%)" };
  return {};
}

function PreviewIcon({ layer }: { layer: Layer }) {
  const registry = layer.iconType === "svg" ? svgIcons : muiIcons;
  const IconComponent = registry[
    layer.iconInstance as keyof typeof registry
  ] as React.ComponentType<{ size?: number; color?: string }> | undefined;
  return IconComponent ? (
    <IconComponent
      size={layer.iconSize ?? 22}
      color={layer.iconColor ?? "currentColor"}
    />
  ) : (
    <span className="preview-icon-placeholder" aria-hidden>
      ◇
    </span>
  );
}

function PreviewLayer({
  layer,
  index,
  document,
}: {
  layer: Layer;
  index: number;
  document: PreviewDocument;
}) {
  if (layer.visible === false || layer.template) return null;
  const size = document.sizes[layer.id] ?? defaultSize(layer.kind);
  const position = document.positions[layer.id] ?? { x: 0, y: 0 };
  const style = document.layerStyles[layer.id] ?? {};
  const container = layer.kind === "section" || layer.kind === "layer";
  const image = document.layerImages[layer.id];
  const defaultBackground =
    layer.kind === "section"
      ? "#ede9fe"
      : layer.kind === "image"
        ? "#e5e7eb"
        : layer.kind === "clipboard"
          ? "#f0edff"
          : "#ffffffcc";
  const layerStyle: React.CSSProperties = {
    position: "absolute",
    left: position.x,
    top: position.y,
    width: size.width,
    height: size.height,
    zIndex: index + 1,
    color: style.color ?? layer.iconColor,
    backgroundColor: style.backgroundColor ?? defaultBackground,
    borderColor: style.borderColor ?? "#aaa",
    borderStyle: style.borderWidth !== undefined ? "solid" : "dashed",
    borderWidth: style.borderWidth ?? 1,
    borderRadius: style.borderRadius,
    fontSize: style.fontSize,
    lineHeight: style.lineHeight,
    fontWeight: style.fontWeight,
    opacity: style.opacity,
    textAlign: style.textAlign,
    ...(image
      ? {
          backgroundImage: `url(${image})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }
      : {}),
    ...effectStyle(style),
  };
  const optionCount = Math.max(1, layer.optionCount ?? 1);

  return (
    <div className={`preview-element ${layer.kind}`} style={layerStyle}>
      {!container && (
        <div
          className={`preview-element-content ${layer.kind === "text" || layer.kind === "button" ? "planning-text-content" : ""}`}
          style={
            layer.kind === "text" || layer.kind === "button"
              ? {
                  textAlign: style.textAlign ?? "left",
                  justifyContent:
                    style.verticalAlign === "top"
                      ? "flex-start"
                      : style.verticalAlign === "bottom"
                        ? "flex-end"
                        : "center",
                }
              : undefined
          }
        >
          {image ? null : layer.kind === "image" ||
            layer.kind === "clipboard" ? (
            <span className="preview-image-placeholder">
              {layer.kind === "clipboard" ? "Clipboard" : "Image"}
            </span>
          ) : layer.kind === "checkbox" || layer.kind === "radio" ? (
            <span
              className={`preview-option-list ${layer.optionOrientation ?? "horizontal"}`}
            >
              {Array.from({ length: optionCount }, (_, optionIndex) => {
                const option = layer.optionItems?.[optionIndex] ?? {
                  display: `${layer.optionLabel ?? "Option"} ${optionIndex + 1}`,
                  value: "Option",
                };
                return (
                  <label key={optionIndex} className="preview-option-item">
                    <input
                      type={layer.kind}
                      name={layer.kind === "radio" ? layer.id : undefined}
                      value={option.value}
                    />
                    <span>{option.display}</span>
                  </label>
                );
              })}
            </span>
          ) : layer.kind === "select" ? (
            <SelectElement layer={layer} />
          ) : layer.kind === "icon" ? (
            <PreviewIcon layer={layer} />
          ) : layer.kind === "text" || layer.kind === "button" ? (
            <span className="planning-text-block">
              {document.layerText[layer.id] ?? layer.name}
            </span>
          ) : (
            layer.name
          )}
        </div>
      )}
      {container && layer.children?.length ? (
        <div className="preview-element-children">
          {layer.children.map((child, childIndex) => (
            <PreviewLayer
              key={child.id}
              layer={child}
              index={childIndex}
              document={document}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function PageCanvas({
  page,
  document,
}: {
  page: Layer;
  document: PreviewDocument;
}) {
  const size = document.sizes[page.id] ?? defaultSize("page");
  const pageStyle = document.layerStyles[page.id] ?? {};
  return (
    <div
      className="preview-page-canvas"
      style={{
        width: size.width,
        height: size.height,
        backgroundColor: pageStyle.backgroundColor ?? "#f7f4ef",
      }}
    >
      {page.children?.map((layer, index) => (
        <PreviewLayer
          key={layer.id}
          layer={layer}
          index={index}
          document={document}
        />
      ))}
    </div>
  );
}

export default function PreviewPage() {
  const [previewDocument, setPreviewDocument] =
    useState<PreviewDocument | null>(null);
  const [activePageId, setActivePageId] = useState("");
  const [scale, setScale] = useState(1);
  const [captureActive, setCaptureActive] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);

  const pages = useMemo(
    () =>
      previewDocument?.layers.filter(
        (layer) => layer.kind === "page" && layer.visible !== false,
      ) ?? [],
    [previewDocument],
  );
  const activePage = pages.find((page) => page.id === activePageId) ?? pages[0];
  const activeIndex = activePage
    ? pages.findIndex((page) => page.id === activePage.id)
    : -1;
  const activeSize = activePage
    ? (previewDocument?.sizes[activePage.id] ?? defaultSize("page"))
    : defaultSize("page");

  useEffect(() => {
    let received = false;
    let disposed = false;
    const nonce = new URLSearchParams(window.location.search).get(
      "previewNonce",
    );
    // Editor-launched previews must never substitute a saved document for the
    // unsaved snapshot. A direct URL without a nonce can still show saved data.
    if (!nonce) {
      void boardFetch("/api/projects?projectId=current")
        .then((r) => r.json())
        .then((data) => {
          if (!disposed && !received && data.board) {
            setPreviewDocument(data.board);
            setActivePageId(data.board.activePageId);
          }
        })
        .catch(() => {});
    }
    const receiveDocument = (event: MessageEvent) => {
      if (
        event.origin !== window.location.origin ||
        event.source !== window.opener ||
        !nonce ||
        event.data?.nonce !== nonce ||
        event.data?.type !== "plancraft:preview-document" ||
        !event.data.document ||
        !Array.isArray(event.data.document.layers)
      )
        return;
      received = true;
      const nextDocument = normalizeDocumentImages(
        event.data.document as PreviewDocument,
        boardScope(),
      );
      setPreviewDocument(nextDocument);
      const visiblePages = nextDocument.layers.filter(
        (layer) => layer.kind === "page" && layer.visible !== false,
      );
      setActivePageId(
        visiblePages.some((page) => page.id === nextDocument.activePageId)
          ? nextDocument.activePageId
          : (visiblePages[0]?.id ?? ""),
      );
    };
    window.addEventListener("message", receiveDocument);
    window.opener?.postMessage(
      {
        type: "plancraft:preview-ready",
        nonce,
      },
      window.location.origin,
    );
    return () => {
      disposed = true;
      window.removeEventListener("message", receiveDocument);
    };
  }, []);

  useEffect(() => {
    if (previewDocument) document.title = `${previewDocument.title} - 미리보기`;
  }, [previewDocument]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !activePage) return;
    const measure = () => {
      const rect = viewport.getBoundingClientRect();
      setScale(
        Math.max(
          0.1,
          Math.min(
            1,
            (rect.width - 80) / activeSize.width,
            (rect.height - 80) / activeSize.height,
          ),
        ),
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [activePage, activeSize.height, activeSize.width]);

  useEffect(() => {
    const navigate = (event: KeyboardEvent) => {
      if (
        captureActive ||
        document.querySelector(".preview-capture-overlay[open]")
      )
        return;
      if (
        event.target instanceof Element &&
        event.target.closest("input, select, textarea")
      )
        return;
      if (event.key === "Escape") window.close();
      if (event.key === "ArrowLeft" && activeIndex > 0) {
        setActivePageId(pages[activeIndex - 1].id);
      }
      if (event.key === "ArrowRight" && activeIndex < pages.length - 1) {
        setActivePageId(pages[activeIndex + 1].id);
      }
    };
    window.addEventListener("keydown", navigate);
    return () => window.removeEventListener("keydown", navigate);
  }, [activeIndex, pages, captureActive]);

  if (!previewDocument) {
    return (
      <main className="preview-empty">
        <div className="preview-empty-mark">P</div>
        <h1>미리보기 데이터를 기다리고 있습니다</h1>
        <p>편집기 헤더에서 미리보기를 다시 실행해 주세요.</p>
        <button type="button" onClick={() => window.close()}>
          창 닫기
        </button>
      </main>
    );
  }

  return (
    <main className="preview-shell">
      <header className="preview-header">
        <div className="preview-brand">
          <span>P</span>
          <strong>{previewDocument.title}</strong>
          <small>PREVIEW</small>
        </div>
        <div className="preview-navigation">
          <button
            type="button"
            aria-label="이전 페이지"
            disabled={captureActive || activeIndex <= 0}
            onClick={() => setActivePageId(pages[activeIndex - 1].id)}
          >
            ←
          </button>
          <span>
            {activeIndex + 1} / {pages.length}
          </span>
          <button
            type="button"
            aria-label="다음 페이지"
            disabled={captureActive || activeIndex >= pages.length - 1}
            onClick={() => setActivePageId(pages[activeIndex + 1].id)}
          >
            →
          </button>
        </div>
        <div className="preview-header-actions">
          <span>{Math.round(scale * 100)}%</span>
          {activePage && (
            <PreviewCapture
              key={`${activePage.id}:${scale}`}
              viewportRef={viewportRef}
              pageName={activePage.name}
              onActiveChange={setCaptureActive}
            />
          )}
          <button type="button" onClick={() => window.close()}>
            닫기
          </button>
        </div>
      </header>
      <div className="preview-body">
        <aside className="preview-pages">
          <h2>페이지</h2>
          <div className="preview-page-list">
            {pages.map((page, index) => {
              const size =
                previewDocument.sizes[page.id] ?? defaultSize("page");
              const thumbnailScale = Math.min(
                156 / size.width,
                104 / size.height,
              );
              return (
                <div
                  key={page.id}
                  className={`preview-page-item ${page.id === activePage?.id ? "active" : ""}`}
                >
                  <span
                    className="preview-thumbnail-viewport"
                    aria-hidden="true"
                    inert
                  >
                    <span
                      className="preview-thumbnail-stage"
                      style={{
                        width: size.width * thumbnailScale,
                        height: size.height * thumbnailScale,
                      }}
                    >
                      <span style={{ transform: `scale(${thumbnailScale})` }}>
                        <PageCanvas page={page} document={previewDocument} />
                      </span>
                    </span>
                  </span>
                  <button
                    type="button"
                    className="preview-page-trigger"
                    disabled={captureActive}
                    aria-current={
                      page.id === activePage?.id ? "page" : undefined
                    }
                    onClick={() => setActivePageId(page.id)}
                  >
                    <span className="preview-page-name">
                      <b>{index + 1}</b>
                      {page.name}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        </aside>
        <section className="preview-viewport" ref={viewportRef}>
          {activePage ? (
            <div
              className="preview-scaled-stage"
              style={{
                width: activeSize.width * scale,
                height: activeSize.height * scale,
              }}
            >
              <div style={{ transform: `scale(${scale})` }}>
                <PageCanvas page={activePage} document={previewDocument} />
              </div>
            </div>
          ) : (
            <p className="preview-no-pages">표시할 페이지가 없습니다.</p>
          )}
        </section>
      </div>
    </main>
  );
}
