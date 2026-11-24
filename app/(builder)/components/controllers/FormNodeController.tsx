import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import CloseIcon from "@mui/icons-material/Close";
import { useTranslation } from "@/app/(builder)/hooks/useTranslation";

import styles from "../NodeController.module.css";
import SavedFormContentModal from "../../form-builder/components/modals/SavedFormContentModal";
import RightPanel from "../../form-builder/components/RightPanel";
import {
  ElementType,
  FormDataJson,
  FormElement,
} from "../../form-builder/type";
import { FORM_ELEMENT_TYPES } from "../../form-builder/stores/elementRegistry";
import { useFormEditorStore } from "../../form-builder/stores/useFormEditorStore";

import type { DragEvent } from "react";

import { useModal } from "@/app/(builder)/providers/ModalProvider";

function FormNodeController({
  localNode,
  setLocalNode,
  publishing = false,
}: any) {
  const { t } = useTranslation();
  const { showConfirm } = useModal();
  const [draggedItemIndex, setDraggedItemIndex] = useState<number | null>(null);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  const formId = useFormEditorStore((state) => state.formId);
  const setFormId = useFormEditorStore((state) => state.setFormId);
  const title = useFormEditorStore((state) => state.title);
  const elements = useFormEditorStore((state) => state.elements);
  const selectedElementId = useFormEditorStore(
    (state) => state.selectedElementId,
  );
  const setTitle = useFormEditorStore((state) => state.setTitle);
  const selectElement = useFormEditorStore((state) => state.selectElement);
  const addElement = useFormEditorStore((state) => state.addElement);
  const removeElement = useFormEditorStore((state) => state.removeElement);
  const moveElement = useFormEditorStore((state) => state.moveElement);
  const replaceForm = useFormEditorStore((state) => state.replaceForm);
  const saveForm = useFormEditorStore((state) => state.saveForm);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    replaceForm({
      id: localNode.data.id,
      formId: localNode.data.formId ?? null,
      title: localNode.data.title || "",
      elements: localNode.data.elements || [],
    });
  }, [localNode.id, localNode.data.formId, replaceForm]);

  useEffect(() => {
    const unsubscribe = useFormEditorStore.subscribe((state, previousState) => {
      if (
        state.formId === previousState.formId &&
        state.title === previousState.title &&
        state.elements === previousState.elements
      ) {
        return;
      }

      setLocalNode((prev: any) => ({
        ...prev,
        data: {
          ...prev.data,
          formId: state.formId,
          title: state.title,
          elements: state.elements,
        },
      }));
    });

    return unsubscribe;
  }, [setLocalNode]);

  useEffect(() => {
    const nextTitle = localNode.data.title || "";
    if (useFormEditorStore.getState().title !== nextTitle) setTitle(nextTitle);
  }, [localNode.data.title, setTitle]);

  const isFullFormData = (obj: Partial<FormDataJson>): obj is FormDataJson => {
    return (
      obj !== null &&
      typeof obj === "object" &&
      "data" in obj &&
      obj.data !== undefined &&
      "id" in obj.data
    );
  };

  const handleLoadSavedFormContent = (
    id: string,
    formElem: Partial<FormDataJson>,
  ) => {
    if (!formElem || typeof formElem !== "object" || !formElem.data) return;

    replaceForm({
      id: formElem.data.id,
      formId: id,
      title: formElem.data.title || "",
      elements: Array.isArray(formElem.data.elements)
        ? formElem.data.elements
        : [],
    });

    if (isFullFormData(formElem)) {
      setLocalNode((prev: any) => ({
        ...prev,
        data: {
          ...prev.data,
          formId: id,
          id: formElem.data.id ?? prev.data.id,
          title: formElem.data.title ?? prev.data.title,
          elements: Array.isArray(formElem.data.elements)
            ? formElem.data.elements
            : [],
          dataSource: formElem.data.dataSource ?? prev.data.dataSource,
          dataSourceType:
            formElem.data.dataSourceType ?? prev.data.dataSourceType,
          enableExcelUpload:
            formElem.data.enableExcelUpload ?? prev.data.enableExcelUpload,
        },
      }));
    } else {
      setLocalNode((prev: any) => ({
        ...prev,
        data: {
          ...prev.data,
        },
      }));
    }

    setIsTemplateModalOpen(false);
  };

  const handleDragStart = (index: number) => {
    setDraggedItemIndex(index);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  const handleDrop = (index: number) => {
    if (draggedItemIndex === null || draggedItemIndex === index) return;

    const activeElement = elements[draggedItemIndex];
    const overElement = elements[index];

    if (activeElement && overElement) {
      moveElement(activeElement.id, overElement.id);
    }

    setDraggedItemIndex(null);
  };

  const handleSaveToTemplate = async () => {
    const confirmed = await showConfirm(t("Do you want to save the Form?"));
    if (!confirmed) return false;

    const formData: FormDataJson = {
      id: localNode.data.id,
      data: {
        id: localNode.data.id,
        title,
        elements,
        dataSource: localNode.data.dataSource ?? "",
        dataSourceType: localNode.data.dataSourceType ?? "json",
        enableExcelUpload: localNode.data.enableExcelUpload ?? false,
      },
      type: "form",
      width: 320,
      height: 597,
      dragging: false,
      selected: false,
    };

    await saveForm(formData);
  };

  return (
    <>
      {isMounted &&
        isTemplateModalOpen &&
        createPortal(
          <SavedFormContentModal
            isOpen={isTemplateModalOpen}
            onClose={() => setIsTemplateModalOpen(false)}
            onSelect={handleLoadSavedFormContent}
          />,
          document.body,
        )}

      <div className={styles.templateActions}>
        <button onClick={() => setIsTemplateModalOpen(true)}>
          {t("Templates")}
        </button>
      </div>
      <div className={styles.separator} />

      <div className={styles.formGroup}>
        <label htmlFor="form-node-id">{t("Form ID")}</label>
        <input id="form-node-id" type="text" value={formId ?? " "} disabled />
        <button
          className={styles.saveToTemplateButton}
          onClick={handleSaveToTemplate}
        >
          {t("Save to template")}
        </button>
        <label htmlFor="form-node-title">{t("Form Title")}</label>
        <input
          id="form-node-title"
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>

      <div className={styles.formGroup}>
        <div
          style={{
            fontSize: "0.8rem",
            fontWeight: "bold",
            color: publishing ? "var(--builder-text)" : "#555",
          }}
        >
          {t("Add Element")}
        </div>
        <div className={styles.elementTabs}>
          {FORM_ELEMENT_TYPES.map((type: ElementType) =>
            // search type is not supported in the current implementation
            type !== "search" ? (
              <button key={type} onClick={() => addElement(type)}>
                {type}
              </button>
            ) : null,
          )}
        </div>
      </div>
      <div className={styles.separator} />

      <div className={styles.formGroup}>
        <div
          style={{
            fontSize: "0.8rem",
            fontWeight: "bold",
            color: publishing ? "var(--builder-text)" : "#555",
          }}
        >
          {t("Elements List")}
        </div>
        <div className={styles.elementsContainer}>
          {elements.length > 0 ? (
            elements.map((element: FormElement, index: number) => (
              <div
                key={element.id}
                className={`${styles.elementItem} ${
                  element.id === selectedElementId ? styles.selected : ""
                }`}
                role="button"
                tabIndex={0}
                onClick={() => selectElement(element.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    selectElement(element.id);
                  }
                }}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragOver={handleDragOver}
                onDrop={() => handleDrop(index)}
              >
                <div className={styles.elementItemContent}>
                  <span>{element.label || element.type}</span>
                  <span className={styles.elementType}>({element.type})</span>
                </div>
                <button
                  className={styles.elementDeleteButton}
                  aria-label="Delete element"
                  onClick={(event) => {
                    event.stopPropagation();
                    removeElement(element.id);
                  }}
                >
                  <CloseIcon fontSize="small" aria-hidden="true" />
                </button>
              </div>
            ))
          ) : (
            <p className={styles.placeholder}>{t("No elements added yet")}.</p>
          )}
        </div>
      </div>

      {selectedElementId && <RightPanel showHeader={false} />}
    </>
  );
}

export default FormNodeController;
