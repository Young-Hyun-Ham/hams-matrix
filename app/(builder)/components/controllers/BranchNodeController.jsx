import styles from "../NodeController.module.css";
import { useNodeController } from "./hooks/useNodeController";
import { useTranslation } from "@/app/(builder)/hooks/useTranslation";

function BranchNodeController({ localNode, setLocalNode }) {
  const { t } = useTranslation();
  const { data } = localNode;
  const {
    handleLocalDataChange,
    addReply,
    updateReply,
    deleteReply,
    addCondition,
    updateCondition,
    deleteCondition,
  } = useNodeController(setLocalNode);

  return (
    <>
      <div className={styles.formGroup}>
        <label>{t("Branch Text")}</label>
        <textarea
          value={data.content || ""}
          onChange={(e) => handleLocalDataChange("content", e.target.value)}
          rows={4}
        />
      </div>
      <div className={styles.formGroup}>
        <label>{t("Evaluation Type")}</label>
        <select
          value={data.evaluationType || "BUTTON"}
          onChange={(e) =>
            handleLocalDataChange("evaluationType", e.target.value)
          }
        >
          <option value="BUTTON">{t("Button Click")}</option>
          <option value="CONDITION">{t("Slot Condition")}</option>
        </select>
      </div>
      {data.evaluationType === "CONDITION" ? (
        <div className={styles.formGroup}>
          <label>{t("Conditions")}</label>
          <div className={styles.repliesContainer}>
            {(data.conditions || []).map((cond, index) => (
              <div key={cond.id} className={styles.quickReply}>
                <input
                  className={styles.quickReplyInput}
                  value={cond.slot}
                  onChange={(e) =>
                    updateCondition(index, "slot", e.target.value)
                  }
                  placeholder="Slot Name"
                />
                <select
                  value={cond.operator}
                  onChange={(e) =>
                    updateCondition(index, "operator", e.target.value)
                  }
                >
                  <option value="==">==</option> <option value="!=">!=</option>{" "}
                  <option value=">">&gt;</option>{" "}
                  <option value="<">&lt;</option>{" "}
                  <option value=">=">&gt;=</option>{" "}
                  <option value="<=">&lt;=</option>{" "}
                  <option value="contains">{t("contains")}</option>{" "}
                  <option value="!contains">!{t("contains")}</option>
                </select>
                {/* --- 💡 수정된 부분 시작 --- */}
                <select
                  value={cond.valueType || "value"}
                  onChange={(e) =>
                    updateCondition(index, "valueType", e.target.value)
                  }
                >
                  <option value="value">{t("Value")}</option>
                  <option value="slot">{t("Slot")}</option>
                </select>
                <input
                  className={styles.quickReplyInput}
                  value={cond.value}
                  onChange={(e) =>
                    updateCondition(index, "value", e.target.value)
                  }
                  placeholder={
                    cond.valueType === "slot" ? t("Slot Name") : t("Value")
                  }
                />
                {/* --- 💡 수정된 부분 끝 --- */}
                <button
                  onClick={() => deleteCondition(index)}
                  className={styles.deleteReplyButton}
                >
                  ×
                </button>
              </div>
            ))}
            <button onClick={addCondition} className={styles.addReplyButton}>
              + {t("Add Condition")}
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.formGroup}>
          <label>{t("Branches")}</label>
          <div className={styles.repliesContainer}>
            {data.replies?.map((reply, index) => (
              <div key={reply.value || index} className={styles.quickReply}>
                <input
                  className={styles.quickReplyInput}
                  value={reply.display}
                  onChange={(e) =>
                    updateReply(index, "display", e.target.value)
                  }
                  placeholder="Display text"
                />
                <button
                  onClick={() => deleteReply(index)}
                  className={styles.deleteReplyButton}
                >
                  ×
                </button>
              </div>
            ))}
            <button onClick={addReply} className={styles.addReplyButton}>
              + {t("Add Branch")}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default BranchNodeController;
