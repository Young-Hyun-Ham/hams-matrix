import React, { useState, useMemo } from "react";
import styles from "./ApiTemplateModal.module.css"; // 기존 모달 스타일 재사용
import { useTranslation } from "@/app/(builder)/hooks/useTranslation";
import {
  Box,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from "@mui/material";

function ScenarioGroupModal({ isOpen, onClose, scenarios, onSelect }) {
  const { t } = useTranslation();
  const [sortOrder, setSortOrder] = useState("updated");
  const [period, setPeriod] = useState("all");
  const [searchName, setSearchName] = useState("");

  const baseScenarios = useMemo(() => {
    return (scenarios || []).filter((scenario) => !!scenario.depn_ver_id);
  }, [scenarios]);

  const filteredAndSortedScenarios = useMemo(() => {
    let result = [...baseScenarios];

    // Filter by name
    if (searchName.trim()) {
      const query = searchName.toLowerCase();
      result = result.filter((s) =>
        (s.name || "").toLowerCase().includes(query),
      );
    }

    // Filter by period (today, week, all)
    if (period === "today") {
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      result = result.filter((s) => {
        const date = s.updated_at || s.updatedAt;
        return date
          ? new Date(date).getTime() >= startOfToday.getTime()
          : false;
      });
    } else if (period === "week") {
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
      result = result.filter((s) => {
        const date = s.updated_at || s.updatedAt;
        return date ? new Date(date).getTime() >= oneWeekAgo.getTime() : false;
      });
    }

    // Sort by sortOrder
    if (sortOrder === "name") {
      result.sort((a, b) => {
        const nameA = a.name || "";
        const nameB = b.name || "";
        return nameA.localeCompare(nameB, "ko", { sensitivity: "base" });
      });
    } else if (sortOrder === "deployed") {
      result.sort((a, b) => {
        const valA = String(a.depn_ver_id || "");
        const valB = String(b.depn_ver_id || "");
        return valB.localeCompare(valA, undefined, { numeric: true });
      });
    } else {
      // 'updated' - Default: Sort descending by updated_at
      result.sort((a, b) => {
        const dateA = a.updated_at ? new Date(a.updated_at).getTime() : 0;
        const dateB = b.updated_at ? new Date(b.updated_at).getTime() : 0;
        return dateB - dateA;
      });
    }

    return result;
  }, [baseScenarios, searchName, period, sortOrder]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <button className={styles.closeButton} onClick={onClose}>
          &times;
        </button>
        <h2>{t("Import Scenario as Group")}</h2>
        <p
          style={{
            color: "#5e5adb",
            fontSize: "12.5px",
            marginTop: "4px",
            marginBottom: "16px",
            fontWeight: 500,
          }}
        >
          * Only deployed scenarios are listed here.
        </p>

        {/* Filter bar */}
        <Box sx={{ display: "flex", gap: 1.5, mb: 2, alignItems: "center" }}>
          <FormControl size="small" sx={{ minWidth: 130 }}>
            <InputLabel id="modal-sort-order-label">
              {t("Sort Order")}
            </InputLabel>
            <Select
              labelId="modal-sort-order-label"
              value={sortOrder}
              label={t("Sort Order")}
              onChange={(e) => setSortOrder(e.target.value)}
            >
              <MenuItem value="updated">{t("Last Updated")}</MenuItem>
              <MenuItem value="name">{t("Name")}</MenuItem>
              <MenuItem value="deployed">{t("Last Deployed")}</MenuItem>
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 110 }}>
            <InputLabel id="modal-period-label">{t("Period")}</InputLabel>
            <Select
              labelId="modal-period-label"
              value={period}
              label={t("Period")}
              onChange={(e) => setPeriod(e.target.value)}
            >
              <MenuItem value="all">{t("All")}</MenuItem>
              <MenuItem value="today">{t("Today")}</MenuItem>
              <MenuItem value="week">{t("1 Week")}</MenuItem>
            </Select>
          </FormControl>

          <TextField
            size="small"
            label={t("Name")}
            placeholder={t("Please enter your search scenario name")}
            value={searchName}
            onChange={(e) => setSearchName(e.target.value)}
            sx={{ flex: 1 }}
          />
        </Box>

        <div className={styles.templateList}>
          {filteredAndSortedScenarios.length > 0 ? (
            filteredAndSortedScenarios.map((scenario) => (
              <div key={scenario.id} className={styles.templateItem}>
                <span>{scenario.name}</span>
                <div className={styles.buttonGroup}>
                  <button
                    onClick={() => onSelect(scenario)}
                    className={styles.loadButton}
                  >
                    {t("Import")}
                  </button>
                </div>
              </div>
            ))
          ) : (
            <p className={styles.placeholder}>
              {t("No scenarios available to import")}.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default ScenarioGroupModal;
