import { useLayoutEffect, type CSSProperties } from "react";
import { Handle, Position, useUpdateNodeInternals } from "reactflow";
import { useTranslation } from "@/app/(builder)/hooks/useTranslation";

import styles from "./ChatNodes.module.css";
import NodeTypeIcon from "../icons/NodeTypeIcon";
import NodeEditButton from "./NodeEditButton";
import NodeTitle from "./NodeTitle";
import { useBuilderStore } from "../../store/index";
import { useBuilderAppearance } from "../BuilderAppearance";
import {
  CollapseNodeIcon,
  ExpandNodeIcon,
  StartNodeIcon,
} from "../icons/Icons";

function ScenarioNode({ id, data }: { id: string; data: any }) {
  const { t } = useTranslation();
  const appearance = useBuilderAppearance();
  const startNodeId = useBuilderStore((state) => state.startNodeId);
  const setStartNodeId = useBuilderStore((state) => state.setStartNodeId);
  const nodeColor =
    useBuilderStore((state) => state.nodeColors.scenario) || "#7f8c8d";
  const textColor =
    useBuilderStore((state) => state.nodeTextColors.scenario) || "#ffffff";
  const toggleScenarioNode = useBuilderStore(
    (state) => state.toggleScenarioNode,
  );
  const deleteNode = useBuilderStore((state) => state.deleteNode);
  const isGroupChild = useBuilderStore((state) => {
    const node = state.nodes.find((item) => item.id === id);
    return state.nodes.some(
      (item) => item.id === node?.parentNode && item.type === "selectionGroup",
    );
  });
  const updateNodeInternals = useUpdateNodeInternals();

  const isCollapsed = data.isCollapsed !== false;
  const isStartNode = startNodeId === id;

  const inputPos = data?.inputPosition === "top" ? Position.Top : Position.Left;
  const outputPos =
    data?.outputPosition === "bottom" ? Position.Bottom : Position.Right;

  useLayoutEffect(() => {
    updateNodeInternals(id);
  }, [
    id,
    inputPos,
    outputPos,
    isGroupChild,
    isCollapsed,
    appearance,
    updateNodeInternals,
  ]);

  return (
    <div
      className={`${styles.nodeWrapper} ${appearance ? styles.publishingNode : ""} ${isGroupChild ? styles.groupChildNode : ""} ${styles.scenarioNodeWrapper} ${isStartNode ? styles.startNode : ""}`}
      style={
        {
          ...(appearance ? { "--node-accent": nodeColor } : {}),
          ...(isCollapsed
            ? { height: "50px", width: "450px" }
            : { height: "120px", width: "450px" }),
        } as CSSProperties
      }
    >
      <Handle
        type="target"
        position={inputPos}
        id={inputPos === Position.Top ? "input-top" : "input-left"}
        style={{
          ...(inputPos === Position.Top ? { top: -5 } : { left: -5 }),
          zIndex: 10,
          width: 10,
          height: 10,
          background: "#64748b",
          border: "2px solid #ffffff",
          cursor: "crosshair",
        }}
      />
      <div
        className={styles.nodeHeader}
        style={
          appearance
            ? undefined
            : { backgroundColor: nodeColor, color: textColor }
        }
      >
        <span
          className={styles.headerIcon}
          style={
            appearance
              ? undefined
              : { backgroundColor: nodeColor, color: textColor }
          }
        >
          <NodeTypeIcon type="scenario" />
        </span>
        <NodeTitle id={id} typeLabel={t("Scenario")} />
        <div className={styles.headerButtons}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setStartNodeId(id);
            }}
            className={`${styles.startNodeButton} ${isStartNode ? styles.active : ""}`}
            title="Set as Start Node"
          >
            <StartNodeIcon />
          </button>
          {/* Anchor button removed for scenario node */}
          <button
            onClick={() => toggleScenarioNode(id)}
            className={styles.anchorButton}
            title={isCollapsed ? "Expand" : "Collapse"}
          >
            {isCollapsed ? <ExpandNodeIcon /> : <CollapseNodeIcon />}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              deleteNode(id);
            }}
            className={styles.deleteButton}
            style={{
              color: appearance ? "var(--builder-muted)" : textColor,
              fontSize: "1rem",
              marginRight: "-5px",
            }}
          >
            &times;
          </button>
        </div>
      </div>
      {!isCollapsed && (
        <div
          className={styles.nodeBody}
          style={{
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            wordBreak: "break-all",
          }}
        >
          <p
            className={styles.scenarioDescription}
            style={{ textAlign: "left" }}
          >
            {`This group contains the '${data.label}' scenario.`}
          </p>
        </div>
      )}
      <NodeEditButton id={id} />
      <Handle
        type="source"
        position={outputPos}
        id={outputPos === Position.Bottom ? "output-bottom" : "output-right"}
        style={{
          ...(outputPos === Position.Bottom ? { bottom: -5 } : { right: -5 }),
          zIndex: 10,
          width: 10,
          height: 10,
          background: "#64748b",
          border: "2px solid #ffffff",
          cursor: "crosshair",
        }}
      />
    </div>
  );
}

export default ScenarioNode;
