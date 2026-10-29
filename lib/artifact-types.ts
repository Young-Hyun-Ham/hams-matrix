export const kinds = [
  "wbs",
  "architecture",
  "requirement",
  "screen",
  "database",
  "program",
  "test",
] as const;
export type ArtifactKind = (typeof kinds)[number];
export const statuses = [
  "초안",
  "검토 중",
  "승인",
  "진행 중",
  "완료",
  "보류",
] as const;
export const requirementCategories = {
  SFR: "기능",
  PER: "성능",
  SIR: "인터페이스",
  DAR: "데이터",
  TER: "테스트",
  SER: "보안",
  QUR: "품질",
  COR: "제약사항",
  PMR: "프로젝트 관리",
  PSR: "프로젝트 지원",
  ECR: "시스템 장비 구성",
} as const;
export type FieldDefinition = {
  key: string;
  label: string;
  required?: boolean;
  options?: readonly string[];
  type?: "date" | "number";
  defaultValue?: string;
};
const owner: FieldDefinition = { key: "owner", label: "담당자" };
const notes: FieldDefinition = { key: "notes", label: "비고" };
export const definitions: Record<
  ArtifactKind,
  { label: string; document: string; prefix: string; fields: FieldDefinition[] }
> = {
  wbs: {
    label: "WBS 작업",
    document: "WBS",
    prefix: "WBS",
    fields: [
      {
        key: "phase",
        label: "단계",
        required: true,
        options: ["착수", "분석", "설계", "개발", "테스트", "검수", "종료"],
      },
      {
        key: "taskType",
        label: "작업 유형",
        required: true,
        options: ["작업", "마일스톤", "요약"],
      },
      { key: "startDate", label: "계획 시작일", required: true, type: "date" },
      { key: "endDate", label: "계획 종료일", required: true, type: "date" },
      {
        key: "plannedEffort",
        label: "계획 공수 (시간)",
        required: true,
        type: "number",
        defaultValue: "0",
      },
      {
        key: "actualEffort",
        label: "실제 공수 (시간)",
        required: true,
        type: "number",
        defaultValue: "0",
      },
      {
        key: "progress",
        label: "진척률 (%) · 요약 작업은 자동 집계",
        required: true,
        type: "number",
        defaultValue: "0",
      },
      { key: "actualStart", label: "실제 시작일", type: "date" },
      { key: "actualEnd", label: "실제 종료일", type: "date" },
      { key: "definition", label: "작업 범위 / 완료 기준", required: true },
      owner,
      notes,
    ],
  },
  architecture: {
    label: "아키텍처",
    document: "아키텍처정의서",
    prefix: "ARC",
    fields: [
      { key: "definition", label: "시스템 구성 개요", required: true },
      { key: "languages", label: "개발 언어" },
      { key: "frameworks", label: "프레임워크 / 버전", required: true },
      { key: "database", label: "DBMS / 버전", required: true },
      { key: "servers", label: "서버 / WAS / 인프라", required: true },
      { key: "deployment", label: "배포 / 네트워크 구성" },
      { key: "security", label: "보안 기준", required: true },
      { key: "performance", label: "성능 기준", required: true },
      {
        key: "standards",
        label: "개발 표준 / 인터페이스 / 예외 기준",
        required: true,
      },
      owner,
      notes,
    ],
  },
  requirement: {
    label: "요구사항",
    document: "요구사항정의서",
    prefix: "SFR",
    fields: [
      {
        key: "category",
        label: "요구사항 분류",
        required: true,
        options: Object.keys(requirementCategories),
      },
      { key: "definition", label: "정의", required: true },
      { key: "details", label: "세부내용", required: true },
      { key: "source", label: "요구사항 출처" },
      { key: "sourceId", label: "원본 요구사항 번호 (RFP)" },
      { key: "outputs", label: "산출정보" },
      { key: "acceptance", label: "검수 기준" },
      {
        key: "needsScreen",
        label: "화면 설계 필요 여부",
        options: ["필요", "해당 없음"],
      },
      {
        key: "needsDatabase",
        label: "DB 설계 필요 여부",
        options: ["필요", "해당 없음"],
        defaultValue: "해당 없음",
      },
      {
        key: "priority",
        label: "우선순위",
        options: ["상", "중", "하"],
        defaultValue: "중",
      },
      owner,
      { key: "notes", label: "비고 / 제약사항" },
    ],
  },
  screen: {
    label: "화면",
    document: "화면설계서",
    prefix: "SCR",
    fields: [
      { key: "definition", label: "화면 개요", required: true },
      { key: "menuPath", label: "메뉴 경로" },
      { key: "url", label: "화면 URL" },
      { key: "layout", label: "화면 구성 / 레이아웃" },
      { key: "inputs", label: "입력 항목 / 유효성 검증" },
      { key: "outputs", label: "출력 항목" },
      { key: "details", label: "이벤트 / 화면 흐름", required: true },
      owner,
      notes,
    ],
  },
  database: {
    label: "테이블",
    document: "데이터베이스설계서",
    prefix: "DB",
    fields: [
      { key: "definition", label: "테이블 개요", required: true },
      { key: "schema", label: "스키마" },
      { key: "physicalName", label: "물리 테이블명", required: true },
      { key: "logicalName", label: "논리 테이블명", required: true },
      { key: "indexes", label: "인덱스 / 복합키 설계" },
      { key: "constraints", label: "제약조건 / 데이터 정책" },
      owner,
      notes,
    ],
  },
  program: {
    label: "프로그램",
    document: "프로그램정의서",
    prefix: "PGM",
    fields: [
      { key: "definition", label: "단위업무 / 프로그램 개요", required: true },
      {
        key: "programType",
        label: "프로그램 유형",
        options: ["온라인", "API", "배치", "공통"],
      },
      { key: "module", label: "컴포넌트 / 모듈 / 소스 경로" },
      { key: "inputs", label: "입력 파라미터" },
      { key: "outputs", label: "출력 / 반환값" },
      { key: "details", label: "처리 로직", required: true },
      { key: "tables", label: "테이블 처리 보충 설명" },
      { key: "exceptions", label: "예외 처리" },
      {
        key: "architectureCompliance",
        label: "아키텍처 준수 검토",
        options: ["미검토", "준수", "예외 승인", "미준수"],
      },
      { key: "reviewer", label: "기술 검토자" },
      { key: "reviewNotes", label: "기술 검토 / 예외 승인 근거" },
      owner,
      notes,
    ],
  },
  test: {
    label: "검증 항목",
    document: "검수결과서",
    prefix: "TST",
    fields: [
      {
        key: "testType",
        label: "검증 유형",
        options: ["단위", "통합", "인수"],
      },
      { key: "definition", label: "검증 시나리오", required: true },
      { key: "expected", label: "기대 결과 / 합격 기준", required: true },
      { key: "actual", label: "실제 결과" },
      {
        key: "result",
        label: "검증 결과",
        required: true,
        options: ["미실행", "통과", "실패", "보류"],
      },
      { key: "evidence", label: "증빙 문서 번호 / URL / 저장 위치" },
      { key: "executedAt", label: "검증일", type: "date" },
      { key: "reviewer", label: "검증자" },
      owner,
      notes,
    ],
  },
};
export const allowedLinks: Record<ArtifactKind, readonly ArtifactKind[]> = {
  wbs: ["architecture", "requirement", "screen", "database", "program", "test"],
  architecture: [],
  requirement: ["requirement", "architecture"],
  screen: ["requirement", "architecture", "database"],
  database: ["requirement", "architecture"],
  program: ["requirement", "screen", "database", "architecture"],
  test: ["requirement", "screen", "database", "program"],
};
export type TableColumn = {
  id: string;
  name: string;
  description: string;
  dataType: string;
  length: string;
  nullable: boolean;
  primaryKey: boolean;
  unique: boolean;
  defaultValue: string;
  reference?: { tableId: string; columnId: string };
};
export type TableOperation = {
  tableId: string;
  operations: ("C" | "R" | "U" | "D")[];
};
export type Baseline = { artifactId: string; version: number };
export type ArchitectureLayer =
  "client" | "gateway" | "frontend" | "backend" | "data" | "external";
export type ArchitectureNode = {
  id: string;
  name: string;
  technology: string;
  layer: ArchitectureLayer;
  shape: "service" | "database";
};
export type ArchitectureEdge = {
  id: string;
  source: string;
  target: string;
  label: string;
};
export type ArchitectureTopology = {
  nodes: ArchitectureNode[];
  edges: ArchitectureEdge[];
};
export type ArtifactStructure = {
  topology?: ArchitectureTopology;
  parentId?: string;
  dependencies?: string[];
  columns?: TableColumn[];
  tableOperations?: TableOperation[];
  baselines?: Baseline[];
};
export type Artifact = {
  id: string;
  projectId: string;
  kind: ArtifactKind;
  code: string;
  title: string;
  status: string;
  fields: Record<string, string>;
  structure?: ArtifactStructure;
  version: number;
  createdAt: string;
  updatedAt: string;
  links: string[];
};
export type Revision = {
  id: string;
  artifactId: string;
  version: number;
  action: string;
  actorName: string;
  occurredAt: string;
  snapshot: Artifact;
};
export type ProjectData = {
  project: { id: string; name: string; description: string; status: string };
  artifacts: Artifact[];
  revisions: Revision[];
  canWrite: boolean;
};
