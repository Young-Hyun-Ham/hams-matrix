import styles from "../NodeController.module.css";
import { useTranslation } from "@/app/(builder)/hooks/useTranslation";

function DefaultNodeController({ localNode, setLocalNode }) {
  const { type, data } = localNode;
  const { t } = useTranslation();

  const handleLocalDataChange = (key, value) => {
    setLocalNode((prev) => ({
      ...prev,
      data: { ...prev.data, [key]: value },
    }));
  };

  const localAddReply = () => {
    setLocalNode((prev) => {
      const newNode = { ...prev };
      const nodeType = newNode.type;
      const newReply = {
        display:
          nodeType === "branch"
            ? "New condition"
            : nodeType === "fixedmenu"
              ? "New menu"
              : "New reply",
        value: `${nodeType === "branch" ? "cond" : nodeType === "fixedmenu" ? "menu" : "val"}_${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      };
      const newReplies = [...(newNode.data.replies || []), newReply];
      newNode.data.replies = newReplies;
      return newNode;
    });
  };

  const localUpdateReply = (index, part, value) => {
    setLocalNode((prev) => {
      const newNode = { ...prev };
      const newReplies = [...newNode.data.replies];
      newReplies[index] = { ...newReplies[index], [part]: value };
      newNode.data.replies = newReplies;
      return newNode;
    });
  };

  const localDeleteReply = (index) => {
    setLocalNode((prev) => {
      const newNode = { ...prev };
      const newReplies = newNode.data.replies.filter((_, i) => i !== index);
      newNode.data.replies = newReplies;
      return newNode;
    });
  };

  const handleConditionChange = (index, part, value) => {
    setLocalNode((prev) => {
      const newNode = { ...prev };
      const newConditions = [...(newNode.data.conditions || [])];
      newConditions[index] = { ...newConditions[index], [part]: value };
      newNode.data.conditions = newConditions;
      return newNode;
    });
  };

  const addCondition = () => {
    setLocalNode((prev) => {
      const newNode = { ...prev };
      const newCondition = {
        id: `cond-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        slot: "",
        operator: "==",
        value: "",
      };
      const newConditions = [...(newNode.data.conditions || []), newCondition];
      newNode.data.conditions = newConditions;

      const newReply = {
        display: `Condition ${newConditions.length}`,
        value: `cond_${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      };
      const newReplies = [...(newNode.data.replies || []), newReply];
      newNode.data.replies = newReplies;

      return newNode;
    });
  };

  const deleteCondition = (index) => {
    setLocalNode((prev) => {
      const newNode = { ...prev };
      const newConditions = newNode.data.conditions.filter(
        (_, i) => i !== index,
      );
      newNode.data.conditions = newConditions;

      const newReplies = newNode.data.replies.filter((_, i) => i !== index);
      newNode.data.replies = newReplies;

      return newNode;
    });
  };

  return (
    <>
      <div className={styles.formGroup}>
        <label>{t("Content")}</label>
        <textarea
          value={data.content || ""}
          onChange={(e) => handleLocalDataChange("content", e.target.value)}
          rows={4}
        />
      </div>

      {type === "link" && (
        <div className={styles.formGroup}>
          <label>{t("Display Text")}</label>
          <input
            type="text"
            value={data.display || ""}
            onChange={(e) => handleLocalDataChange("display", e.target.value)}
          />
        </div>
      )}

      {type === "slotfilling" && (
        <div className={styles.formGroup}>
          <label>{t("Slot")}</label>
          <input
            type="text"
            value={data.slot || ""}
            onChange={(e) => handleLocalDataChange("slot", e.target.value)}
          />
        </div>
      )}

      {type === "branch" && (
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
      )}

      {type === "branch" && data.evaluationType === "CONDITION" ? (
        <div className={styles.formGroup}>
          <label>{t("Conditions")}</label>
          <div className={styles.repliesContainer}>
            {(data.conditions || []).map((cond, index) => (
              <div key={cond.id} className={styles.quickReply}>
                <input
                  className={styles.quickReplyInput}
                  value={cond.slot}
                  onChange={(e) =>
                    handleConditionChange(index, "slot", e.target.value)
                  }
                  placeholder={t("Slot Name")}
                />
                <select
                  value={cond.operator}
                  onChange={(e) =>
                    handleConditionChange(index, "operator", e.target.value)
                  }
                >
                  <option value="==">==</option>
                  <option value="!=">!=</option>
                  <option value=">">&gt;</option>
                  <option value="<">&lt;</option>
                  <option value=">=">&gt;=</option>
                  <option value="<=">&lt;=</option>
                  <option value="contains">{t("contains")}</option>
                  <option value="!contains">!{t("contains")}</option>
                </select>
                <input
                  className={styles.quickReplyInput}
                  value={cond.value}
                  onChange={(e) =>
                    handleConditionChange(index, "value", e.target.value)
                  }
                  placeholder={t("Value to compare")}
                />
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
        (type === "message" ||
          type === "slotfilling" ||
          type === "branch" ||
          type === "fixedmenu") && (
          <div className={styles.formGroup}>
            <label>
              {type === "branch"
                ? "Branches"
                : type === "fixedmenu"
                  ? "Menus"
                  : "Quick Replies"}
            </label>
            <div className={styles.repliesContainer}>
              {data.replies?.map((reply, index) => (
                <div key={reply.value || index} className={styles.quickReply}>
                  <input
                    className={styles.quickReplyInput}
                    value={reply.display}
                    onChange={(e) =>
                      localUpdateReply(index, "display", e.target.value)
                    }
                    placeholder="Display text"
                  />
                  {type !== "branch" && type !== "fixedmenu" && (
                    <input
                      className={styles.quickReplyInput}
                      value={reply.value}
                      onChange={(e) =>
                        localUpdateReply(index, "value", e.target.value)
                      }
                      placeholder={t("Actual value")}
                    />
                  )}
                  <button
                    onClick={() => localDeleteReply(index)}
                    className={styles.deleteReplyButton}
                  >
                    ×
                  </button>
                </div>
              ))}
              <button onClick={localAddReply} className={styles.addReplyButton}>
                {type === "branch"
                  ? `+ ${t("Add Branch")}`
                  : type === "fixedmenu"
                    ? `+ ${t("Add Menu")}`
                    : `+ ${t("Add Reply")}`}
              </button>
            </div>
          </div>
        )
      )}
    </>
  );
}

export default DefaultNodeController;
