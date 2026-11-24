import { useTranslation } from "@/app/(builder)/hooks/useTranslation";

import { useBuilderStore } from "../../store/index";
import styles from "../NodeController.module.css";

type GroupLocalNode = {
  id: string;
  data?: {
    label?: string;
    title?: string;
  };
};

type GroupNodeControllerProps = {
  localNode: GroupLocalNode;
  setLocalNode: (updater: (prev: GroupLocalNode) => GroupLocalNode) => void;
};

type BuilderNodeSummary = {
  id: string;
  type?: string;
  parentNode?: string;
  data?: {
    label?: string;
    title?: string;
  };
};

function GroupNodeController({
  localNode,
  setLocalNode,
}: GroupNodeControllerProps) {
  const { t } = useTranslation();
  const nodes = useBuilderStore((state) => state.nodes);
  const edges = useBuilderStore((state) => state.edges);
  const selectedNodeId = useBuilderStore((state) => state.selectedNodeId);
  const setSelectedNodeId = useBuilderStore((state) => state.setSelectedNodeId);
  const selectedGroupNodes: any = nodes.filter(
    (node: any) => node.parentNode === localNode.id,
  );
  const selectedGroupEdges: any = edges.filter(
    (edge: any) =>
      selectedGroupNodes.some((node: any) => node.id === edge.source) &&
      selectedGroupNodes.some((node: any) => node.id === edge.target),
  );
  const data = localNode.data || {};
  const title = data.title || data.label || "";
  const childNodes = (nodes as BuilderNodeSummary[]).filter(
    (node) => node.parentNode === localNode.id,
  );

  const updateTitle = (value: string) => {
    setLocalNode((prev) => ({
      ...prev,
      data: {
        ...prev.data,
        label: value,
        title: value,
      },
    }));
  };

  const openNodePicker = () => {
    window.dispatchEvent(
      new CustomEvent("flow-uipath:add-group-node", {
        detail: { groupId: localNode.id },
      }),
    );
  };

  return (
    <>
      <div className={styles.formGroup}>
        <label>{t("Group header")}</label>
        <input
          value={title}
          onChange={(event) => updateTitle(event.target.value)}
          placeholder={t("Selected Group")}
        />
      </div>

      <div className={styles.formGroup}>
        <label>{t("Nodes")}</label>
        <div className={styles.repliesContainer}>
          {childNodes.length > 0 ? (
            childNodes.map((node, index) => (
              <button
                key={node.id}
                type="button"
                className={styles.elementItem}
                onClick={() => setSelectedNodeId(node.id)}
              >
                <span className={styles.elementItemContent}>
                  <strong>
                    {node.data?.label || node.data?.title || node.type}
                  </strong>
                  <span className={styles.elementType}>
                    {node.type} #{index + 1}
                  </span>
                </span>
              </button>
            ))
          ) : (
            <p className={styles.placeholder}>{t("No nodes added")}.</p>
          )}
        </div>
        <button
          type="button"
          className={styles.addReplyButton}
          onClick={openNodePicker}
        >
          + {t("Add Node")}
        </button>
        {/* hidden scenario viewer button per user request */}
        <button
          type="button"
          className={styles.addReplyButton}
          onClick={() => {
            // console.log("title================> ", title)
            // console.log("selectedGroupNodes================> ", selectedGroupNodes)
            // console.log("selectedGroupEdges================> ", selectedGroupEdges)
            if (selectedGroupNodes) {
              window.dispatchEvent(
                new CustomEvent("flow:open-groupNodes-tab", {
                  detail: {
                    id: localNode.id,
                    name: title,
                    nodes: selectedGroupNodes,
                    edges: selectedGroupEdges,
                  },
                }),
              );
            } else {
              alert(t("Please select a scenario first."));
            }
          }}
        >
          {t("Open Scenario in Tab")}
        </button>
      </div>
    </>
  );
}

export default GroupNodeController;
