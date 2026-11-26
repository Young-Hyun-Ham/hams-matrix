type Timestamp = number;
import { Node } from "reactflow";

export type ScenarioType = "agent" | "multi" | "sub";

type Scenario = {
  commandEnabled?: boolean;
  id?: string;
  category_id?: string;
  edges?: any[];
  nodes?: any[];
  job?: string;
  name: string;
  startNodeId?: string;
  description: string;
  scenario_type?: ScenarioType;
  version_yn?: boolean;
  ltst_ver_id?: any;
  depn_ver_id?: any;
  [key: string]: any;
};

type TreeItem = {
  id: string;
  index: number;
  label: string;
  type?: string;
  children: TreeItem[];
};

type VersionTreeItem = {
  id: string;
  index: number;
  label: string;
  type?: string;
  snro_id?: string;
  ver_id?: string;
  depn_yn?: string;
  children: VersionTreeItem[];
};

type DB_TYPE = "turso";

type InsertTarget = {
  sourceId?: string | null;
  sourceHandle?: string | null;
  targetId?: string | null;
  parentId?: string | null;
};

type AddNodeData = {
  target: InsertTarget;
  onAdd: (target: InsertTarget) => void;
};

export type NodeTitleData = {
  /** Persisted canvas title; optional for legacy scenarios, defaulting to the type label. */
  title?: string;
};

type BuilderNodeData = NodeTitleData & {
  id?: string;
  label?: string;
  content?: string;
  replies?: Array<{ display?: string; value?: string }>;
  conditions?: Array<any>;
  evaluationType?: string;
  flowCollapsed?: boolean;
  flowGroupHeight?: number;
  [key: string]: any;
};

type BuilderNode = Node<BuilderNodeData>;

export type {
  Scenario,
  TreeItem,
  VersionTreeItem,
  DB_TYPE,
  InsertTarget,
  AddNodeData,
  BuilderNodeData,
  BuilderNode,
};

export const LOCALE_LIST = [
  { value: "ko", label: "Korea" },
  { value: "en", label: "America" },
  { value: "vn", label: "Vietnam" },
  { value: "jp", label: "Japan" },
] as const;

export type LOCALE_TIME = (typeof LOCALE_LIST)[number]["value"];
export type LOCALE_TIME_TYPE = {
  date: Timestamp;
  locale: LOCALE_TIME;
};
