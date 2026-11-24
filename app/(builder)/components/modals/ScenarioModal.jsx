import { useState, useEffect } from "react";
import { useModal } from "@/app/(builder)/providers/ModalProvider";

import styles from "./ScenarioModal.module.css";
import { useTranslation } from "@/app/(builder)/hooks/useTranslation";

function ScenarioModal({ isOpen, onClose, onSave, scenario }) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  // <<< [수정] job 상태 제거 >>>
  // const [job, setJob] = useState('Batch');
  const [description, setDescription] = useState("");
  const { showAlert } = useModal();

  const isEditMode = !!scenario;

  useEffect(() => {
    if (isOpen) {
      if (isEditMode) {
        setName(scenario.name || "");
        // <<< [수정] job 상태 설정 제거 >>>
        // setJob(scenario.job || 'Batch');
        setDescription(scenario.description || "");
      } else {
        setName("");
        // <<< [수정] job 상태 설정 제거 >>>
        // setJob('Batch');
        setDescription("");
      }
    }
  }, [isOpen, scenario, isEditMode]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (name.trim()) {
      const jobToSave = isEditMode ? scenario.job || "Process" : "Process";
      onSave({
        name: name.trim(),
        job: jobToSave,
        description: description.trim(),
      });
    } else {
      showAlert(t("Please enter a scenario name."));
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <h2>{isEditMode ? t("Edit Scenario") : t("Create New Scenario")}</h2>
        {/* <<< [수정] 문구에서 Job Type 제거 --- */}
        <p>
          {isEditMode
            ? t("Edit the name and description of your scenario")
            : t(
                "Enter a name and optionally add a description for your new scenario",
              )}
        </p>
        {/* --- [수정 끝] >>> */}
        <form onSubmit={handleSubmit}>
          <label className={styles.label}>{t("Name")}</label>
          <input
            type="text"
            className={styles.input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("Scenario Name")}
            autoFocus
          />
          {/* --- 👇 [수정] Job Type 선택 UI 숨김 --- */}
          {/*
          <label className={styles.label}>Job Type</label>
          <select
            className={styles.input}
            value={job}
            onChange={(e) => setJob(e.target.value)}
          >
            <option value="Batch">Batch</option>
            <option value="Process">Process</option>
            <option value="Long Transaction">Long Transaction</option>
          </select>
          */}
          {/* --- 👆 [수정 끝] --- */}
          <label className={styles.label}>
            {t("Description")} ({t("Optional")})
          </label>
          <textarea
            className={styles.input}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("Enter a brief description for the scenario")}
            rows={3}
            style={{ resize: "vertical" }}
          />
          <div className={styles.buttonGroup}>
            <button
              type="button"
              className={styles.cancelButton}
              onClick={onClose}
            >
              {t("Cancel")}
            </button>
            <button type="submit" className={styles.createButton}>
              {isEditMode ? t("Save") : t("Create")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ScenarioModal;
