"use client";
import { useEffect, useRef } from "react";
import type { Graph } from "@/lib/chatbot/types";
import { useChatbot } from "@/components/chatbot/runtime";
import type { ScenarioEmulatorProps } from "../emulator/ScenarioEmulator";
type Props = Pick<
  ScenarioEmulatorProps,
  "scenarioKey" | "scenarioTitle" | "scenarioRunId" | "definitionOverride"
> & { open: boolean; onClose: () => void };
export default function ScenarioSimulatorModal(props: Props) {
  const { openSimulation } = useChatbot(),
    started = useRef(false);
  useEffect(() => {
    if (!props.open) {
      started.current = false;
      return;
    }
    if (started.current) return;
    started.current = true;
    const p = props;
    openSimulation(
      {
        scenarioId:
          p.scenarioKey === "builder-preview" ? undefined : p.scenarioKey,
        title: p.scenarioTitle,
        definition: p.definitionOverride as Graph,
      },
      () => p.onClose(),
    );
  }, [props, openSimulation]);
  return null;
}
