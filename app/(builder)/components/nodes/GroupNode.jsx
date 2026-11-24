import { useEffect } from "react";
import { useUpdateNodeInternals } from "reactflow";
import styles from "./ChatNodes.module.css";
import { useBuilderStore } from "../../store/index";
import { Plus, Split } from "lucide-react";
import { useTranslation } from "@/app/(builder)/hooks/useTranslation";
import NodeWrapper from "./NodeWrapper";
import NodeTypeIcon from "../icons/NodeTypeIcon";
import { useBuilderAppearance } from "../BuilderAppearance";

function GroupNode({ id, data }) {
  const { t } = useTranslation();
  const appearance = useBuilderAppearance();
  const childCount = useBuilderStore(
    (state) => state.nodes.filter((node) => node.parentNode === id).length,
  );
  const updateNodeInternals = useUpdateNodeInternals();
  const toggleScenarioNode = useBuilderStore(
    (state) => state.toggleScenarioNode,
  );
  const ungroupNode = useBuilderStore((state) => state.ungroupNode);

  const isCollapsed = data?.isCollapsed || false;

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      updateNodeInternals(id);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [id, isCollapsed, updateNodeInternals]);

  const headerButtons = (
    <>
      <button
        onClick={(e) => {
          e.stopPropagation();
          ungroupNode(id);
        }}
        className={styles.anchorButton}
        title="Ungroup"
      >
        <Split size={14} />
        {appearance && <span>{t("Ungroup")}</span>}
      </button>
    </>
  );

  return (
    <NodeWrapper
      id={id}
      typeLabel={t("Group")}
      icon={<NodeTypeIcon type="selectionGroup" />}
      headerPrefix={
        appearance ? (
          <span className={styles.groupCount}>
            {childCount} {t("Nodes")}
          </span>
        ) : null
      }
      nodeColor="#475569"
      textColor="#ffffff"
      headerButtons={headerButtons}
      bodyCollapsed={isCollapsed}
      onToggleBody={() => toggleScenarioNode(id)}
      hideBody={isCollapsed}
      customClassName={`${styles.groupNodeWrapper} ${
        isCollapsed ? styles.groupNodeWrapperCollapsed : ""
      }`}
      style={isCollapsed ? { height: "50px", width: "250px" } : undefined}
    >
      <p className={styles.groupNodeDescription}>
        {t("This group contains selected nodes from the current scenario")}.
      </p>
      {!isCollapsed && (
        <button
          type="button"
          className={`${styles.groupAddNodeButton} nodrag nopan`}
          title={t("Add Node")}
          aria-label={t("Add Node")}
          onClick={(event) => {
            event.stopPropagation();
            window.dispatchEvent(
              new CustomEvent("flow-uipath:add-group-node", {
                detail: { groupId: id },
              }),
            );
          }}
        >
          <Plus size={15} />
          <span>{t("Add Node")}</span>
        </button>
      )}
    </NodeWrapper>
  );
}

export default GroupNode;
