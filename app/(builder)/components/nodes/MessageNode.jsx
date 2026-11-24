import styles from "./ChatNodes.module.css";
import { useBuilderStore } from "../../store/index";

import NodeWrapper from "./NodeWrapper";
import NodeTypeIcon from "../icons/NodeTypeIcon";
import { useTranslation } from "@/app/(builder)/hooks/useTranslation";

// (AnchorIcon, StartNodeIcon 임포트 제거)
// (Handle, Position 임포트 제거 - Wrapper가 처리)

function MessageNode({ id, data }) {
  const { t } = useTranslation();

  // 2. 공통 로직(delete, anchor, start) 제거
  const nodeColor = useBuilderStore((state) => state.nodeColors.message);
  const textColor = useBuilderStore((state) => state.nodeTextColors.message);

  // (isAnchored, isStartNode 로직 제거)

  return (
    // 3. NodeWrapper로 감싸기
    <NodeWrapper
      id={id}
      typeLabel="Message"
      icon={<NodeTypeIcon type="message" />}
      nodeColor={nodeColor}
      textColor={textColor}
    >
      {/* 4. 기존 nodeBody의 내용만 children으로 전달 */}
      <div className={styles.section}>
        <span className={styles.sectionTitle}>{t("Content")}</span>
        <textarea
          className={styles.textInput}
          value={data.content}
          readOnly
          rows={3}
        />
      </div>
      {/* Quick Replies 메세지에서 사용 하지 않음.
      <div className={styles.section}>
        <span className={styles.sectionTitle}>{t('Quick Replies')}:</span>
        {data.replies?.map((reply, index) => (
          <div key={reply.value} className={styles.quickReply}>
            <input
              className={styles.quickReplyInput}
              value={reply.display}
              readOnly
              placeholder={t('Display text')}
            />
            <input
              className={styles.quickReplyInput}
              value={reply.value}
              readOnly
              placeholder={t('Actual value')}
            />
          </div>
        ))}
        {data.replies?.length === 0 && (
          <div className={styles.formElementsPlaceholder}>
            {t('No replies added')}.
          </div>
        )}
      </div>
      */}
    </NodeWrapper>
  );
}
export default MessageNode;
