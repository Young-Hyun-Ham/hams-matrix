import { useTranslation } from "@/app/(builder)/hooks/useTranslation";

import { useBuilderStore } from "../../store/index";
import NodeTypeIcon from "../icons/NodeTypeIcon";
import styles from "./ChatNodes.module.css";
import NodeWrapper from "./NodeWrapper";

function ScenarioNode({ id, data }: { id: string; data: any }) {
  const { t } = useTranslation();
  const nodeColor =
    useBuilderStore((state) => state.nodeColors.scenario) || "#7f8c8d";
  const textColor =
    useBuilderStore((state) => state.nodeTextColors.scenario) || "#ffffff";
  const toggleScenarioNode = useBuilderStore(
    (state) => state.toggleScenarioNode,
  );
  const isCollapsed = data.isCollapsed !== false;

  return (
    <NodeWrapper
      id={id}
      typeLabel={t("Scenario")}
      icon={<NodeTypeIcon type="scenario" />}
      nodeColor={nodeColor}
      textColor={textColor}
      bodyCollapsed={isCollapsed}
      onToggleBody={() => {
        if (data.onToggleScenario) data.onToggleScenario(id, !isCollapsed);
        else toggleScenarioNode(id);
      }}
      handleData={{
        inputPosition: data.inputPosition,
        outputPosition: data.outputPosition,
      }}
      customClassName={styles.scenarioNodeWrapper}
      style={{ width: "100%", height: "100%", boxSizing: "border-box" }}
    >
      <p className={styles.scenarioDescription}>
        {`This group contains the '${data.label}' scenario.`}
      </p>
    </NodeWrapper>
  );
}

export default ScenarioNode;
