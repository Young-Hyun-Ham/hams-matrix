import { acceptanceReport, taskMetrics, referencesFor } from "./integration";
import { traceRows, relatedCodes } from "./traceability";
import {
  architectureDocumentFields,
  definitions,
  kinds,
  type Artifact,
  type ProjectData,
} from "./artifact-types";
export type Sheet = { name: string; rows: string[][] };
// Generate a minimal ECMA-376 workbook. Text is always an inline string, never a formula.
const xml = (value: string) =>
  value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function zip(entries: { name: string; data: string }[]) {
  const local: Buffer[] = [],
    central: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name),
      data = Buffer.from(entry.data),
      crc = crc32(data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x0800, 6);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(name.length, 26);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50);
    directory.writeUInt16LE(20, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(0x0800, 8);
    directory.writeUInt32LE(crc, 16);
    directory.writeUInt32LE(data.length, 20);
    directory.writeUInt32LE(data.length, 24);
    directory.writeUInt16LE(name.length, 28);
    directory.writeUInt32LE(offset, 42);
    local.push(header, name, data);
    central.push(directory, name);
    offset += header.length + name.length + data.length;
  }
  const size = central.reduce((n, b) => n + b.length, 0),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(size, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, ...central, end]);
}
function column(index: number) {
  let result = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26))
    result = String.fromCharCode(65 + ((n - 1) % 26)) + result;
  return result;
}
export function workbook(sheets: Sheet[]) {
  const ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  return zip([
    {
      name: "[Content_Types].xml",
      data: `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`,
    },
    {
      name: "_rels/.rels",
      data: '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    },
    {
      name: "xl/workbook.xml",
      data: `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="${ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${xml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`,
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="styles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    },
    {
      name: "xl/styles.xml",
      data: `<?xml version="1.0"?><styleSheet xmlns="${ns}"><fonts count="2"><font><sz val="11"/><name val="맑은 고딕"/></font><font><b/><sz val="11"/><name val="맑은 고딕"/><color rgb="FFFFFFFF"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF5146A6"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
    },
    ...sheets.map((s, i) => ({
      name: `xl/worksheets/sheet${i + 1}.xml`,
      data: `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="${ns}"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="1" width="20" customWidth="1"/><col min="2" max="${Math.max(2, ...s.rows.map((r) => r.length))}" width="32" customWidth="1"/></cols><sheetData>${s.rows.map((row, r) => `<row r="${r + 1}">${row.map((value, c) => `<c r="${column(c)}${r + 1}" s="${r === 0 ? 1 : 0}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`).join("")}</row>`).join("")}</sheetData><autoFilter ref="A1:${column(Math.max(1, ...s.rows.map((r) => r.length)) - 1)}${s.rows.length}"/></worksheet>`,
    })),
  ]);
}
export function exportSheets(data: ProjectData): Sheet[] {
  const artifacts = data.artifacts,
    byId = new Map(artifacts.map((a) => [a.id, a])),
    traces = traceRows(artifacts),
    report = acceptanceReport(artifacts);
  const codes = (list: Artifact[]) => list.map((a) => a.code).join(", ");
  const resolve = (id: string) => byId.get(id)?.code ?? id;
  const docSheet = (kind: Artifact["kind"]): Sheet => ({
    name: definitions[kind].document,
    rows: [
      [
        "프로젝트명",
        `${definitions[kind].label} ID`,
        `${definitions[kind].label}명`,
        "상태",
        ...(kind === "architecture" ? architectureDocumentFields : definitions[kind].fields).map((f) => f.label),
        ...kinds.map((k) => `관련 ${definitions[k].label} ID`),
        "버전",
        "최종 수정 (UTC)",
      ],
      ...artifacts
        .filter((a) => a.kind === kind)
        .map((a) => [
          data.project.name,
          a.code,
          a.title,
          a.status,
          ...(kind === "architecture" ? architectureDocumentFields : definitions[kind].fields).map((f) => a.fields[f.key] ?? ""),
          ...kinds.map((k) => relatedCodes(artifacts, a, k, traces)),
          String(a.version),
          a.updatedAt,
        ]),
    ],
  });
  const sheets: Sheet[] = [
    {
      name: "문서정보",
      rows: [
        ["항목", "내용"],
        ["프로젝트 ID", data.project.id],
        ["프로젝트명", data.project.name],
        ["설명", data.project.description],
        ["생성 시각 (UTC)", new Date().toISOString()],
        ["서식", "통합 산출물 v2 · 기관 지정 원본 서식 미확정"],
        ["관리번호", "프로젝트 내 고유 · 수정 불가 · 삭제 후 재사용 금지"],
        [
          "추적 관계",
          "WBS / 아키텍처 → 요구사항 → 화면·DB → 프로그램 → 개발 WBS → 검증·검수",
        ],
        [
          "진척률 산식",
          "하위 실제 작업의 계획 공수 가중 평균. 계획 공수 0은 가중치 1. 요약 작업 중복 집계 제외.",
        ],
        [
          "검수 점검",
          "문서 승인, 개발 완료, 기술 검토, WBS 배정·완료, 현재 버전의 증빙 검증. 실제 발주처 검수 승인을 대신하지 않음.",
        ],
        [
          "검수 준비",
          report.ready ? "준비 완료" : `확인 필요 ${report.issues.length}건`,
        ],
        ["변경 이력", "프로젝트 변경 이력은 DB에 별도 보존됩니다."],
      ],
    },
  ];
  for (const kind of ["requirement", "screen", "program"] as const)
    sheets.push(docSheet(kind));
  sheets.push({
    name: "요구사항추적표",
    rows: [
      [
        "요구사항 ID",
        "요구사항명",
        "화면 ID",
        "화면명",
        "프로그램 ID",
        "프로그램명",
        "연결 구분",
        "DB ID",
        "물리 테이블명",
        "관련 WBS ID",
        "관련 아키텍처 ID",
        "관련 검증 ID",
      ],
      ...traces.map((row) => [
        row.requirement?.code ?? "",
        row.requirement?.title ?? "",
        row.screen?.code ?? "",
        row.screen?.title ?? "",
        row.program?.code ?? "",
        row.program?.title ?? "",
        row.relation,
        row.database?.code ?? "",
        row.database?.fields.physicalName ?? "",
        row.requirement
          ? relatedCodes(artifacts, row.requirement, "wbs", traces)
          : "",
        row.program
          ? relatedCodes(artifacts, row.program, "architecture", traces)
          : "",
        row.program ? relatedCodes(artifacts, row.program, "test", traces) : "",
      ]),
    ],
  });
  sheets.push({
    name: "연결목록",
    rows: [
      ["참조 항목 ID", "참조 항목명", "대상 항목 ID", "대상 항목명", "관계"],
      ...artifacts.flatMap((a) =>
        referencesFor(a).map((id) => [
          a.code,
          a.title,
          resolve(id),
          byId.get(id)?.title ?? "",
          a.structure?.parentId === id
            ? "WBS 상위 작업"
            : a.structure?.dependencies?.includes(id)
              ? "WBS 선행 작업"
              : a.structure?.columns?.some((c) => c.reference?.tableId === id)
                ? "테이블 FK"
                : a.structure?.tableOperations?.some((op) => op.tableId === id)
                  ? "프로그램 테이블 CRUD"
                  : `${definitions[a.kind].label} → ${byId.has(id) ? definitions[byId.get(id)!.kind].label : ""}`,
        ]),
      ),
    ],
  });
  for (const kind of ["wbs", "architecture", "database", "test"] as const)
    sheets.push(docSheet(kind));
  sheets.push({ ...docSheet("program"), name: "프로그램설계서" });
  sheets.push({
    name: "테이블컬럼정의서",
    rows: [
      [
        "테이블 ID",
        "물리 테이블명",
        "컬럼 ID",
        "컬럼명",
        "논리명 / 설명",
        "자료형",
        "길이 / 정밀도",
        "NULL 허용",
        "PK",
        "UNIQUE",
        "기본값",
        "FK 테이블 ID",
        "FK 컬럼명",
      ],
      ...artifacts
        .filter((a) => a.kind === "database")
        .flatMap((a) =>
          (a.structure?.columns ?? []).map((c) => [
            a.code,
            a.fields.physicalName,
            c.id,
            c.name,
            c.description,
            c.dataType,
            c.length,
            c.nullable ? "Y" : "N",
            c.primaryKey ? "Y" : "N",
            c.unique ? "Y" : "N",
            c.defaultValue,
            c.reference ? resolve(c.reference.tableId) : "",
            c.reference
              ? (byId
                  .get(c.reference.tableId)
                  ?.structure?.columns?.find(
                    (col) => col.id === c.reference!.columnId,
                  )?.name ?? "")
              : "",
          ]),
        ),
    ],
  });
  sheets.push({
    name: "테이블관계",
    rows: [
      ["참조 테이블 ID", "참조 컬럼", "대상 테이블 ID", "대상 컬럼"],
      ...artifacts
        .filter((a) => a.kind === "database")
        .flatMap((a) =>
          (a.structure?.columns ?? [])
            .filter((c) => c.reference)
            .map((c) => [
              a.code,
              c.name,
              resolve(c.reference!.tableId),
              byId
                .get(c.reference!.tableId)
                ?.structure?.columns?.find(
                  (col) => col.id === c.reference!.columnId,
                )?.name ?? "",
            ]),
        ),
    ],
  });
  sheets.push({
    name: "프로그램테이블CRUD",
    rows: [
      [
        "프로그램 ID",
        "프로그램명",
        "테이블 ID",
        "물리 테이블명",
        "C",
        "R",
        "U",
        "D",
      ],
      ...artifacts
        .filter((a) => a.kind === "program")
        .flatMap((a) =>
          (a.structure?.tableOperations ?? []).map((op) => [
            a.code,
            a.title,
            resolve(op.tableId),
            byId.get(op.tableId)?.fields.physicalName ?? "",
            ...(["C", "R", "U", "D"] as const).map((v) =>
              op.operations.includes(v) ? "Y" : "",
            ),
          ]),
        ),
    ],
  });
  sheets.push({
    name: "WBS진척집계",
    rows: [
      [
        "WBS ID",
        "작업명",
        "상위 WBS ID",
        "선행 WBS ID",
        "단계",
        "작업 유형",
        "계획 시작일",
        "계획 종료일",
        "계획 공수 (시간)",
        "실제 공수 (시간)",
        "진척률 (%)",
        "담당자",
        "배정 산출물 ID",
      ],
      ...artifacts
        .filter((a) => a.kind === "wbs")
        .map((a) => {
          const m = taskMetrics(artifacts, a);
          return [
            a.code,
            a.title,
            a.structure?.parentId ? resolve(a.structure.parentId) : "",
            (a.structure?.dependencies ?? []).map(resolve).join(", "),
            a.fields.phase,
            a.fields.taskType,
            a.fields.startDate,
            a.fields.endDate,
            String(m.plannedEffort),
            String(m.actualEffort),
            String(m.progress),
            a.fields.owner ?? "",
            a.links.map(resolve).join(", "),
          ];
        }),
    ],
  });
  sheets.push({
    name: "검증기준버전",
    rows: [
      [
        "검증 / 기술검토 ID",
        "문서 ID",
        "확인 버전",
        "현재 버전",
        "재확인 필요",
      ],
      ...artifacts
        .filter((a) => a.kind === "test" || a.kind === "program")
        .flatMap((a) =>
          (a.structure?.baselines ?? []).map((b) => [
            a.code,
            resolve(b.artifactId),
            String(b.version),
            String(byId.get(b.artifactId)?.version ?? "삭제됨"),
            byId.get(b.artifactId)?.version === b.version ? "N" : "Y",
          ]),
        ),
    ],
  });
  sheets.push({
    name: "통합검수점검",
    rows: [
      [
        "요구사항 ID",
        "요구사항명",
        "아키텍처 ID",
        "화면 ID",
        "DB ID",
        "프로그램 ID",
        "WBS ID",
        "검증 ID",
        "검수 준비",
        "확인 사항",
      ],
      ...report.requirements.map((r) => [
        r.requirement.code,
        r.requirement.title,
        codes(r.architectures),
        codes(r.screens),
        codes(r.databases),
        codes(r.programs),
        codes(r.tasks),
        codes(r.tests),
        r.ready ? "준비 완료" : "확인 필요",
        r.issues.map((i) => `${i.code}: ${i.message}`).join("\n"),
      ]),
    ],
  });
  sheets.push({
    name: "미비사항목록",
    rows: [
      ["관리번호", "확인 사항"],
      ...report.issues.map((i) => [i.code, i.message]),
    ],
  });
  return sheets;
}
