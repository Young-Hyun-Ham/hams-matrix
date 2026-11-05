"use client";
import { uploadImage } from "../lib/upload-image";
import { layerIndex } from "../lib/editor-selection";
import { deleteSelection } from "../lib/editor-delete";
import { useProjectTemplates, templateRequest } from "../lib/template-api";
import { boardScope } from "../lib/client-api";
import { TemplateCreateDialog } from "./template-create-dialog";
import type { TemplateSummary } from "../types/templates";
import type { EmojiPreset } from "../data/emoji-presets";
import { boardFetch as fetch } from "@/app/(editor)/planning-board/lib/client-api";

import { useEffect, useMemo, useCallback, useRef } from "react";
import { CanvasEditor } from "@/app/(editor)/planning-board/components/canvas-editor";
import { EditorHeader } from "@/app/(editor)/planning-board/components/editor-header";
import {
  findLayerById,
  findLayerName,
  layers as initialLayers,
} from "@/app/(editor)/planning-board/components/editor-data";
import { LeftPanel } from "@/app/(editor)/planning-board/components/left-panel";
import { RightPanel } from "@/app/(editor)/planning-board/components/right-panel";
import {
  ReviewDialog,
  type ReviewDialogAction,
} from "@/app/(editor)/planning-board/components/review-dialog";
import type {
  GeneratedDocument,
  GeneratedElement,
  Layer,
  LayerPosition,
  LayerSize,
  LayerStyle,
  PreviewDocument,
} from "@/app/(editor)/planning-board/components/types";
import {
  usePlanningAccess,
  useEditorState,
} from "@/app/(editor)/planning-board/stores/editor-provider";
import type { ProjectAccessLevel } from "@/app/(editor)/planning-board/types/permissions";

const defaultLayerSize = (kind: Layer["kind"]): LayerSize =>
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

type EditorSnapshot = {
  title: string;
  layers: Layer[];
  sizes: Record<string, LayerSize>;
  positions: Record<string, LayerPosition>;
  layerText: Record<string, string>;
  layerImages: Record<string, string>;
  layerStyles: Record<string, LayerStyle>;
};

const cloneEditorSnapshot = (snapshot: EditorSnapshot): EditorSnapshot =>
  structuredClone(snapshot);

const isSameEditorSnapshot = (left: EditorSnapshot, right: EditorSnapshot) =>
  left.title === right.title &&
  left.layers === right.layers &&
  left.sizes === right.sizes &&
  left.positions === right.positions &&
  left.layerText === right.layerText &&
  left.layerImages === right.layerImages &&
  left.layerStyles === right.layerStyles;

function findPageId(
  items: Layer[],
  id: string,
  pageId = "",
): string | undefined {
  for (const item of items) {
    const currentPageId = item.kind === "page" ? item.id : pageId;
    if (item.id === id) return currentPageId;
    const found = item.children && findPageId(item.children, id, currentPageId);
    if (found) return found;
  }
}

function createAiDocument(
  title: string,
  layers: Layer[],
  sizes: Record<string, LayerSize>,
  positions: Record<string, LayerPosition>,
  layerText: Record<string, string>,
  layerStyles: Record<string, LayerStyle>,
  selected: string,
): GeneratedDocument {
  const pages = layers
    .filter((layer) => layer.kind === "page")
    .map((page, pageIndex) => {
      const pageSize = sizes[page.id] ?? defaultLayerSize("page");
      const elements: GeneratedElement[] = [];
      const appendElements = (items: Layer[], parentId: string) => {
        items.forEach((layer) => {
          if (layer.kind === "page" || layer.template) return;
          const size = sizes[layer.id] ?? defaultLayerSize(layer.kind);
          const position = positions[layer.id] ?? { x: 0, y: 0 };
          const style = layerStyles[layer.id] ?? {};
          elements.push({
            id: layer.id,
            parentId,
            name: layer.name,
            kind: layer.kind,
            text: layerText[layer.id] ?? layer.name,
            x: position.x,
            y: position.y,
            width: size.width,
            height: size.height,
            fontSize: style.fontSize ?? 14,
            lineHeight: style.lineHeight ?? 1.4,
            fontWeight: style.fontWeight ?? 400,
            color: style.color ?? "#18181b",
            backgroundColor: style.backgroundColor ?? "transparent",
            borderColor: style.borderColor ?? "transparent",
            borderWidth: style.borderWidth ?? 0,
            opacity: style.opacity ?? 1,
            borderRadius: style.borderRadius ?? 0,
            textAlign: style.textAlign ?? "left",
            verticalAlign: style.verticalAlign ?? "middle",
            effect: style.effect ?? "none",
            iconInstance: layer.iconInstance ?? "",
            iconSize: layer.iconSize ?? 22,
            iconType: layer.iconType ?? "",
            iconColor: layer.iconColor ?? style.color ?? "#18181b",
            optionLabel: layer.optionLabel ?? "Option",
            optionCount: Math.max(1, layer.optionCount ?? 1),
            optionOrientation: layer.optionOrientation ?? "horizontal",
            optionItems: layer.optionItems ?? [],
            selectMode: layer.selectMode ?? "single",
            visible: layer.visible !== false,
            locked: layer.locked === true,
          });
          if (layer.children) appendElements(layer.children, layer.id);
        });
      };
      appendElements(page.children ?? [], page.id);
      return {
        id: page.id,
        name: page.name,
        x: positions[page.id]?.x ?? pageIndex * 940,
        y: positions[page.id]?.y ?? 0,
        width: pageSize.width,
        height: pageSize.height,
        backgroundColor: layerStyles[page.id]?.backgroundColor ?? "#f7f4ef",
        visible: page.visible !== false,
        locked: page.locked === true,
        elements,
      };
    });
  return {
    title,
    activePageId: findPageId(layers, selected) ?? pages[0]?.id ?? "page",
    pages,
  };
}

function createEditorState(
  document: GeneratedDocument | PreviewDocument,
  currentImages: Record<string, string>,
) {
  if ("layers" in document)
    return {
      layers: document.layers,
      sizes: document.sizes,
      positions: document.positions,
      text: document.layerText,
      styles: document.layerStyles,
      images: document.layerImages,
    };
  const sizes: Record<string, LayerSize> = {};
  const positions: Record<string, LayerPosition> = {};
  const text: Record<string, string> = {};
  const styles: Record<string, LayerStyle> = {};
  const images: Record<string, string> = {};
  const layers: Layer[] = document.pages.map((page) => {
    sizes[page.id] = { width: page.width, height: page.height };
    positions[page.id] = { x: page.x, y: page.y };
    styles[page.id] = { backgroundColor: page.backgroundColor };
    const byId = new Map<string, Layer>();
    page.elements.forEach((element) => {
      const container = element.kind === "section" || element.kind === "layer";
      byId.set(element.id, {
        id: element.id,
        name: element.name,
        kind: element.kind,
        iconType: element.iconType,
        iconInstance: element.iconInstance,
        iconSize: element.iconSize,
        iconColor: element.iconColor,
        optionLabel: element.optionLabel,
        optionCount: element.optionCount,
        optionOrientation: element.optionOrientation,
        optionItems: element.optionItems,
        selectMode: element.selectMode ?? "single",
        visible: element.visible,
        locked: element.locked,
        children: container ? [] : undefined,
      });
      sizes[element.id] = { width: element.width, height: element.height };
      positions[element.id] = { x: element.x, y: element.y };
      styles[element.id] = {
        fontSize: element.fontSize,
        lineHeight: element.lineHeight,
        fontWeight: element.fontWeight,
        color: element.color,
        backgroundColor: element.backgroundColor,
        borderColor: element.borderColor,
        borderWidth: element.borderWidth,
        opacity: element.opacity,
        borderRadius: element.borderRadius,
        textAlign: element.textAlign,
        verticalAlign: element.verticalAlign ?? "middle",
        effect: element.effect,
      };
      if (element.kind === "text" || element.kind === "button") {
        text[element.id] = element.text;
      }
      if (
        (element.kind === "image" || element.kind === "clipboard") &&
        currentImages[element.id]
      )
        images[element.id] = currentImages[element.id];
    });
    const children: Layer[] = [];
    page.elements.forEach((element) => {
      const layer = byId.get(element.id);
      if (!layer) return;
      const parent = byId.get(element.parentId);
      if (parent && (parent.kind === "section" || parent.kind === "layer")) {
        parent.children?.push(layer);
      } else {
        children.push(layer);
      }
    });
    return {
      id: page.id,
      name: page.name,
      kind: "page",
      visible: page.visible,
      locked: page.locked,
      children,
    };
  });
  return { layers, sizes, positions, text, styles, images };
}

export default function Home() {
  const permission = usePlanningAccess((state) => state.canUpdate);
  const liveStatus = usePlanningAccess((state) => state.status);
  const aiEnabled = usePlanningAccess((state) => state.aiEnabled);
  const canCreateTemplate = usePlanningAccess(
    (state) => state.canCreateTemplate,
  );
  const projectTemplates = useProjectTemplates();
  const [templateOpen, setTemplateOpen] = useEditorState("templateOpen", false);
  const [templateBusy, setTemplateBusy] = useEditorState("templateBusy", false);
  const templateAttempt = useRef<{
    id: string;
    document: PreviewDocument & { schemaVersion: 1 };
  } | null>(null);
  const [selected, setSelected] = useEditorState("selected", "page");
  const [selectedIds, setSelectedIds] = useEditorState<string[]>(
    "selectedIds",
    ["page"],
  );
  const [selectionAnchor, setSelectionAnchor] = useEditorState(
    "selectionAnchor",
    "page",
  );
  const [layers, setLayers] = useEditorState<Layer[]>("layers", initialLayers);
  const [sizes, setSizes] = useEditorState<Record<string, LayerSize>>(
    "sizes",
    {},
  );
  const [positions, setPositions] = useEditorState<
    Record<string, LayerPosition>
  >("positions", {});
  const [layerText, setLayerText] = useEditorState<Record<string, string>>(
    "layerText",
    {},
  );
  const [layerImages, setLayerImages] = useEditorState<Record<string, string>>(
    "layerImages",
    {},
  );
  const [layerStyles, setLayerStyles] = useEditorState<
    Record<string, LayerStyle>
  >("layerStyles", {});
  const [prompt, setPrompt] = useEditorState("prompt", "");
  const [models, setModels] = useEditorState<string[]>("models", []);
  const [model, setModel] = useEditorState("model", "");
  const [modelsLoading, setModelsLoading] = useEditorState(
    "modelsLoading",
    true,
  );
  const [modelWarning, setModelWarning] = useEditorState("modelWarning", "");
  const [aiHistoryVersion, setAiHistoryVersion] = useEditorState(
    "aiHistoryVersion",
    0,
  );
  const [errorSnackbar, setErrorSnackbar] = useEditorState<{
    id: number;
    message: string;
  } | null>("errorSnackbar", null);
  const [generating, setGenerating] = useEditorState("generating", false);
  const [saving, setSaving] = useEditorState("saving", false);
  const [projectId, setProjectId] = useEditorState<string>("projectId");
  const [projectAccess, setProjectAccess] = useEditorState<ProjectAccessLevel>(
    "projectAccess",
    "view",
  );
  const [projectStatus, setProjectStatus] = useEditorState(
    "projectStatus",
    "draft",
  );
  const canEdit =
    permission &&
    !generating &&
    !saving &&
    !templateBusy &&
    projectAccess !== "view" &&
    projectStatus !== "review" &&
    liveStatus !== "review";
  const [isReviewer, setIsReviewer] = useEditorState("isReviewer", false);
  const [reviewDialog, setReviewDialog] = useEditorState<{
    action: ReviewDialogAction;
    loading: boolean;
    error: string;
  } | null>("reviewDialog", null);
  const [documentTitle, setDocumentTitle] = useEditorState(
    "documentTitle",
    "Page",
  );
  const [saved, setSaved] = useEditorState("saved", "저장됨");
  const [focusRequestKey, setFocusRequestKey] = useEditorState(
    "focusRequestKey",
    0,
  );
  const [focusPageId, setFocusPageId] = useEditorState("focusPageId", "page");
  const currentEditorSnapshot = useMemo<EditorSnapshot>(
    () => ({
      title: documentTitle,
      layers,
      sizes,
      positions,
      layerText,
      layerImages,
      layerStyles,
    }),
    [
      documentTitle,
      layers,
      sizes,
      positions,
      layerText,
      layerImages,
      layerStyles,
    ],
  );
  const savedSnapshot = useRef<string | null>(null);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (
        savedSnapshot.current !== null &&
        savedSnapshot.current !== JSON.stringify(currentEditorSnapshot)
      ) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [currentEditorSnapshot]);
  const undoHistory = useRef<EditorSnapshot[]>([]);
  const redoHistory = useRef<EditorSnapshot[]>([]);
  const activeSnapshot = useRef(currentEditorSnapshot);
  const accessCurrent = useRef(false);
  useEffect(() => {
    accessCurrent.current =
      permission &&
      projectAccess !== "view" &&
      projectStatus !== "review" &&
      liveStatus !== "review";
  }, [permission, projectAccess, projectStatus, liveStatus]);
  const historyGroupTimer = useRef<number | null>(null);
  const interactionHistory = useRef<{ recorded: boolean } | null>(null);
  const [historyStatus, setHistoryStatus] = useEditorState("historyStatus", {
    undo: 0,
    redo: 0,
  });
  const selectedName = useMemo(
    () => findLayerName(selected, layers),
    [selected, layers],
  );
  const selectedLayer = useMemo(
    () => findLayerById(selected, layers),
    [selected, layers],
  );
  const clearHistoryGroupTimer = () => {
    if (historyGroupTimer.current === null) return;
    window.clearTimeout(historyGroupTimer.current);
    historyGroupTimer.current = null;
  };
  const refreshHistoryControls = useCallback(() => {
    setHistoryStatus({
      undo: undoHistory.current.length,
      redo: redoHistory.current.length,
    });
  }, [setHistoryStatus]);
  const beginInteraction = () => {
    clearHistoryGroupTimer();
    interactionHistory.current = { recorded: false };
  };
  const endInteraction = () => {
    interactionHistory.current = null;
    clearHistoryGroupTimer();
  };
  const commitCanvasChange = (patch: Partial<EditorSnapshot>) => {
    if (!canEdit) return;
    const previous = activeSnapshot.current;
    if (!interactionHistory.current?.recorded) {
      clearHistoryGroupTimer();
      undoHistory.current.push(cloneEditorSnapshot(previous));
      if (undoHistory.current.length > 40) undoHistory.current.shift();
      redoHistory.current = [];
      if (interactionHistory.current)
        interactionHistory.current.recorded = true;
    }
    const next = { ...previous, ...patch };
    activeSnapshot.current = next;
    if (patch.layers) setLayers(patch.layers);
    if (patch.positions) setPositions(patch.positions);
    if (patch.sizes) setSizes(patch.sizes);
    if (patch.layerText) setLayerText(patch.layerText);
    if (patch.layerImages) setLayerImages(patch.layerImages);
    if (patch.layerStyles) setLayerStyles(patch.layerStyles);
    setSaved("수정됨 · 저장 필요");
    refreshHistoryControls();
  };
  const updateCanvasGeometry = (changes: {
    positions?: Record<string, LayerPosition>;
    sizes?: Record<string, LayerSize>;
  }) => {
    if (!canEdit) return;
    const index = layerIndex(activeSnapshot.current.layers);
    const changedPositions = Object.fromEntries(
      Object.entries(changes.positions ?? {}).filter(
        ([id, p]) =>
          index.has(id) &&
          !index.get(id)!.blocked &&
          (activeSnapshot.current.positions[id]?.x !== p.x ||
            activeSnapshot.current.positions[id]?.y !== p.y),
      ),
    );
    const changedSizes = Object.fromEntries(
      Object.entries(changes.sizes ?? {}).filter(
        ([id, s]) =>
          index.has(id) &&
          !index.get(id)!.blocked &&
          (activeSnapshot.current.sizes[id]?.width !== s.width ||
            activeSnapshot.current.sizes[id]?.height !== s.height),
      ),
    );
    if (
      !Object.keys(changedPositions).length &&
      !Object.keys(changedSizes).length
    )
      return;
    commitCanvasChange({
      ...(Object.keys(changedPositions).length
        ? {
            positions: {
              ...activeSnapshot.current.positions,
              ...changedPositions,
            },
          }
        : {}),
      ...(Object.keys(changedSizes).length
        ? { sizes: { ...activeSnapshot.current.sizes, ...changedSizes } }
        : {}),
    });
  };
  const addEmoji = (
    pageId: string,
    preset: EmojiPreset,
    position: LayerPosition,
  ) => {
    const entry = layerIndex(activeSnapshot.current.layers).get(pageId);
    if (!canEdit || !entry || entry.blocked || entry.layer.kind !== "page")
      return;
    const id = crypto.randomUUID();
    const nextLayers = activeSnapshot.current.layers.map((page) =>
      page.id === pageId
        ? {
            ...page,
            children: [
              ...(page.children ?? []),
              { id, name: preset.label, kind: "text" as const },
            ],
          }
        : page,
    );
    commitCanvasChange({
      layers: nextLayers,
      sizes: {
        ...activeSnapshot.current.sizes,
        [id]: { width: preset.size, height: preset.size },
      },
      positions: { ...activeSnapshot.current.positions, [id]: position },
      layerText: { ...activeSnapshot.current.layerText, [id]: preset.text },
      layerStyles: {
        ...activeSnapshot.current.layerStyles,
        [id]: preset.style,
      },
    });
    setSelected(id);
    setSelectedIds([id]);
    setSelectionAnchor(id);
  };
  const applyEditorSnapshot = (snapshot: EditorSnapshot) => {
    activeSnapshot.current = snapshot;
    setDocumentTitle(snapshot.title);
    setLayers(snapshot.layers);
    setSizes(snapshot.sizes);
    setPositions(snapshot.positions);
    setLayerText(snapshot.layerText);
    setLayerImages(snapshot.layerImages);
    setLayerStyles(snapshot.layerStyles);

    const nextSelected = findLayerById(selected, snapshot.layers)
      ? selected
      : (snapshot.layers.find((layer) => layer.kind === "page")?.id ?? "page");
    setSelected(nextSelected);
    setSelectedIds([nextSelected]);
    setSelectionAnchor(nextSelected);
  };
  const resetDocumentHistory = (snapshot: EditorSnapshot) => {
    clearHistoryGroupTimer();
    undoHistory.current = [];
    redoHistory.current = [];
    activeSnapshot.current = snapshot;
    refreshHistoryControls();
  };
  const undo = () => {
    if (!canEdit) return;
    clearHistoryGroupTimer();
    const snapshot = undoHistory.current.pop();
    if (!snapshot) return;
    redoHistory.current.push(cloneEditorSnapshot(activeSnapshot.current));
    if (redoHistory.current.length > 40) redoHistory.current.shift();
    applyEditorSnapshot(snapshot);
    setSaved("실행 취소됨");
    refreshHistoryControls();
  };
  const redo = () => {
    if (!canEdit) return;
    clearHistoryGroupTimer();
    const snapshot = redoHistory.current.pop();
    if (!snapshot) return;
    undoHistory.current.push(cloneEditorSnapshot(activeSnapshot.current));
    if (undoHistory.current.length > 40) undoHistory.current.shift();
    applyEditorSnapshot(snapshot);
    setSaved("다시 실행됨");
    refreshHistoryControls();
  };
  const openPreview = () => {
    const activePageId =
      findPageId(layers, selected) ??
      layers.find((layer) => layer.kind === "page")?.id ??
      "page";
    const previewDocument: PreviewDocument = {
      title: documentTitle,
      activePageId,
      layers,
      sizes,
      positions,
      layerText,
      layerImages,
      layerStyles,
    };
    const nonce = crypto.randomUUID();
    // Preserve projectId/screenId for access checks. The document itself is sent
    // through postMessage; the nonce pairs this window with that exact snapshot.
    const query = new URLSearchParams(window.location.search);
    query.set("previewNonce", nonce);
    const previewWindow = window.open(
      `/planning-board/preview?${query}`,
      "_blank",
    );
    if (!previewWindow) {
      setErrorSnackbar({
        id: Date.now(),
        message:
          "미리보기 창을 열 수 없습니다. 브라우저의 팝업 차단을 해제해 주세요.",
      });
      return;
    }

    const sendPreview = () => {
      if (previewWindow.closed) return;
      previewWindow.postMessage(
        {
          type: "plancraft:preview-document",
          nonce,
          document: previewDocument,
        },
        window.location.origin,
      );
    };
    const retryTimers = [250, 750, 1500].map((delay) =>
      window.setTimeout(sendPreview, delay),
    );
    const cleanup = () => {
      window.removeEventListener("message", receiveReady);
      retryTimers.forEach((timer) => window.clearTimeout(timer));
      window.clearTimeout(cleanupTimer);
    };
    const receiveReady = (event: MessageEvent) => {
      if (
        event.origin !== window.location.origin ||
        event.source !== previewWindow ||
        event.data?.type !== "plancraft:preview-ready" ||
        event.data?.nonce !== nonce
      )
        return;
      sendPreview();
      cleanup();
    };
    window.addEventListener("message", receiveReady);
    // A new development route can take longer than five seconds to compile.
    const cleanupTimer = window.setTimeout(cleanup, 60_000);
    sendPreview();
  };
  const selectLayer = (
    id: string,
    mode: "single" | "toggle" | "range" = "single",
    rangeIds: string[] = [],
  ) => {
    const nextSelectedIds =
      mode === "range" && rangeIds.length
        ? rangeIds
        : mode === "toggle"
          ? selectedIds.includes(id)
            ? selectedIds.length > 1
              ? selectedIds.filter((selectedId) => selectedId !== id)
              : selectedIds
            : [...selectedIds, id]
          : [id];
    const primaryId = nextSelectedIds.includes(id)
      ? id
      : (nextSelectedIds.at(-1) ?? id);
    setSelectedIds(nextSelectedIds);
    setSelected(primaryId);
    if (mode !== "range") setSelectionAnchor(id);
    if (findLayerById(primaryId, layers)?.kind === "page") {
      setFocusPageId(primaryId);
      setFocusRequestKey((current) => current + 1);
    }
  };

  useEffect(() => {
    if (!errorSnackbar) return;
    const timeout = window.setTimeout(() => setErrorSnackbar(null), 8_000);
    return () => window.clearTimeout(timeout);
  }, [errorSnackbar, setErrorSnackbar]);

  useEffect(() => {
    const previous = activeSnapshot.current;
    if (isSameEditorSnapshot(previous, currentEditorSnapshot)) return;

    if (historyGroupTimer.current === null) {
      undoHistory.current.push(cloneEditorSnapshot(previous));
      if (undoHistory.current.length > 40) undoHistory.current.shift();
      redoHistory.current = [];
    } else {
      window.clearTimeout(historyGroupTimer.current);
    }
    activeSnapshot.current = currentEditorSnapshot;
    historyGroupTimer.current = window.setTimeout(() => {
      historyGroupTimer.current = null;
    }, 350);
    refreshHistoryControls();
  }, [currentEditorSnapshot, refreshHistoryControls]);

  useEffect(
    () => () => {
      clearHistoryGroupTimer();
    },
    [],
  );

  useEffect(() => {
    if (!aiEnabled) return;

    const controller = new AbortController();
    fetch("/api/ai/models", { signal: controller.signal })
      .then(async (response) => {
        const result = (await response.json()) as {
          models?: string[];
          defaultModel?: string;
          message?: string;
        };
        if (!response.ok || !result.models?.length) {
          throw new Error(
            result.message ?? "AI 모델 목록을 불러오지 못했습니다.",
          );
        }
        setModels(result.models);
        setModel(result.defaultModel ?? result.models[0] ?? "");
        setModelWarning("");
      })
      .catch((error) => {
        if (error instanceof Error && error.name !== "AbortError") {
          setModelWarning(error.message);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setModelsLoading(false);
      });
    return () => controller.abort();
  }, [aiEnabled, setModel, setModelWarning, setModels, setModelsLoading]);

  useEffect(() => {
    const paste = (event: ClipboardEvent) => {
      if (!canEdit || selectedLayer?.locked) return;
      if (
        selectedLayer?.kind !== "clipboard" &&
        selectedLayer?.kind !== "image"
      )
        return;
      const file = Array.from(event.clipboardData?.files ?? []).find((item) =>
        item.type.startsWith("image/"),
      );
      if (!file) return;
      event.preventDefault();
      const reader = new FileReader();
      reader.onload = async () => {
        if (typeof reader.result === "string") {
          try {
            const url = await uploadImage(reader.result as string);
            setLayerImages((current) => ({ ...current, [selected]: url }));
          } catch (error) {
            setErrorSnackbar({
              id: Date.now(),
              message:
                error instanceof Error ? error.message : "이미지 첨부 실패",
            });
          }
          setSaved("클립보드 이미지 붙여넣음");
        }
      };
      reader.readAsDataURL(file);
    };
    window.addEventListener("paste", paste);
    return () => window.removeEventListener("paste", paste);
  }, [
    selected,
    selectedLayer?.kind,
    selectedLayer?.locked,
    canEdit,
    setErrorSnackbar,
    setLayerImages,
    setSaved,
  ]);

  const addLayer = (parentId: string, kind: Layer["kind"]) => {
    if (!canEdit || findLayerById(parentId, layers)?.locked) return;
    const id = `custom-${kind}-${crypto.randomUUID()}`;
    const labels = {
      page: "New Page",
      layer: "New Layer",
      section: "New Section",
      text: "New Text",
      image: "New Image",
      clipboard: "Clipboard Image",
      button: "New Button",
      checkbox: "New Checkbox",
      radio: "New Radio",
      select: "New Select",
      icon: "New Icon",
    };
    const layer: Layer = {
      id,
      name: labels[kind],
      kind,
      ...(kind === "select"
        ? {
            selectMode: "single" as const,
            optionItems: [{ display: "Option 1", value: "option-1" }],
          }
        : {}),
      ...(kind === "checkbox" || kind === "radio"
        ? {
            optionLabel: kind === "checkbox" ? "Checkbox" : "Radio",
            optionCount: 1,
            optionOrientation: "horizontal" as const,
            optionItems: [{ display: "Option 1", value: "Option" }],
          }
        : {}),
      children: kind === "layer" || kind === "section" ? [] : undefined,
    };
    const insertChild = (items: Layer[]): Layer[] =>
      items.map((item) =>
        item.id === parentId &&
        (item.kind === "page" ||
          item.kind === "section" ||
          item.kind === "layer")
          ? {
              ...item,
              children:
                kind === "section" || kind === "layer"
                  ? [
                      ...(item.children ?? []).filter(
                        (child) =>
                          child.kind === "section" || child.kind === "layer",
                      ),
                      layer,
                      ...(item.children ?? []).filter(
                        (child) =>
                          child.kind !== "section" && child.kind !== "layer",
                      ),
                    ]
                  : [...(item.children ?? []), layer],
            }
          : {
              ...item,
              children: item.children ? insertChild(item.children) : undefined,
            },
      );
    setLayers((current) => insertChild(current));
    const defaultSize =
      kind === "section" || kind === "layer"
        ? { width: 150, height: 100 }
        : kind === "text" || kind === "button" || kind === "select"
          ? { width: 110, height: 32 }
          : kind === "checkbox" || kind === "radio"
            ? { width: 140, height: 32 }
            : kind === "icon"
              ? { width: 32, height: 32 }
              : { width: 110, height: 80 };
    setSizes((current) => ({ ...current, [id]: defaultSize }));
    setPositions((current) => ({ ...current, [id]: { x: 0, y: 0 } }));
    setSelected(id);
    setSelectedIds([id]);
    setSelectionAnchor(id);
  };
  const moveLayersToParent = (ids: string[], parentId: string) => {
    if (
      !canEdit ||
      findLayerById(parentId, layers)?.locked ||
      ids.some((id) => findLayerById(id, layers)?.locked)
    )
      return;
    const movableIds = ids.filter(
      (id) => findLayerById(id, layers)?.kind !== "page",
    );
    const target = findLayerById(parentId, layers);
    if (
      !movableIds.length ||
      !target ||
      !["page", "layer", "section"].includes(target.kind)
    )
      return;

    const containsId = (layer: Layer, id: string): boolean =>
      layer.id === id ||
      Boolean(layer.children?.some((child) => containsId(child, id)));
    const topLevelIds = movableIds.filter((id) => {
      return !movableIds.some((otherId) => {
        if (otherId === id) return false;
        const other = findLayerById(otherId, layers);
        return other ? containsId(other, id) : false;
      });
    });
    if (
      topLevelIds.includes(parentId) ||
      topLevelIds.some((id) => {
        const layer = findLayerById(id, layers);
        return layer ? containsId(layer, parentId) : false;
      })
    )
      return;

    const pageRelativePositions = new Map<string, LayerPosition>();
    const collectRelativePositions = (
      items: Layer[],
      parentPosition: LayerPosition,
    ) => {
      items.forEach((item) => {
        const localPosition = positions[item.id] ?? { x: 0, y: 0 };
        const relativePosition =
          item.kind === "page"
            ? { x: 0, y: 0 }
            : {
                x: parentPosition.x + localPosition.x,
                y: parentPosition.y + localPosition.y,
              };
        pageRelativePositions.set(item.id, relativePosition);
        if (item.children) {
          collectRelativePositions(item.children, relativePosition);
        }
      });
    };
    collectRelativePositions(layers, { x: 0, y: 0 });
    const targetPosition = pageRelativePositions.get(parentId) ?? {
      x: 0,
      y: 0,
    };
    const movedPositions = Object.fromEntries(
      topLevelIds.map((id) => {
        const currentPosition = pageRelativePositions.get(id) ?? { x: 0, y: 0 };
        return [
          id,
          {
            x: currentPosition.x - targetPosition.x,
            y: currentPosition.y - targetPosition.y,
          },
        ];
      }),
    ) as Record<string, LayerPosition>;

    const moved: Layer[] = [];
    const removeMoved = (items: Layer[]): Layer[] =>
      items.flatMap((item) => {
        if (topLevelIds.includes(item.id)) {
          moved.push(item);
          return [];
        }
        return [
          {
            ...item,
            children: item.children ? removeMoved(item.children) : undefined,
          },
        ];
      });
    const insertMoved = (items: Layer[]): Layer[] =>
      items.map((item) => {
        if (item.id === parentId) {
          const currentChildren = item.children ?? [];
          const movedContainers = moved.filter(
            (child) => child.kind === "section" || child.kind === "layer",
          );
          const movedElements = moved.filter(
            (child) => child.kind !== "section" && child.kind !== "layer",
          );
          const firstElementIndex = currentChildren.findIndex(
            (child) => child.kind !== "section" && child.kind !== "layer",
          );
          const containerInsertIndex =
            firstElementIndex < 0 ? currentChildren.length : firstElementIndex;
          return {
            ...item,
            children: [
              ...currentChildren.slice(0, containerInsertIndex),
              ...movedContainers,
              ...currentChildren.slice(containerInsertIndex),
              ...movedElements,
            ],
          };
        }
        return {
          ...item,
          children: item.children ? insertMoved(item.children) : undefined,
        };
      });

    const withoutMoved = removeMoved(layers);
    setLayers(insertMoved(withoutMoved));
    setPositions((current) => ({ ...current, ...movedPositions }));
    setSelectedIds(topLevelIds);
    setSelected(topLevelIds.at(-1) ?? parentId);
    setSelectionAnchor(topLevelIds.at(-1) ?? parentId);
    if (target.kind === "page") {
      setFocusPageId(target.id);
      setFocusRequestKey((current) => current + 1);
    }
    setSaved("레이어 위치 변경됨");
  };
  const renameLayer = (id: string, name: string) => {
    if (!canEdit || findLayerById(id, layers)?.locked) return;
    const rename = (items: Layer[]): Layer[] =>
      items.map((item) =>
        item.id === id
          ? { ...item, name }
          : {
              ...item,
              children: item.children ? rename(item.children) : undefined,
            },
      );
    setLayers((current) => rename(current));
    setSaved("이름 수정됨");
  };
  const reorderLayer = (
    id: string,
    action: "front" | "forward" | "backward" | "back",
  ) => {
    const reorder = (items: Layer[]): Layer[] => {
      const index = items.findIndex((item) => item.id === id);
      if (index >= 0) {
        const next = [...items],
          target = next[index];
        let destination = index;
        if (action === "front") destination = next.length - 1;
        if (action === "forward")
          destination = Math.min(next.length - 1, index + 1);
        if (action === "backward") destination = Math.max(0, index - 1);
        if (action === "back") destination = 0;
        next.splice(index, 1);
        next.splice(destination, 0, target);
        return next;
      }
      return items.map((item) => ({
        ...item,
        children: item.children ? reorder(item.children) : undefined,
      }));
    };
    setLayers((current) => reorder(current));
    setSaved("레이어 순서 수정됨");
  };
  const deleteLayers = (ids: string[]) => {
    if (!canEdit) return false;
    try {
      const result = deleteSelection(activeSnapshot.current, ids);
      if (!result) return false;
      endInteraction();
      commitCanvasChange(result.document);
      setSelected(result.nextId);
      setSelectedIds([result.nextId]);
      setSelectionAnchor(result.nextId);
      const pageId =
        findPageId(result.document.layers, result.nextId) ??
        result.document.layers[0].id;
      setFocusPageId(pageId);
      return true;
    } catch (error) {
      setErrorSnackbar({
        id: Date.now(),
        message: error instanceof Error ? error.message : "Delete failed",
      });
      return false;
    }
  };
  const deleteLayer = (id: string) => deleteLayers([id]);
  const updateLayerState = (id: string, update: (layer: Layer) => Layer) => {
    const change = (items: Layer[]): Layer[] =>
      items.map((item) =>
        item.id === id
          ? update(item)
          : {
              ...item,
              children: item.children ? change(item.children) : undefined,
            },
      );
    setLayers((current) => change(current));
  };
  const toggleVisibility = (id: string) => {
    updateLayerState(id, (layer) => ({
      ...layer,
      visible: layer.visible === false,
    }));
    setSaved("표시 상태 변경됨");
  };
  const toggleLock = (id: string) => {
    updateLayerState(id, (layer) => ({ ...layer, locked: !layer.locked }));
    setSaved("잠금 상태 변경됨");
  };
  const addPage = () => {
    const id = `custom-page-${crypto.randomUUID()}`;
    const pageCount = layers.filter((item) => item.kind === "page").length;
    setLayers((current) => [
      ...current,
      {
        id,
        name: `Page ${current.filter((item) => item.kind === "page").length + 1}`,
        kind: "page",
        children: [],
      },
    ]);
    setPositions((current) => ({
      ...current,
      [id]: { x: pageCount * 940, y: 0 },
    }));
    setSelected(id);
    setSelectedIds([id]);
    setSelectionAnchor(id);
    setFocusPageId(id);
    setFocusRequestKey((current) => current + 1);
    setSaved("새 페이지 추가됨");
  };
  const applyTemplate = async (name: string) => {
    if (
      !canEdit ||
      !name ||
      !window.confirm(
        "현재 편집 내용을 템플릿으로 교체할까요? 저장 전까지 실행 취소할 수 있습니다.",
      )
    )
      return;
    const before = activeSnapshot.current;
    setTemplateBusy(true);
    try {
      const scope = boardScope();
      const result = name.startsWith("custom:")
        ? {
            template: (
              await templateRequest<{ document: PreviewDocument }>(
                `/api/planning/projects/${encodeURIComponent(scope.projectId)}/screens/${encodeURIComponent(scope.screenId)}/templates/${encodeURIComponent(name.slice(7))}/apply`,
                { method: "POST" },
              )
            ).document,
          }
        : {
            template: (
              await templateRequest<{ template: PreviewDocument }>(
                `/api/planning/templates/${encodeURIComponent(name.replace(/^builtin:/, ""))}`,
              )
            ).template,
          };
      if (
        !accessCurrent.current ||
        !isSameEditorSnapshot(before, activeSnapshot.current)
      )
        throw new Error("문서가 변경되었습니다. 템플릿을 다시 적용해 주세요.");
      undoHistory.current.push(cloneEditorSnapshot(currentEditorSnapshot));
      if (undoHistory.current.length > 40) undoHistory.current.shift();
      redoHistory.current = [];
      refreshHistoryControls();
      const state = createEditorState(result.template, {});
      applyEditorSnapshot({
        title: result.template.title,
        layers: state.layers,
        sizes: state.sizes,
        positions: state.positions,
        layerText: state.text,
        layerImages: state.images,
        layerStyles: state.styles,
      });
      setSelected(result.template.activePageId);
      setSelectedIds([result.template.activePageId]);
      setSaved("템플릿 적용됨 · 저장 필요");
    } catch (e) {
      setErrorSnackbar({
        id: Date.now(),
        message: e instanceof Error ? e.message : "템플릿 적용 실패",
      });
    } finally {
      setTemplateBusy(false);
    }
  };
  const saveProject = async () => {
    if (!permission || generating || saving) return false;
    if (projectStatus === "review") {
      setSaved("검토 중인 문서는 반려 또는 완료 전까지 저장할 수 없습니다.");
      return false;
    }
    if (projectAccess === "view") {
      setSaved("보기 전용 문서는 저장할 수 없습니다.");
      return false;
    }
    setSaving(true);
    setSaved("저장 중...");
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activePageId: findPageId(layers, selected) ?? layers[0].id,
          action: "save",
          projectId,
          title: documentTitle,
          prompt,
          layers,
          sizes,
          positions,
          layerText,
          layerImages,
          layerStyles,
          selected,
        }),
      });
      const result = (await response.json()) as {
        id?: string;
        saved?: boolean;
        access?: ProjectAccessLevel;
        error?: string;
      };
      if (!response.ok || !result.saved)
        throw new Error(result.error ?? "저장에 실패했습니다.");
      if (result.id) setProjectId(result.id);
      setProjectStatus("draft");
      if (result.access) setProjectAccess(result.access);
      savedSnapshot.current = JSON.stringify(currentEditorSnapshot);
      setSaved("Matrix에 저장됨");
      return true;
    } catch (error) {
      setSaved(error instanceof Error ? error.message : "저장 실패");
      return false;
    } finally {
      setSaving(false);
    }
  };
  const deleteSelectedPage = () => {
    if (
      selectedLayer?.kind !== "page" ||
      layers.filter((item) => item.kind === "page").length <= 1
    )
      return;
    deleteLayer(selectedLayer.id);
    setSaved("페이지 삭제됨");
  };
  const openProject = async (id: string, signal?: AbortSignal) => {
    setSaved("불러오는 중...");
    const response = await fetch(
      `/api/projects?projectId=${encodeURIComponent(id)}`,
      { signal },
    );
    const result = (await response.json()) as {
      access?: ProjectAccessLevel;
      project?: {
        id: string;
        title?: unknown;
        prompt?: unknown;
        layers?: unknown;
        sizes?: unknown;
        positions?: unknown;
        layerText?: unknown;
        layerImages?: unknown;
        layerStyles?: unknown;
        selected?: unknown;
        status?: unknown;
        review?: { message?: unknown } | null;
        isReviewer?: unknown;
      };
      error?: string;
    };
    if (!response.ok || !result.project)
      throw new Error(result.error ?? "문서를 불러오지 못했습니다.");
    const project = result.project;
    if (!Array.isArray(project.layers))
      throw new Error("저장된 레이어 데이터가 올바르지 않습니다.");
    const nextLayers = project.layers as Layer[];
    const nextSizes =
      project.sizes && typeof project.sizes === "object"
        ? (project.sizes as Record<string, LayerSize>)
        : {};
    const nextPositions =
      project.positions && typeof project.positions === "object"
        ? (project.positions as Record<string, LayerPosition>)
        : {};
    const nextLayerText =
      project.layerText && typeof project.layerText === "object"
        ? (project.layerText as Record<string, string>)
        : {};
    const nextLayerImages =
      project.layerImages && typeof project.layerImages === "object"
        ? (project.layerImages as Record<string, string>)
        : {};
    const nextLayerStyles =
      project.layerStyles && typeof project.layerStyles === "object"
        ? (project.layerStyles as Record<string, LayerStyle>)
        : {};
    const nextTitle =
      typeof project.title === "string" ? project.title : "Page";
    resetDocumentHistory({
      title: nextTitle,
      layers: nextLayers,
      sizes: nextSizes,
      positions: nextPositions,
      layerText: nextLayerText,
      layerImages: nextLayerImages,
      layerStyles: nextLayerStyles,
    });
    savedSnapshot.current = JSON.stringify({
      title: nextTitle,
      layers: nextLayers,
      sizes: nextSizes,
      positions: nextPositions,
      layerText: nextLayerText,
      layerImages: nextLayerImages,
      layerStyles: nextLayerStyles,
    });
    setLayers(nextLayers);
    setSizes(nextSizes);
    setPositions(nextPositions);
    setLayerText(nextLayerText);
    setLayerImages(nextLayerImages);
    setLayerStyles(nextLayerStyles);
    setPrompt(typeof project.prompt === "string" ? project.prompt : "");
    setDocumentTitle(nextTitle);
    setSelected(
      typeof project.selected === "string" ? project.selected : "page",
    );
    setSelectedIds([
      typeof project.selected === "string" ? project.selected : "page",
    ]);
    setSelectionAnchor(
      typeof project.selected === "string" ? project.selected : "page",
    );
    setProjectId(project.id);
    setProjectAccess(result.access ?? "view");
    const nextProjectStatus =
      typeof project.status === "string" ? project.status : "draft";
    const reviewMessage =
      typeof project.review?.message === "string"
        ? project.review.message.trim()
        : "";
    setProjectStatus(nextProjectStatus);
    setIsReviewer(project.isReviewer === true);
    setSaved(
      reviewMessage && nextProjectStatus === "rejected"
        ? `반려 의견: ${reviewMessage}`
        : reviewMessage && nextProjectStatus === "complete"
          ? `완료 의견: ${reviewMessage}`
          : result.access === "view"
            ? "보기 전용으로 불러옴"
            : "Matrix에서 불러옴",
    );
  };

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const projectIdParam = searchParams.get("projectId");
    const templateName = searchParams.get("template");
    if (!projectIdParam && !templateName) return;

    const controller = new AbortController();
    if (projectIdParam) {
      Promise.resolve()
        .then(() => openProject(projectIdParam, controller.signal))
        .catch((error) => {
          if (error instanceof Error && error.name !== "AbortError") {
            setSaved(error.message);
            setErrorSnackbar({ id: Date.now(), message: error.message });
          }
        });
      return () => controller.abort();
    }

    fetch(`/template-data?template=${encodeURIComponent(templateName!)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const result = (await response.json()) as {
          template?: GeneratedDocument;
          error?: string;
        };
        if (!response.ok || !result.template) {
          throw new Error(result.error ?? "템플릿을 불러오지 못했습니다.");
        }
        const nextState = createEditorState(result.template, {});
        const activePageId =
          result.template.activePageId || nextState.layers[0]?.id || "page";
        const snapshot = {
          title: result.template.title,
          layers: nextState.layers,
          sizes: nextState.sizes,
          positions: nextState.positions,
          layerText: nextState.text,
          layerImages: nextState.images,
          layerStyles: nextState.styles,
        };
        resetDocumentHistory(snapshot);
        applyEditorSnapshot(snapshot);
        setSelected(activePageId);
        setSelectedIds([activePageId]);
        setSelectionAnchor(activePageId);
        setFocusPageId(activePageId);
        setFocusRequestKey((current) => current + 1);
        // Preserve the screen binding.
        // Matrix access remains authoritative.
        setProjectStatus("draft");
        setIsReviewer(false);
        setSaved("템플릿에서 새 문서 생성됨");
      })
      .catch((error) => {
        if (error instanceof Error && error.name !== "AbortError") {
          setSaved(error.message);
          setErrorSnackbar({ id: Date.now(), message: error.message });
        }
      });
    return () => controller.abort();
    // URL의 최초 템플릿만 새 문서로 불러오며 편집 중 재실행하지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitReviewAction = async (values: {
    reviewerEmail: string;
    message: string;
  }) => {
    if (!reviewDialog) return;
    const action = reviewDialog.action;
    setReviewDialog((current) =>
      current ? { ...current, loading: true, error: "" } : current,
    );
    try {
      if (action === "save") {
        const documentSaved = await saveProject();
        if (!documentSaved) throw new Error("문서를 저장하지 못했습니다.");
        setProjectStatus("draft");
        setReviewDialog(null);
        return;
      }
      if (!projectId) throw new Error("문서를 먼저 저장해주세요.");
      if (!isReviewer && projectStatus !== "review") {
        const documentSaved = await saveProject();
        if (!documentSaved) {
          throw new Error(
            "문서를 먼저 저장하지 못해 승인 처리를 중단했습니다.",
          );
        }
      }
      const response = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/review`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            ...values,
            reassign: action === "request" && projectStatus === "review",
          }),
        },
      );
      const result = (await response.json()) as {
        status?: string;
        error?: string;
      };
      if (!response.ok || !result.status) {
        throw new Error(result.error ?? "검토 상태를 변경하지 못했습니다.");
      }
      setProjectStatus(result.status);
      setIsReviewer(false);
      window.dispatchEvent(new Event("focus"));
      setReviewDialog(null);
      setSaved(
        action === "request"
          ? "검토 요청됨"
          : action === "reject"
            ? "설계서 반려됨"
            : "설계서 완료됨",
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "검토 상태 변경 실패";
      setReviewDialog((current) =>
        current ? { ...current, loading: false, error: message } : current,
      );
    }
  };

  const generate = async () => {
    if (!canEdit) return;
    const requestPrompt = prompt.trim();
    const requestedModel = model;
    if (!requestPrompt || !requestedModel) return;
    setGenerating(true);
    setErrorSnackbar(null);
    setSaved(`${model}이 화면을 설계하는 중...`);
    try {
      const currentDocument = createAiDocument(
        documentTitle,
        layers,
        sizes,
        positions,
        layerText,
        layerStyles,
        selected,
      );
      const response = await fetch("/api/generate-screen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: requestPrompt,
          model: requestedModel,
          currentDocument,
          editorDocument: {
            schemaVersion: 1,
            ...currentEditorSnapshot,
            activePageId: currentDocument.activePageId,
          },
        }),
      });
      const result = (await response.json()) as {
        id?: string;
        access?: ProjectAccessLevel;
        document?: GeneratedDocument;
        model?: string;
        error?: string;
      };
      if (!response.ok || !result.document) {
        throw new Error(result.error ?? "AI 화면을 생성하지 못했습니다.");
      }

      const nextDocument = result.document;
      const nextState = createEditorState(nextDocument, layerImages);
      const nextLayers = nextState.layers;
      const nextSizes = nextState.sizes;
      const nextPositions = nextState.positions;
      const nextText = nextState.text;
      const nextStyles = nextState.styles;
      const nextImages = nextState.images;
      const pageId =
        nextLayers.find((page) => page.id === nextDocument.activePageId)?.id ??
        nextLayers.at(-1)?.id ??
        "page";

      savedSnapshot.current = JSON.stringify({
        title: nextDocument.title,
        layers: nextLayers,
        sizes: nextSizes,
        positions: nextPositions,
        layerText: nextText,
        layerImages: nextImages,
        layerStyles: nextStyles,
      });
      setLayers(nextLayers);
      setSizes(nextSizes);
      setPositions(nextPositions);
      setLayerText(nextText);
      setLayerImages(nextImages);
      setLayerStyles(nextStyles);
      setDocumentTitle(nextDocument.title);
      setSelected(pageId);
      setSelectedIds([pageId]);
      setSelectionAnchor(pageId);
      setFocusPageId(pageId);
      setFocusRequestKey((current) => current + 1);
      if (result.id) setProjectId(result.id);
      if (result.access) setProjectAccess(result.access);
      setProjectStatus("draft");
      setPrompt("");
      setAiHistoryVersion((current) => current + 1);
      setSaved(
        `${result.model ?? requestedModel} 화면 생성됨 · 프롬프트 기록 저장됨`,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "AI 화면 생성에 실패했습니다.";
      setSaved(message);
      setErrorSnackbar({ id: Date.now(), message });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <main className="app-shell">
      <EditorHeader
        templates={projectTemplates.templates}
        templateError={projectTemplates.error}
        onRefreshTemplates={() => {
          void projectTemplates.refresh();
        }}
        title={documentTitle}
        saved={saved}
        onTemplate={applyTemplate}
        canEdit={canEdit}
        onPreview={openPreview}
        projectId={projectId}
        access={projectAccess}
      />
      <section className="workspace">
        <LeftPanel
          canCreateTemplate={canCreateTemplate}
          onCreateTemplate={() => setTemplateOpen(true)}
          onDeleteMany={deleteLayers}
          title={documentTitle}
          onRenameTitle={(name) => {
            if (!canEdit) return;
            setDocumentTitle(name);
            setSaved("문서 제목 수정됨");
          }}
          layers={layers}
          selectedIds={selectedIds}
          selectionAnchor={selectionAnchor}
          onSelect={selectLayer}
          onMoveToParent={(...args) => {
            if (canEdit) moveLayersToParent(...args);
          }}
          onRename={(...args) => {
            if (canEdit) renameLayer(...args);
          }}
          onAdd={(parentId, kind) => {
            if (canEdit) addLayer(parentId, kind);
          }}
          onDelete={(id) => {
            if (canEdit) deleteLayer(id);
          }}
          onToggleVisibility={(id) => {
            if (canEdit) toggleVisibility(id);
          }}
          onToggleLock={(id) => {
            if (canEdit) toggleLock(id);
          }}
          onNewPage={() => {
            if (canEdit) addPage();
          }}
          onSave={() =>
            setReviewDialog({ action: "save", loading: false, error: "" })
          }
          onDeletePage={() => {
            if (canEdit) deleteSelectedPage();
          }}
          onOpenProject={openProject}
          canDeletePage={
            canEdit &&
            selectedLayer?.kind === "page" &&
            layers.filter((item) => item.kind === "page").length > 1
          }
          saving={saving}
          prompt={prompt}
          onPromptChange={(value) => {
            if (canEdit) setPrompt(value);
          }}
          models={models}
          model={model}
          onModelChange={setModel}
          modelsLoading={modelsLoading}
          modelWarning={modelWarning}
          projectId={projectId}
          aiHistoryVersion={aiHistoryVersion}
          onGenerate={generate}
          generating={generating}
          readOnly={!canEdit}
          projectStatus={projectStatus}
          isReviewer={isReviewer && projectStatus === "review"}
          canManageReview={projectAccess === "owner"}
          onReviewAction={(action) =>
            setReviewDialog({ action, loading: false, error: "" })
          }
        />
        <CanvasEditor
          onRemoveSelectItem={(id, index) => {
            const target = findLayerById(id, layers);
            if (
              !canEdit ||
              !target ||
              target.kind !== "select" ||
              target.locked
            )
              return;
            const removeItem = (items: Layer[]): Layer[] =>
              items.map((layer) =>
                layer.id === id
                  ? {
                      ...layer,
                      optionItems: (
                        layer.optionItems ?? [
                          { display: "Option", value: "option" },
                        ]
                      ).filter((_, itemIndex) => itemIndex !== index),
                    }
                  : {
                      ...layer,
                      children: layer.children
                        ? removeItem(layer.children)
                        : undefined,
                    },
              );
            endInteraction();
            commitCanvasChange({
              layers: removeItem(activeSnapshot.current.layers),
            });
            setSaved("선택박스 아이템 삭제됨");
          }}
          onDeleteMany={deleteLayers}
          selectedIds={selectedIds}
          onSelectMany={(ids) => {
            const next = ids.filter((id) => findLayerById(id, layers));
            const primary = next.at(-1) ?? layers[0]?.id ?? "page";
            setSelectedIds(next.length ? next : [primary]);
            setSelected(primary);
            setSelectionAnchor(primary);
          }}
          onGeometry={updateCanvasGeometry}
          onInteractionStart={beginInteraction}
          onInteractionEnd={endInteraction}
          onAddEmoji={addEmoji}
          collaborationReadOnly={!permission || projectAccess === "view"}
          projectId={projectId}
          focusRequestKey={focusRequestKey}
          focusPageId={focusPageId}
          layers={layers}
          sizes={sizes}
          positions={positions}
          layerText={layerText}
          layerImages={layerImages}
          layerStyles={layerStyles}
          onDelete={(id) => {
            if (canEdit) deleteLayer(id);
          }}
          onAdd={(...args) => {
            if (canEdit) addLayer(...args);
          }}
          onReorder={(...args) => {
            if (canEdit) reorderLayer(...args);
          }}
          onResize={(id, size) => {
            if (!canEdit) return;
            setSizes((current) => ({ ...current, [id]: size }));
            setSaved("크기 수정됨");
          }}
          selected={selected}
          onSelect={selectLayer}
          readOnly={!canEdit}
          canUndo={canEdit && historyStatus.undo > 0}
          canRedo={canEdit && historyStatus.redo > 0}
          onUndo={undo}
          onRedo={redo}
        />
        <RightPanel
          selectionCount={selectedIds.length}
          documentVersion={JSON.stringify(currentEditorSnapshot)}
          selectedName={selectedName}
          selectedLayer={selectedLayer}
          layerText={layerText[selected] ?? selectedName}
          imageSrc={layerImages[selected]}
          layerStyle={layerStyles[selected] ?? {}}
          size={sizes[selected]}
          position={positions[selected]}
          onLayerText={(value) => {
            if (!canEdit || selectedLayer?.locked) return;
            setLayerText((current) => ({ ...current, [selected]: value }));
            setSaved("텍스트 수정됨");
          }}
          onImage={(value) => {
            if (!canEdit || selectedLayer?.locked) return;
            setLayerImages((current) => ({ ...current, [selected]: value }));
            setSaved("이미지 변경됨");
          }}
          onSize={(size) => {
            if (!canEdit || selectedLayer?.locked) return;
            setSizes((current) => ({ ...current, [selected]: size }));
            setSaved("크기 수정됨");
          }}
          onPosition={(position) => {
            if (!canEdit || selectedLayer?.locked) return;
            setPositions((current) => ({ ...current, [selected]: position }));
            setSaved("위치 수정됨");
          }}
          onLayerStyle={(style) => {
            if (!canEdit || selectedLayer?.locked) return;
            setLayerStyles((current) => ({
              ...current,
              [selected]: { ...current[selected], ...style },
            }));
            setSaved("스타일 수정됨");
          }}
          onIconProperties={(properties) => {
            if (!canEdit || selectedLayer?.locked) return;
            updateLayerState(selected, (layer) => ({
              ...layer,
              ...properties,
            }));
            setSaved("아이콘 속성 수정됨");
          }}
          onOptionProperties={(properties) => {
            if (!canEdit || selectedLayer?.locked) return;
            updateLayerState(selected, (layer) => ({
              ...layer,
              ...properties,
            }));
            setSaved("선택 옵션 속성 수정됨");
          }}
          readOnly={!canEdit || selectedLayer?.locked === true}
        />
      </section>
      {reviewDialog && (
        <ReviewDialog
          open
          action={reviewDialog.action}
          loading={reviewDialog.loading}
          error={reviewDialog.error}
          onClose={() => setReviewDialog(null)}
          onSubmit={submitReviewAction}
        />
      )}
      {templateOpen && (
        <TemplateCreateDialog
          title={documentTitle}
          onClose={() => {
            setTemplateOpen(false);
            document
              .querySelector<HTMLButtonElement>(".page-more-button")
              ?.focus();
          }}
          onCreate={async (name, requestId) => {
            if (!canEdit || !canCreateTemplate)
              throw new Error("템플릿 생성 권한을 확인해 주세요.");
            if (templateAttempt.current?.id !== requestId)
              templateAttempt.current = {
                id: requestId,
                document: {
                  schemaVersion: 1,
                  ...cloneEditorSnapshot(activeSnapshot.current),
                  activePageId: findPageId(layers, selected) ?? layers[0].id,
                },
              };
            setTemplateBusy(true);
            try {
              const scope = boardScope();
              await templateRequest<{ template: TemplateSummary }>(
                `/api/planning/projects/${encodeURIComponent(scope.projectId)}/templates`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    name,
                    requestId,
                    sourceScreenId: scope.screenId,
                    document: templateAttempt.current.document,
                  }),
                },
              );
              projectTemplates.notify();
            } finally {
              setTemplateBusy(false);
            }
          }}
        />
      )}
      {errorSnackbar && (
        <div
          key={errorSnackbar.id}
          className="error-snackbar"
          role="alert"
          aria-live="assertive"
        >
          <span className="error-snackbar-icon" aria-hidden>
            !
          </span>
          <div className="error-snackbar-content">
            <strong>오류가 발생했습니다</strong>
            <p>{errorSnackbar.message}</p>
          </div>
          <button
            type="button"
            aria-label="오류 메시지 닫기"
            onClick={() => setErrorSnackbar(null)}
          >
            ×
          </button>
        </div>
      )}
    </main>
  );
}
