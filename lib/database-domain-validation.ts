import { HttpError } from "./auth";
import { databaseTypePolicy, isDatabaseType } from "./database-data-types";

export function logicalDomainKey(value: string) {
  return value
    .normalize("NFC")
    .trim()
    .replace(/[\s_]+/gu, "_")
    .toLowerCase();
}
const string = (
  value: unknown,
  label: string,
  max: number,
  required = true,
) => {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (required && !value.trim())
  )
    throw new HttpError(400, `${label} 항목을 확인해 주세요. (최대 ${max}자)`);
  return value.trim();
};
export function domainDataType(
  type: unknown,
  length: unknown = "",
  database?: unknown,
) {
  const raw = string(type, "자료형", 80).toUpperCase();
  const match = /^([A-Z][A-Z0-9_]*)(?:\(\s*(\d+(?:\s*,\s*\d+)?)\s*\))?$/.exec(
    raw,
  );
  if (!match)
    throw new HttpError(
      400,
      "자료형은 VARCHAR2(16), NUMBER(18,2), DATE 등으로 입력해 주세요. 확장 타입 문법은 지원하지 않습니다.",
    );
  const separate = string(length, "길이 / 정밀도", 40, false).replace(
    /\s/g,
    "",
  );
  const embedded = match[2]?.replace(/\s/g, "") ?? "";
  if (embedded && separate && embedded !== separate)
    throw new HttpError(400, "자료형의 길이와 길이 / 정밀도 입력이 다릅니다.");
  const size = embedded || separate;
  if (database !== undefined && database !== null) {
    if (!isDatabaseType(database))
      throw new HttpError(400, "DB 종류를 선택해 주세요.");
    const policy = databaseTypePolicy(database, match[1]);
    if (!policy)
      throw new HttpError(400, "선택한 DB에서 지원하지 않는 자료형입니다.");
    if (!size) {
      if (policy.required)
        throw new HttpError(400, "이 자료형에는 길이가 필요합니다.");
    } else {
      if (policy.parameter === "none")
        throw new HttpError(400, "이 자료형에는 길이를 지정할 수 없습니다.");
      if (!/^(0|[1-9]\d{0,8})(?:,(0|[1-9]\d{0,8}))?$/.test(size))
        throw new HttpError(400, "길이 / 정밀도 형식을 확인해 주세요.");
      const [precision, scale] = size.split(",").map(Number);
      if (
        precision < policy.min! ||
        precision > policy.max! ||
        (size.includes(",") &&
          (policy.parameter !== "precisionScale" ||
            scale > precision ||
            scale > policy.maxScale!))
      )
        throw new HttpError(
          400,
          "선택한 자료형의 길이 / 정밀도 범위를 확인해 주세요.",
        );
    }
    return { dataType: match[1], length: size };
  }
  if (size && !/^[1-9]\d{0,8}(?:,(?:0|[1-9]\d{0,8}))?$/.test(size))
    throw new HttpError(
      400,
      "길이는 양의 정수, 정밀도는 18,2 형식으로 입력해 주세요.",
    );
  if (
    size.includes(",") &&
    Number(size.split(",")[1]) > Number(size.split(",")[0])
  )
    throw new HttpError(400, "스케일은 정밀도보다 클 수 없습니다.");
  if (
    [
      "DATE",
      "CLOB",
      "NCLOB",
      "BLOB",
      "TEXT",
      "BOOLEAN",
      "INTEGER",
      "BIGINT",
    ].includes(match[1]) &&
    size
  )
    throw new HttpError(400, "이 자료형에는 길이를 지정할 수 없습니다.");
  return { dataType: match[1], length: size };
}
export function validateDatabaseDomain(input: Record<string, unknown>) {
  if (
    Object.keys(input).some(
      (k) =>
        ![
          "logicalName",
          "physicalName",
          "dataType",
          "databaseType",
          "length",
          "description",
          "version",
        ].includes(k),
    )
  )
    throw new HttpError(400, "허용되지 않은 도메인 메타 항목입니다.");
  const logicalName = string(input.logicalName, "논리 명칭", 100);
  // NULL is retained only for existing legacy metadata, checked by the mutation layer.
  if (input.databaseType !== null && !isDatabaseType(input.databaseType))
    throw new HttpError(400, "DB 종류를 선택해 주세요.");
  const logicalKey = logicalDomainKey(logicalName);
  if (
    !logicalKey ||
    logicalKey.length > 100 ||
    !/[\p{L}\p{N}]/u.test(logicalKey)
  )
    throw new HttpError(400, "논리 명칭을 확인해 주세요.");
  const physicalName = string(
    input.physicalName,
    "물리 명칭",
    100,
  ).toLowerCase();
  if (!/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/.test(physicalName))
    throw new HttpError(
      400,
      "물리 명칭은 영문자로 시작하는 소문자 snake_case로 입력해 주세요.",
    );
  return {
    logicalName,
    logicalKey,
    physicalName,
    databaseType: input.databaseType as
      | import("./database-data-types").DatabaseType
      | null,
    ...domainDataType(input.dataType, input.length ?? "", input.databaseType),
    description: string(input.description ?? "", "설명", 1000, false),
  };
}
