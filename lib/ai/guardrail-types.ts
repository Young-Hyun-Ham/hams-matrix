export type GuardrailPolicy = {
  mode: "monitor" | "enforce";
  aiEnabled: boolean;
  inputEnabled: boolean;
  contextEnabled: boolean;
  outputEnabled: boolean;
  injectionDetection: boolean;
  sensitiveData: boolean;
  blockExternalLinks: boolean;
  allowedDomains: string[];
  blockedTerms: string[];
  allowedActions: ("CREATE" | "UPDATE" | "DELETE")[];
  maxChanges: number;
  imageMode: "block" | "read-only" | "scan";
  classifierEnabled: boolean;
  classifierModel: string;
  classifierThreshold: number;
};
export const defaultGuardrailPolicy: GuardrailPolicy = {
  mode: "enforce",
  aiEnabled: true,
  inputEnabled: true,
  contextEnabled: true,
  outputEnabled: true,
  injectionDetection: true,
  sensitiveData: true,
  blockExternalLinks: false,
  allowedDomains: [],
  blockedTerms: [],
  allowedActions: ["CREATE", "UPDATE", "DELETE"],
  maxChanges: 3,
  imageMode: "read-only",
  classifierEnabled: false,
  classifierModel: "",
  classifierThreshold: 0.8,
};
export type GuardrailStage =
  "input" | "context" | "tool" | "tool-result" | "output";
export type GuardrailFinding = {
  rule: string;
  severity: "medium" | "high" | "critical";
};
export type GuardrailResult = {
  imageInspection?: "classified" | "blocked" | "not-inspected" | "failed";
  stage: GuardrailStage;
  decision: "allow" | "monitor" | "block";
  findings: GuardrailFinding[];
};
