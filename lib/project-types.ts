export type TeamMember = { id: string; name: string; role: string };
export type Project = {
  id: string;
  name: string;
  description: string;
  status: string;
  createdAt: string;
  members: TeamMember[];
  stats?: {
    requirements: number;
    screens: number;
    programs: number;
    completed: number;
    wbs?: number;
    architectures?: number;
    databases?: number;
    tests?: number;
    wbsProgress?: number;
    plannedEffort?: number;
    actualEffort?: number;
    acceptanceReady?: boolean;
    acceptanceIssues?: number;
  };
};
