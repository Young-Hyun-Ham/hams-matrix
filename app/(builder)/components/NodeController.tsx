import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "@/app/(builder)/hooks/useTranslation";

import { useBuilderStore } from "../store/index";
import styles from "./NodeController.module.css";
import ApiNodeController from "./controllers/ApiNodeController";
import FormNodeController from "./controllers/FormNodeController";
import LlmNodeController from "./controllers/LlmNodeController";
import ToastNodeController from "./controllers/ToastNodeController";
import IframeNodeController from "./controllers/IframeNodeController";
import MessageNodeController from "./controllers/MessageNodeController";
import SlotFillingNodeController from "./controllers/SlotFillingNodeController";
import BranchNodeController from "./controllers/BranchNodeController";
import LinkNodeController from "./controllers/LinkNodeController";
import FixedMenuNodeController from "./controllers/FixedMenuNodeController";
import SetSlotNodeController from "./controllers/SetSlotNodeController";
import DelayNodeController from "./controllers/DelayNodeController";
import GroupNodeController from "./controllers/GroupNodeController";
import ScenarioNodeController from "./controllers/ScenarioNodeController";
import YnBranchNodeController from "./controllers/YnBranchNodeController";

import { useModal } from "@/app/(builder)/providers/ModalProvider";
import { X, Save } from "lucide-react";
import NodeTypeIcon from "./icons/NodeTypeIcon";
import { useBuilderAppearance } from "./BuilderAppearance";
import { getNodeTypeLabel } from "../utils/nodeTitles";

const nodeControllerMap = {
  api: ApiNodeController,
  message: MessageNodeController,
  slotfilling: SlotFillingNodeController,
  branch: BranchNodeController,
  link: LinkNodeController,
  fixedmenu: FixedMenuNodeController,
  form: FormNodeController,
  llm: LlmNodeController,
  toast: ToastNodeController,
  iframe: IframeNodeController,
  setSlot: SetSlotNodeController,
  delay: DelayNodeController,
  selectionGroup: GroupNodeController,
  scenario: ScenarioNodeController,
  ynBranch: YnBranchNodeController,
} as any;

function NodeController({ onClose }: { onClose?: () => void } = {}) {
  const { selectedNodeId, nodes } = useBuilderStore();
  const selectedNode = nodes.find((n: any) => n.id === selectedNodeId);
  const scenarioEditorActive = useBuilderStore(
    (state) => (state as any).scenarioEditorActive === true,
  );
  const scenarioEditorOwnerNode = useBuilderStore(
    (state) => (state as any).scenarioEditorOwnerNode,
  );
  const effectiveSelectedNode =
    selectedNode ??
    (scenarioEditorActive ? scenarioEditorOwnerNode : undefined);

  return (
    <NodeControllerEditor
      key={effectiveSelectedNode?.id ?? "empty"}
      selectedNode={effectiveSelectedNode}
      onClose={onClose}
    />
  );
}

export function NodeControllerEditor({
  selectedNode,
  onClose,
}: {
  selectedNode: any;
  onClose?: () => void;
}) {
  // console.log("NodeControllerEditor ==========> ", selectedNode)
  const { t } = useTranslation();
  const appearance = useBuilderAppearance();
  const { showConfirm } = useModal();
  const { edges, nodes, setEdges, setNodes, startNodeId, updateNodeData } =
    useBuilderStore() as any;
  const [localNode, setLocalNode] = useState<any>(() =>
    selectedNode ? JSON.parse(JSON.stringify(selectedNode)) : null,
  );

  useEffect(() => {
    const title = selectedNode?.data?.title;
    setLocalNode((previous: any) =>
      previous && previous.data?.title !== title
        ? { ...previous, data: { ...previous.data, title } }
        : previous,
    );
  }, [selectedNode?.data?.title]);

  const isDirty = useMemo(() => {
    if (!localNode || !selectedNode) return false;
    return JSON.stringify(localNode.data) !== JSON.stringify(selectedNode.data);
  }, [localNode, selectedNode]);

  if (!localNode) {
    return (
      <div className={styles.controllerContainer}>
        <div className={styles.mainControls}>
          <h3>{t("Controller")}</h3>
          <p className={styles.placeholder}>
            {t("Please select a node to edit")}.
          </p>
        </div>
      </div>
    );
  }

  const getBranchHandlesForData = (data: any) => {
    if (data?.evaluationType === "CONDITION" && data.conditions?.length) {
      return [
        ...data.conditions.map(
          (condition: any, index: number) =>
            data.replies?.[index]?.value ||
            condition.id ||
            `condition-${index}`,
        ),
        null,
      ];
    }

    if (data?.replies?.length) {
      return data.replies.map(
        (reply: any, index: number) => reply.value || `reply-${index}`,
      );
    }

    return [null];
  };

  const handleSaveChanges = async () => {
    const evaluationTypeChanged =
      localNode.type === "branch" &&
      selectedNode?.data?.evaluationType !== localNode.data?.evaluationType;

    if (evaluationTypeChanged) {
      const validHandles = new Set(getBranchHandlesForData(localNode.data));
      const invalidBranchEdges = edges.filter(
        (edge: any) =>
          edge.source === localNode.id &&
          !validHandles.has(edge.sourceHandle ?? null),
      );

      if (invalidBranchEdges.length > 0) {
        const confirmed = await showConfirm(
          t(
            "Some connected branch paths do not match the new Evaluation Type. Do you want to change it and remove orphan nodes?",
          ),
        );

        if (!confirmed) return;

        const remainingEdges = edges.filter(
          (edge: any) =>
            !invalidBranchEdges.some(
              (invalidEdge: any) => invalidEdge.id === edge.id,
            ),
        );
        const removableNodeIds = new Set<string>();

        const collectOrphanSubtree = (nodeId: string) => {
          if (removableNodeIds.has(nodeId) || nodeId === startNodeId) return;

          const hasRemainingIncoming = remainingEdges.some(
            (edge: any) =>
              edge.target === nodeId && !removableNodeIds.has(edge.source),
          );

          if (hasRemainingIncoming) return;

          removableNodeIds.add(nodeId);
          remainingEdges
            .filter((edge: any) => edge.source === nodeId)
            .forEach((edge: any) => collectOrphanSubtree(edge.target));
        };

        invalidBranchEdges.forEach((edge: any) =>
          collectOrphanSubtree(edge.target),
        );

        setNodes(
          nodes
            .map((node: any) =>
              node.id === localNode.id
                ? { ...node, data: localNode.data }
                : node,
            )
            .filter((node: any) => !removableNodeIds.has(node.id)),
        );
        setEdges(
          remainingEdges.filter(
            (edge: any) =>
              !removableNodeIds.has(edge.source) &&
              !removableNodeIds.has(edge.target),
          ),
        );
        return;
      }
    }

    updateNodeData(localNode.id, localNode.data);
  };

  const renderContent = () => {
    const ControllerComponent = nodeControllerMap[localNode.type];
    const commonProps = {
      localNode,
      setLocalNode,
      publishing: Boolean(appearance),
    };

    return ControllerComponent ? (
      <ControllerComponent {...commonProps} />
    ) : (
      <p className={styles.placeholder}>
        {t("This node type has no editable properties")}.
      </p>
    );
  };

  return (
    <div
      className={`${styles.controllerContainer} ${appearance ? styles.publishingController : ""}`}
    >
      {appearance && (
        <header className={styles.publishingHeader}>
          <NodeTypeIcon type={localNode.type} />
          <span>{t(getNodeTypeLabel(localNode.type))}</span>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label={t("Close node editor")}
              title={t("Close")}
            >
              <X size={15} />
            </button>
          )}
        </header>
      )}
      <div className={styles.mainControls}>
        {!appearance && (
          <h3>
            {t("Type")}: {localNode.type}
          </h3>
        )}
        {appearance && <h4 className={styles.sectionHeading}>{t("BASIC")}</h4>}
        <div className={styles.form}>{renderContent()}</div>
      </div>
      <div className={styles.controllerActions}>
        <button
          onClick={handleSaveChanges}
          className={styles.saveNodeButton}
          disabled={!isDirty}
        >
          {appearance && <Save size={13} aria-hidden="true" />}
          {t("Save Changes")} {isDirty && " *"}
        </button>
      </div>
    </div>
  );
}

export default NodeController;
