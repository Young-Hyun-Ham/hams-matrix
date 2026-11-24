import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "@/app/(builder)/hooks/useTranslation";

import styles from "./SavedFormContentModal.module.css";

import type { SavedFormContent } from "../../type";

import { builderList } from "../../../services/transport";

interface SavedFormContentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (id: string, formData: SavedFormContent["form_elem"]) => void;
}

const PAGE_SIZE = 10;

// ISO 8601 형식의 날짜 문자열을 'YYYY-MM-DD HH:mm:ss' 형식으로 변환하는 함수
const formatDateTime = (value: string) => {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const pad = (number: number) => String(number).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(
    date.getSeconds(),
  )}`;
};

const extractSavedForms = (response: any): SavedFormContent[] => {
  if (Array.isArray(response)) return response as SavedFormContent[];
  if (!response || typeof response !== "object") return [];

  const responseData = response as Record<string, any>;
  const nextForms = responseData.forms || responseData.data;

  return Array.isArray(nextForms) ? (nextForms as SavedFormContent[]) : [];
};

function SavedFormContentModal({
  isOpen,
  onClose,
  onSelect,
}: SavedFormContentModalProps) {
  const { t } = useTranslation();
  const [forms, setForms] = useState<SavedFormContent[]>([]);
  const [searchTitle, setSearchTitle] = useState("");
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const fetchForms = async () => {
      setIsLoading(true);
      setErrorMessage("");
      try {
        const response: any = (await builderList("/forms")).map(
          (form: any) => ({
            form_id: form.id,
            form_tl: form.title,
            upd_dt: form.updatedAt,
            cre_dt: form.createdAt,
            form_elem: {
              ...form.definition,
              revision: form.revision,
              data: {
                ...form.definition?.data,
                id: form.definition?.data?.id ?? form.id,
                title: form.title,
                elements: form.elements,
              },
            },
          }),
        );
        setForms(extractSavedForms(response));
        setPage(1);
      } catch (error) {
        setForms([]);
        setErrorMessage(
          error instanceof Error
            ? error.message
            : t("Failed to load form content"),
        );
      } finally {
        setIsLoading(false);
      }
    };

    if (isOpen) {
      fetchForms();
    }
  }, [isOpen]);

  const filteredForms = useMemo(() => {
    const keyword = searchTitle.trim().toLowerCase();
    if (!keyword) return forms;

    return forms.filter((form) => form.form_tl.toLowerCase().includes(keyword));
  }, [forms, searchTitle]);

  const totalPages = Math.max(1, Math.ceil(filteredForms.length / PAGE_SIZE));
  const pagedForms = filteredForms.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE,
  );

  if (!isOpen) {
    return null;
  }

  const handleSelect = (form: SavedFormContent) => {
    onSelect(
      form.form_id,
      form.form_elem || ({} as SavedFormContent["form_elem"]),
    );
    onClose();
  };

  const formatElementSummary = (form: SavedFormContent) => {
    if (
      !form.form_elem ||
      typeof form.form_elem !== "object" ||
      !("data" in form.form_elem)
    ) {
      return;
    }
    const elements = form.form_elem?.data?.elements ?? [];
    if (elements.length === 0) return "-";

    const counts = elements.reduce<Record<string, number>>((acc, element) => {
      acc[element.type] = (acc[element.type] ?? 0) + 1;
      return acc;
    }, {});

    return Object.entries(counts)
      .map(([type, count]) => `${type} ${count}`)
      .join(", ");
  };

  return (
    <div
      className={styles.modalOverlay}
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={styles.modalContent}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
      >
        <button className={styles.closeButton} onClick={onClose}>
          &times;
        </button>

        <h2>{t("Saved Form Content")}</h2>

        <div className={styles.loadSection}>
          <div className={styles.searchPanel}>
            <label className={styles.searchLabel} htmlFor="form-title-search">
              {t("Content Title")}
            </label>
            <input
              id="form-title-search"
              className={styles.searchInput}
              type="text"
              value={searchTitle}
              onChange={(event) => {
                setSearchTitle(event.target.value);
                setPage(1);
              }}
              placeholder={t("Search by content title")}
            />
          </div>

          <div className={styles.tableWrap}>
            {isLoading ? (
              <p className={styles.placeholder}>
                {t("Loading form content")}...
              </p>
            ) : errorMessage ? (
              <p className={styles.placeholder}>{errorMessage}</p>
            ) : pagedForms.length > 0 ? (
              <table className={styles.formTable}>
                <thead>
                  <tr>
                    <th>No</th>
                    <th>{t("Content Id")}</th>
                    <th>{t("Content Title")}</th>
                    <th>{t("Element")}</th>
                    <th>{t("Created Actor")}</th>
                    <th>{t("Updated Actor")}</th>
                    <th>{t("Updated")}</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedForms.map((form, index) => (
                    <tr
                      key={form.form_id}
                      className={styles.formRow}
                      onDoubleClick={() => handleSelect(form)}
                    >
                      <td>{(page - 1) * PAGE_SIZE + index + 1}</td>
                      <td className={styles.monoCell}>{form.form_id}</td>
                      <td className={styles.titleCell}>{form.form_tl}</td>
                      <td>{formatElementSummary(form)}</td>
                      <td>{form.cre_usr_id}</td>
                      <td>{form.upd_usr_id}</td>
                      <td>{formatDateTime(form.upd_dt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className={styles.placeholder}>
                {t("No matching form content")}.
              </p>
            )}
          </div>

          <div className={styles.pagination}>
            <span className={styles.pageInfo}>
              {filteredForms.length === 0
                ? "0 items"
                : `${(page - 1) * PAGE_SIZE + 1}-${Math.min(
                    page * PAGE_SIZE,
                    filteredForms.length,
                  )} of ${filteredForms.length}`}
            </span>
            <div className={styles.pageButtons}>
              <button
                type="button"
                onClick={() => setPage(1)}
                disabled={page === 1}
              >
                {t(`First`)}
              </button>
              <button
                type="button"
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                disabled={page === 1}
              >
                {t(`Prev`)}
              </button>
              <span>
                {page} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() =>
                  setPage((prev) => Math.min(totalPages, prev + 1))
                }
                disabled={page === totalPages}
              >
                {t(`Next`)}
              </button>
              <button
                type="button"
                onClick={() => setPage(totalPages)}
                disabled={page === totalPages}
              >
                {t(`Last`)}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SavedFormContentModal;
