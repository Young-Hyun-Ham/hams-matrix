import { useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./editor-icon";
import {
  downloadCapture,
  previewCapture,
  type CaptureRegion,
} from "../lib/preview-capture";

type Bounds = { left: number; top: number; width: number; height: number };
type Point = { x: number; y: number };

function CaptureSelection({
  bounds,
  onCancel,
  onCapture,
}: {
  bounds: Bounds;
  onCancel: () => void;
  onCapture: (region: CaptureRegion) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const start = useRef<Point | null>(null);
  const [box, setBox] = useState<CaptureRegion | null>(null);
  useEffect(() => {
    if (dialog.current && !dialog.current.open) dialog.current.showModal();
  }, []);
  useEffect(() => {
    window.addEventListener("resize", onCancel);
    return () => window.removeEventListener("resize", onCancel);
  }, [onCancel]);
  const point = (x: number, y: number) => ({
    x: Math.max(0, Math.min(bounds.width, x - bounds.left)),
    y: Math.max(0, Math.min(bounds.height, y - bounds.top)),
  });
  const rectangle = (end: Point): CaptureRegion => ({
    x: Math.min(start.current!.x, end.x),
    y: Math.min(start.current!.y, end.y),
    width: Math.abs(start.current!.x - end.x),
    height: Math.abs(start.current!.y - end.y),
  });
  return createPortal(
    <dialog
      ref={dialog}
      className="preview-capture-overlay"
      aria-label="캡처 영역 선택"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <div className="preview-capture-instructions">
        <span>페이지에서 캡처할 영역을 드래그하세요 · ESC 취소</span>
        <button type="button" autoFocus onClick={onCancel}>
          취소
        </button>
      </div>
      <div
        className="preview-capture-area"
        style={bounds}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          start.current = point(event.clientX, event.clientY);
          setBox(null);
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (start.current)
            setBox(rectangle(point(event.clientX, event.clientY)));
        }}
        onPointerUp={(event) => {
          if (!start.current) return;
          const selected = rectangle(point(event.clientX, event.clientY));
          start.current = null;
          setBox(null);
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
          if (selected.width < 2 || selected.height < 2) return;
          onCapture({
            x: selected.x / bounds.width,
            y: selected.y / bounds.height,
            width: selected.width / bounds.width,
            height: selected.height / bounds.height,
          });
        }}
        onPointerCancel={() => {
          start.current = null;
          setBox(null);
        }}
      >
        {box && (
          <div
            className="preview-capture-selection"
            style={{
              left: box.x,
              top: box.y,
              width: box.width,
              height: box.height,
            }}
          />
        )}
      </div>
    </dialog>,
    document.body,
  );
}

export function PreviewCapture({
  viewportRef,
  pageName,
  onActiveChange,
}: {
  viewportRef: RefObject<HTMLDivElement | null>;
  pageName: string;
  onActiveChange: (active: boolean) => void;
}) {
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const working = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    onActiveChange(busy || !!bounds);
    return () => onActiveChange(false);
  }, [busy, bounds, onActiveChange]);
  const page = () =>
    viewportRef.current?.querySelector<HTMLElement>(".preview-page-canvas");
  const capture = async (region?: CaptureRegion) => {
    if (working.current) return;
    const node = page();
    if (!node) {
      setError("캡처할 페이지가 없습니다.");
      return;
    }
    working.current = true;
    setBusy(true);
    setBounds(null);
    setError("");
    try {
      const blob = await previewCapture(node, region);
      if (mounted.current) downloadCapture(blob, pageName, !!region);
    } catch (error) {
      if (mounted.current)
        setError(
          error instanceof Error
            ? error.message
            : "캡처에 실패했습니다. 다시 시도해 주세요.",
        );
    } finally {
      working.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  return (
    <>
      <button
        type="button"
        className="preview-capture-button"
        aria-label="페이지 캡처"
        title="페이지 캡처 (PNG)"
        disabled={busy || !!bounds}
        onClick={() => void capture()}
      >
        <Icon name="capturePage" />
      </button>
      <button
        type="button"
        className="preview-capture-button"
        aria-label="영역 선택 캡처"
        title="영역 선택 캡처 (PNG)"
        disabled={busy || !!bounds}
        onClick={() => {
          const node = page();
          if (!node) {
            setError("캡처할 페이지가 없습니다.");
            return;
          }
          const rect = node.getBoundingClientRect();
          setError("");
          setBounds({
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
          });
        }}
      >
        <Icon name="captureRegion" />
      </button>
      {busy && <span role="status">캡처 중...</span>}
      {bounds && (
        <CaptureSelection
          bounds={bounds}
          onCancel={() => setBounds(null)}
          onCapture={(region) => void capture(region)}
        />
      )}
      {error && (
        <span className="preview-capture-error" role="alert">
          {error}
        </span>
      )}
    </>
  );
}
