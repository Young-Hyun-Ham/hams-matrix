import React, { useEffect } from "react";
import { Handle, Position, useUpdateNodeInternals } from "reactflow";
import styles from "./ChatNodes.module.css";
import { useBuilderStore } from "../../store/index";
// (AnchorIcon, StartNodeIcon 임포트 제거)
import NodeWrapper from "./NodeWrapper";
import NodeTypeIcon from "../icons/NodeTypeIcon";
import { useTranslation } from "@/app/(builder)/hooks/useTranslation";
import YnBranchNode from "./YnBranchNode";

function BranchNode(props) {
  const { id, data } = props;
  const { t } = useTranslation();
  const updateNodeInternals = useUpdateNodeInternals();
  const nodeColor = useBuilderStore((state) => state.nodeColors.branch);
  const textColor = useBuilderStore((state) => state.nodeTextColors.branch);
  const isSelectionGroupChild = useBuilderStore((state) => {
    const node = state.nodes.find((item) => item.id === id);
    if (!node?.parentNode) return false;
    return (
      state.nodes.find((item) => item.id === node.parentNode)?.type ===
      "selectionGroup"
    );
  });

  useEffect(() => {
    updateNodeInternals(id);
  }, [
    id,
    data?.outputPositions,
    data?.outputPosition,
    isSelectionGroupChild,
    updateNodeInternals,
  ]);

  if (data?.isSimpleYN) {
    return (
      <YnBranchNode
        {...props}
        data={
          isSelectionGroupChild
            ? {
                ...data,
                outputPosition: "right",
                outputPositions: {
                  ...data.outputPositions,
                  Y: "right",
                  N: "right",
                },
              }
            : data
        }
      />
    );
  }
  // 2. 공통 로직 제거
  const isConditionType = data.evaluationType === "CONDITION";
  // (isAnchored, isStartNode 로직 제거)

  const getHandlePosition = (hId) => {
    if (isSelectionGroupChild) return "right";
    return data?.outputPositions?.[hId] || data?.outputPosition || "right";
  };

  // Collect all handles for side grouping
  const allHandles = isConditionType
    ? [
        ...(data.conditions?.map((cond, index) => ({
          id: data.replies?.[index]?.value || cond.id || String(index),
          isDefault: false,
        })) || []),
        { id: "default", isDefault: true },
      ]
    : data.replies?.map((reply) => ({
        id: reply.value,
        isDefault: false,
      })) || [];

  const rightHandles = allHandles.filter(
    (h) => getHandlePosition(h.id) === "right",
  );
  const bottomHandles = allHandles.filter(
    (h) => getHandlePosition(h.id) === "bottom",
  );

  const getHandleSideRatio = (handleId) => {
    const side = getHandlePosition(handleId);
    const sideList = side === "bottom" ? bottomHandles : rightHandles;
    const indexOnSide = sideList.findIndex((h) => h.id === handleId);
    const countOnSide = sideList.length || 1;
    const idx = indexOnSide !== -1 ? indexOnSide : 0;
    return {
      side,
      isBottom: side === "bottom",
      ratio: ((idx + 1) / (countOnSide + 1)) * 100,
    };
  };

  // 3. Wrapper에 전달할 커스텀 핸들 정의
  const customHandles = (
    <>
      {isConditionType ? (
        // Condition 타입 핸들
        <>
          {data.conditions?.map((cond, index) => {
            const handleId =
              data.replies?.[index]?.value || cond.id || String(index);
            const { isBottom, ratio } = getHandleSideRatio(handleId);

            return (
              <Handle
                key={handleId}
                type="source"
                position={isBottom ? Position.Bottom : Position.Right}
                id={handleId}
                style={
                  isBottom
                    ? {
                        left: `${ratio}%`,
                        background: "#555",
                      }
                    : {
                        top: `${ratio}%`,
                        background: "#555",
                      }
                }
              />
            );
          })}
          {(() => {
            const handleId = "default";
            const { isBottom, ratio } = getHandleSideRatio(handleId);

            return (
              <>
                <Handle
                  type="source"
                  position={isBottom ? Position.Bottom : Position.Right}
                  id="default"
                  style={
                    isBottom
                      ? {
                          left: `${ratio}%`,
                          background: "#e74c3c",
                        }
                      : {
                          top: `${ratio}%`,
                          background: "#e74c3c",
                        }
                  }
                />
                <div
                  style={
                    isBottom
                      ? {
                          position: "absolute",
                          bottom: -18,
                          left: `${ratio}%`,
                          transform: "translateX(-50%)",
                          fontSize: "11px",
                          color: "#e74c3c",
                          whiteSpace: "nowrap",
                        }
                      : {
                          position: "absolute",
                          top: `${ratio}%`,
                          right: -45,
                          transform: "translateY(-50%)",
                          fontSize: "11px",
                          color: "#e74c3c",
                        }
                  }
                >
                  {t("Default")}
                </div>
              </>
            );
          })()}
        </>
      ) : (
        // Button 타입 핸들
        <>
          {data.replies?.map((reply) => {
            const handleId = reply.value;
            const { isBottom, ratio } = getHandleSideRatio(handleId);

            return (
              <Handle
                key={handleId}
                type="source"
                position={isBottom ? Position.Bottom : Position.Right}
                id={handleId}
                style={
                  isBottom
                    ? {
                        left: `${ratio}%`,
                        background: "#555",
                      }
                    : {
                        top: `${ratio}%`,
                        background: "#555",
                      }
                }
              />
            );
          })}
        </>
      )}
    </>
  );

  return (
    // 4. NodeWrapper로 감싸기
    <NodeWrapper
      id={id}
      typeLabel={t("Branch")}
      customClassName={styles.branchNode}
      icon={<NodeTypeIcon type="branch" />}
      nodeColor={nodeColor}
      textColor={textColor}
      handles={customHandles} // 5. 커스텀 핸들 전달
    >
      {/* 6. 기존 nodeBody의 내용만 children으로 전달 */}
      <div className={styles.section}>
        <span className={styles.sectionTitle}>{t("Branch Text")}</span>
        <textarea
          className={styles.textInput}
          value={data.content || ""}
          readOnly
          rows={4}
        />
      </div>
      <div className={styles.section}>
        <span className={styles.sectionTitle}>
          {t("Branches")} ({isConditionType ? t("Conditions") : t("Buttons")})
        </span>
        <div className={styles.branchOptionsContainer}>
          {isConditionType ? (
            (data.conditions?.length || 0) > 0 ? (
              data.conditions.map((cond, index) => (
                <div key={cond.id || index} className={styles.branchOption}>
                  <span className={styles.branchOptionButton}>
                    {`{${cond.slot}} ${cond.operator} ${cond.valueType === "slot" ? `{${cond.value}}` : `'${cond.value}'`}`}
                  </span>
                  {/* 핸들은 customHandles에서 이미 정의됨 */}
                </div>
              ))
            ) : (
              <div className={styles.formElementsPlaceholder}>
                {t("No conditions added")}.
              </div>
            )
          ) : (data.replies?.length || 0) > 0 ? (
            data.replies.map((reply, index) => (
              <div key={reply.value} className={styles.branchOption}>
                <span className={styles.branchOptionButton}>
                  {reply.display}
                </span>
                {/* 핸들은 customHandles에서 이미 정의됨 */}
              </div>
            ))
          ) : (
            <div className={styles.formElementsPlaceholder}>
              {t("No buttons added")}.
            </div>
          )}
        </div>
      </div>
    </NodeWrapper>
  );
}

export default BranchNode;
