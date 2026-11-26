// (Handle, Position 임포트 제거)
import styles from "./ChatNodes.module.css";
import { useBuilderStore } from "../../store/index";
// (AnchorIcon, StartNodeIcon 임포트 제거)
import NodeWrapper from "./NodeWrapper";
import NodeTypeIcon from "../icons/NodeTypeIcon";
import { useEffect } from "react";
import { useTranslation } from "@/app/(builder)/hooks/useTranslation";

function IframeNode({ id, data }) {
  const { t } = useTranslation();
  // 3. 공통 로직 제거
  const nodeColor = useBuilderStore((state) => state.nodeColors.iframe);
  const textColor = useBuilderStore((state) => state.nodeTextColors.iframe);
  const nodes = useBuilderStore((state) => state.nodes);
  // (isAnchored, isStartNode 로직 제거)

  // 4. 동적 너비 계산
  const currentNode = nodes.find((node) => node.id === id);
  const isSelectionGroupChild = Boolean(
    currentNode?.parentNode &&
      nodes.find((node) => node.id === currentNode.parentNode)?.type ===
        "selectionGroup",
  );
  const nodeWidth = isSelectionGroupChild
    ? 520
    : Math.max(parseInt(data.width || "250", 10) + 40, 250);

  // URL을 안전하게 변환해주는 헬퍼 함수
  const encodeUrlParamsKeepingTemplates = (originalUrl) => {
    if (!originalUrl) return "";

    try {
      const urlObj = new URL(originalUrl);
      const params = new URLSearchParams(urlObj.search);
      const newParams = new URLSearchParams();

      for (const [key, value] of params.entries()) {
        if (value.startsWith("{{") && value.endsWith("}}")) {
          // 빈 문자열로 대체하여 URL 구조는 유지하되, 실제 값은 노출되지 않도록 합니다.
          newParams.append(key, "");
        } else {
          newParams.append(key, value);
        }
      }
      let queryString = newParams.toString();
      return `${urlObj.origin}?${queryString}`;
    } catch (error) {
      console.error("URL Encoding error:", error);
      return originalUrl;
    }
  };

  useEffect(() => {
    const setSlotNodes = nodes.filter((node) => node.type === "setSlot");
  }, [data]);

  return (
    // 5. NodeWrapper로 감싸기
    <NodeWrapper
      id={id}
      typeLabel="iFrame"
      icon={<NodeTypeIcon type="iframe" />}
      nodeColor={nodeColor}
      textColor={textColor}
      style={{ width: `${nodeWidth}px` }} // 7. 동적 스타일 전달
    >
      {/* 8. 기존 nodeBody의 내용만 children으로 전달 */}
      <div className={styles.section}>
        <span className={styles.sectionTitle}>{t("URL")}</span>
        <textarea
          className={styles.textInput}
          value={data.url || ""}
          readOnly
          rows={2}
        />
      </div>
      <div className={styles.section}>
        {/* Preview iframe - handle potential errors or invalid URLs */}
        {data.url ? (
          <iframe
            src={encodeUrlParamsKeepingTemplates(data.url)}
            width="100%"
            height={data.height || "200"}
            style={{
              border: "1px solid #ccc",
              borderRadius: "4px",
              overflowX: "hidden",
              maxWidth: "100%",
              boxSizing: "border-box",
            }}
            title="iframe-preview"
            onError={(e) => console.warn("Iframe preview error:", e)}
          ></iframe>
        ) : (
          <div className={styles.formElementsPlaceholder}>
            {t("No URL provided")}.
          </div>
        )}
      </div>
    </NodeWrapper>
  );
}

export default IframeNode;
