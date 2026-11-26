import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "@/app/(builder)/hooks/useTranslation";

import styles from "./SavedFormContentModal.module.css";

import type { SavedFormContent } from "../../type";

import {
  formDefinition,
  listForms,
  summarizeElements,
} from "../../../services/forms";
import { useBuilderAppearance } from "../../../components/BuilderAppearance";

interface SavedFormContentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (
    id: string,
    formData: SavedFormContent["form_elem"],
  ) => void | boolean | Promise<void | boolean>;
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

function SavedFormContentModal({
  isOpen,
  onClose,
  onSelect,
}: SavedFormContentModalProps) {
  const { t } = useTranslation();
  const theme = useBuilderAppearance();
  const [forms, setForms] = useState<SavedFormContent[]>([]);
  const [searchTitle, setSearchTitle] = useState("");
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let active = true;
    const fetchForms = async () => {
      setIsLoading(true);
      setErrorMessage("");
      try {
        const response = await listForms();
        if (!active) return;
        setForms(
          response.map((form) => ({
            form_id: form.id,
            form_tl: form.title,
            upd_dt: form.updatedAt,
            cre_dt: form.createdAt,
            cre_usr_id: "",
            upd_usr_id: "",
            form_elem: formDefinition(form),
          })),
        );
        setPage(1);
      } catch (error) {
        if (!active) return;
        setForms([]);
        setErrorMessage(
          error instanceof Error ? error.message : "폼을 불러오지 못했습니다.",
        );
      } finally {
        if (active) setIsLoading(false);
      }
    };

    if (isOpen) {
      fetchForms();
    }
    return () => {
      active = false;
    };
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

  const handleSelect = async (form: SavedFormContent) => {
    const accepted = await onSelect(
      form.form_id,
      form.form_elem || ({} as SavedFormContent["form_elem"]),
    );
    if (accepted !== false) onClose();
  };

  return (
    <div
      className={styles.modalOverlay}
      data-builder-theme={theme ?? undefined}
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
                      <td>
                        {summarizeElements(form.form_elem?.data?.elements)}
                      </td>
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
