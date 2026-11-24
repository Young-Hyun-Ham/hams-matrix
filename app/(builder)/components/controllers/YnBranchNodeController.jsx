import React from "react";
import styles from "../NodeController.module.css";
import { useNodeController } from "./hooks/useNodeController";
import { useTranslation } from "@/app/(builder)/hooks/useTranslation";

function YnBranchNodeController({ localNode, setLocalNode }) {
  const { t } = useTranslation();
  const { data } = localNode;
  const { handleLocalDataChange } = useNodeController(setLocalNode);

  return (
    <>
      <div className={styles.formGroup}>
        <label>{t("Referenced Slot Name") || "참조할 슬롯명"}</label>
        <input
          type="text"
          className={styles.quickReplyInput}
          value={data.slotKey || ""}
          onChange={(e) => handleLocalDataChange("slotKey", e.target.value)}
          placeholder={t("Enter Slot Name") || "슬롯명 입력"}
          style={{ width: "100%" }}
        />
        <p
          className={styles.instructionText}
          style={{ marginTop: "6px", fontSize: "0.8rem", color: "#64748b" }}
        >
          {t("YNBranchDescription") ||
            "지정한 슬롯의 값이 Y인 경우 Y 경로로, N인 경우 N 경로로 분기합니다."}
        </p>
      </div>
    </>
  );
}

export default YnBranchNodeController;
