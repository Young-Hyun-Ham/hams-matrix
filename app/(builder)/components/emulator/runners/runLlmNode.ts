import type { AnyNode, ChatStep } from "../types";
import { makeStepId, resolveTemplate } from "../utils";

export async function runLlmNode(
  node: AnyNode,
  slotSnapshot: Record<string, any>,
  deps: {
    systemPrompt: string;
    model?: string | null;
    pushBotStep: (id: string, text: string) => void;
    setSteps: React.Dispatch<React.SetStateAction<ChatStep[]>>;
    setSlotValues: React.Dispatch<React.SetStateAction<Record<string, any>>>;
  },
) {
  void slotSnapshot;
  deps.pushBotStep(
    makeStepId(node.id),
    "Builder LLM execution is not configured.",
  );
  return false;
}
