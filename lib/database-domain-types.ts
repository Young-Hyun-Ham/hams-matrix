import type { DatabaseType } from "./database-data-types";
export const domainRuleVersion = "1";
export type DatabaseDomain = {
  id: string;
  projectId: string;
  logicalName: string;
  logicalKey: string;
  physicalName: string;
  databaseType: DatabaseType | null;
  dataType: string;
  length: string;
  description: string;
  version: number;
  createdAt: string;
  updatedAt: string;
};
export type DomainCatalog = {
  catalogRevision: number;
  ruleVersion: string;
  items: DatabaseDomain[];
};
export type DomainBinding = {
  domainId: string;
  domainVersion: number;
  catalogRevision: number;
  ruleVersion: string;
  sourceLogicalName: string;
  physicalName: string;
  dataType: string;
  length: string;
};
export type DomainSelection = { domainId: string; domainVersion: number };
export type DomainReference = DomainSelection & {
  databaseType: DatabaseType;
  catalogRevision: number;
  ruleVersion: string;
  logicalName: string;
  physicalName: string;
  dataType: string;
  length: string;
};
