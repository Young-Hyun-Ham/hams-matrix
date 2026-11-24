// (Handle, Position 임포트 제거)
import styles from "./ChatNodes.module.css";
import { useBuilderStore } from "../../store/index";
// (AnchorIcon, StartNodeIcon 임포트 제거)
import NodeWrapper from "./NodeWrapper";
import NodeTypeIcon from "../icons/NodeTypeIcon"; // 1. Wrapper 임포트
import { useTranslation } from "@/app/(builder)/hooks/useTranslation";

function LinkNode({ id, data }) {
  const { t } = useTranslation();
  // 2. 공통 로직 제거
  const nodeColor = useBuilderStore((state) => state.nodeColors.link);
  const textColor = useBuilderStore((state) => state.nodeTextColors.link);

  // (isAnchored, isStartNode 로직 제거)

  return (
    // 3. NodeWrapper로 감싸기
    <NodeWrapper
      id={id}
      typeLabel="Link"
      icon={<NodeTypeIcon type="link" />}
      nodeColor={nodeColor}
      textColor={textColor}
    >
      {/* 4. 기존 nodeBody의 내용만 children으로 전달 */}
      <div className={styles.section}>
        <span className={styles.sectionTitle}>{t("Display Text")}</span>
        <input className={styles.textInput} value={data.display} readOnly />
      </div>
      <div className={styles.section}>
        <span className={styles.sectionTitle}>{t("URL")}</span>
        <textarea
          className={styles.textInput}
          value={data.content}
          readOnly
          rows={2}
        />
      </div>
    </NodeWrapper>
  );
}

export default LinkNode;
