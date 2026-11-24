// (Handle, Position 임포트 제거)
import styles from "./ChatNodes.module.css";
import { useBuilderStore } from "../../store/index";
// (AnchorIcon, StartNodeIcon 임포트 제거)
import NodeWrapper from "./NodeWrapper";
import NodeTypeIcon from "../icons/NodeTypeIcon";
import { useTranslation } from "@/app/(builder)/hooks/useTranslation";

function SetSlotNode({ id, data }) {
  const { t } = useTranslation();
  // 3. 공통 로직 제거
  const nodeColor =
    useBuilderStore((state) => state.nodeColors.setSlot) || "#8e44ad";
  const textColor =
    useBuilderStore((state) => state.nodeTextColors.setSlot) || "#ffffff";

  // (isAnchored, isStartNode 로직 제거)

  return (
    // 4. NodeWrapper로 감싸기
    <NodeWrapper
      id={id}
      typeLabel="Set Slot"
      icon={<NodeTypeIcon type="setSlot" />}
      nodeColor={nodeColor}
      textColor={textColor}
    >
      {/* 6. 기존 nodeBody의 내용만 children으로 전달 */}
      <div className={styles.section}>
        <span className={styles.sectionTitle}>{t("Assignments")}</span>
        {(data.assignments || []).map((assign, index) => (
          <div key={index} className={styles.previewBox}>
            <span style={{ fontWeight: "bold" }}>{assign.key}</span> ={" "}
            <span>{assign.value}</span>
          </div>
        ))}
        {(!data.assignments || data.assignments.length === 0) && (
          <div className={styles.formElementsPlaceholder}>
            {t("No assignments configured")}.
          </div>
        )}
      </div>
    </NodeWrapper>
  );
}

export default SetSlotNode;
