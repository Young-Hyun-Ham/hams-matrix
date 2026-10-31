export type RfpRequirement = {
  id: string;
  number: string;
  category: string;
  title: string;
  definition: string;
  details: string;
  outputs: string;
  acceptance: string;
};

export type RfpScheduleItem = {
  id: string;
  phase: string;
  period: string;
  deliverable: string;
};

export type RfpEvaluationItem = {
  id: string;
  criterion: string;
  description: string;
  points: string;
};

export type RfpDraft = {
  schemaVersion: 1;
  projectId: string;
  title: string;
  basic: {
    organization: string;
    startDate: string;
    endDate: string;
    budget: string;
    background: string;
    objectives: string;
  };
  scope: {
    currentState: string;
    targetUsers: string;
    included: string;
    excluded: string;
    expectedEffects: string;
  };
  requirements: RfpRequirement[];
  delivery: {
    schedule: RfpScheduleItem[];
    organization: string;
    quality: string;
    security: string;
    risks: string;
    support: string;
  };
  proposalGuide: {
    documents: string;
    method: string;
    deadline: string;
    contact: string;
    outline: string;
  };
  evaluation: RfpEvaluationItem[];
  appendix: {
    glossary: string;
    references: string;
    notes: string;
  };
};

export type RfpDocument = { id: string; version: number; draft: RfpDraft; createdAt: string; updatedAt: string; updatedBy: string };
