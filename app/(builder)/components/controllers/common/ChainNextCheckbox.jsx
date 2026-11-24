import styles from "../../NodeController.module.css";
import { useTranslation } from "@/app/(builder)/hooks/useTranslation";
import { useBuilderAppearance } from "../../BuilderAppearance";

/**
 * Node Controller에서 공통으로 사용되는 'Chain with next node' 체크박스
 * @param {object} props
 * @param {boolean} props.checked - 체크박스의 현재 값 (data.chainNext)
 * @param {function(boolean): void} props.onChange - 값이 변경될 때 호출되는 콜백 (handleLocalDataChange)
 */
function ChainNextCheckbox({ checked, onChange }) {
  const { t } = useTranslation();
  const appearance = useBuilderAppearance();
  return (
    <div
      className={`${styles.formGroup} ${appearance ? styles.behaviourSection : ""}`}
      style={{ paddingTop: "10px" }}
    >
      {appearance && (
        <h4 className={styles.sectionHeading}>{t("BEHAVIOUR")}</h4>
      )}
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          cursor: "pointer",
          fontWeight: "500",
          fontSize: "0.85rem",
        }}
      >
        <input
          type="checkbox"
          checked={checked || false}
          onChange={(e) => onChange(e.target.checked)}
          style={{ width: "16px", height: "16px", margin: 0, flexShrink: 0 }}
        />
        {`${t("Chain with next node")} (${t("no new bubble")})`}
      </label>
    </div>
  );
}

export default ChainNextCheckbox;
