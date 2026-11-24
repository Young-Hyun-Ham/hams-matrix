import React, { useLayoutEffect, useState } from "react";
import { Handle, Position, useUpdateNodeInternals } from "reactflow";
import { useModal } from "@/app/(builder)/providers/ModalProvider";
import styles from "./ChatNodes.module.css";
import { useBuilderStore } from "../../store/index";
// (AnchorIcon, StartNodeIcon 임포트 제거)
import { PlayIcon } from "../icons/Icons";
import * as backendService from "../../services/backendService";
import NodeWrapper from "./NodeWrapper";
import NodeTypeIcon from "../icons/NodeTypeIcon";

import { useTranslation } from "@/app/(builder)/hooks/useTranslation";
import { useBuilderAppearance } from "../BuilderAppearance";

function ApiNode({ id, data }) {
  const { t } = useTranslation();
  const appearance = useBuilderAppearance();
  const { showAlert } = useModal();
  const apiCount = data.apis?.length || 0;
  const isMulti = data.isMulti;

  const [isTesting, setIsTesting] = useState(false);

  const nodeColor = useBuilderStore((state) => state.nodeColors?.api);
  const textColor = useBuilderStore((state) => state.nodeTextColors?.api);

  const handleApiTest = async (e) => {
    e.stopPropagation();
    if (isMulti || isTesting) return; // Multi 모드일 때는 컨트롤러에서 개별 테스트
    setIsTesting(true);
    try {
      const result = await backendService.testApiCall(data);
      await showAlert(
        `API Test Success!\n\nResponse:\n${JSON.stringify(result, null, 2)}`,
      );
      // await openApiResultModal({
      //   title: 'API Test Success',
      //   payload: result,
      // });
    } catch (error) {
      // console.error('API Test Error:', error);
      await showAlert(`API Test Failed:\n${error.message}`);
      // await openApiResultModal({
      //   title: 'API Test Failed',
      //   payload: error?.message || 'Unknown error',
      //   isError: true,
      // });
    } finally {
      setIsTesting(false);
    }
  };

  // 4. Wrapper에 전달할 추가 헤더 버튼 정의
  const extraHeaderButtons = !isMulti ? (
    <button
      onClick={handleApiTest}
      className={styles.playButton}
      title={t("Test API")}
      disabled={isTesting}
    >
      {isTesting ? <span className={styles.buttonSpinner} /> : <PlayIcon />}
      {appearance && <span>{t("Test API")}</span>}
    </button>
  ) : null;

  const isGroupChild = useBuilderStore((state) => {
    const node = state.nodes.find((item) => item.id === id);
    return state.nodes.some(
      (item) => item.id === node?.parentNode && item.type === "selectionGroup",
    );
  });

  const posSuccess = isGroupChild
    ? "bottom"
    : data?.outputPositions?.["onSuccess"] || "right";
  const posError = isGroupChild
    ? "right"
    : data?.outputPositions?.["onError"] || "bottom";
  const updateNodeInternals = useUpdateNodeInternals();
  useLayoutEffect(() => {
    updateNodeInternals(id);
  }, [id, posSuccess, posError, updateNodeInternals]);

  const isSuccessBottom = posSuccess === "bottom";
  const isErrorBottom = posError === "bottom";

  const bothRight = !isSuccessBottom && !isErrorBottom;
  const bothBottom = isSuccessBottom && isErrorBottom;

  const successHandleStyle = isSuccessBottom
    ? { left: bothBottom ? "35%" : "50%", background: "#2ecc71" }
    : { top: bothRight ? "35%" : "50%", background: "#2ecc71" };

  const errorHandleStyle = isErrorBottom
    ? { left: bothBottom ? "65%" : "50%", background: "#e74c3c" }
    : { top: bothRight ? "65%" : "50%", background: "#e74c3c" };

  const customHandles = (
    <>
      <Handle
        type="source"
        position={isSuccessBottom ? Position.Bottom : Position.Right}
        id="onSuccess"
        style={successHandleStyle}
      />
      <span
        hidden={isGroupChild}
        style={
          isSuccessBottom
            ? {
                position: "absolute",
                left: bothBottom ? "35%" : "50%",
                bottom: "-20px",
                transform: "translateX(-50%)",
                fontSize: "0.7rem",
                color: "#2ecc71",
                whiteSpace: "nowrap",
              }
            : {
                position: "absolute",
                right: "-70px",
                top: bothRight ? "35%" : "50%",
                transform: "translateY(-50%)",
                fontSize: "0.7rem",
                color: "#2ecc71",
              }
        }
      >
        {t("On Success")}
      </span>

      <Handle
        type="source"
        position={isErrorBottom ? Position.Bottom : Position.Right}
        id="onError"
        style={errorHandleStyle}
      />
      <span
        style={
          isErrorBottom
            ? {
                position: "absolute",
                left: bothBottom ? "65%" : "50%",
                bottom: "-20px",
                transform: "translateX(-50%)",
                fontSize: "0.7rem",
                color: "#e74c3c",
                whiteSpace: "nowrap",
              }
            : {
                position: "absolute",
                right: "-60px",
                top: bothRight ? "65%" : "50%",
                transform: "translateY(-50%)",
                fontSize: "0.7rem",
                color: "#e74c3c",
              }
        }
      >
        {t("On Error")}
      </span>
    </>
  );

  return (
    // 6. NodeWrapper로 감싸기
    <NodeWrapper
      id={id}
      typeLabel={isMulti ? `API (${apiCount} calls)` : "API"}
      icon={<NodeTypeIcon type="api" />}
      nodeColor={nodeColor}
      textColor={textColor}
      headerButtons={extraHeaderButtons} // 추가 버튼 전달
      handles={customHandles} // 커스텀 핸들 전달
    >
      {/* 7. 기존 nodeBody의 내용만 children으로 전달 */}
      {isMulti ? (
        <div className={styles.section}>
          {data.apis?.map((api) => (
            <div key={api.id} className={styles.previewBox}>
              {api.name || t("API Call")}
            </div>
          ))}
          {(!data.apis || data.apis.length === 0) && (
            <div className={styles.formElementsPlaceholder}>
              {t("No API calls configured")}.
            </div>
          )}
        </div>
      ) : (
        <>
          <div className={styles.section}>
            <span className={styles.sectionTitle}>{t("Method")}</span>
            <input
              className={styles.textInput}
              value={data.method || "GET"}
              readOnly
            />
          </div>
          <div className={styles.section}>
            <span className={styles.sectionTitle}>{t("URL")}</span>
            <textarea
              className={styles.textInput}
              value={data.url}
              readOnly
              rows={2}
            />
          </div>
        </>
      )}
    </NodeWrapper>
  );
}
export default ApiNode;
