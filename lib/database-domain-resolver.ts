import { HttpError } from "./auth";
import type {
  DomainBinding,
  DomainCatalog,
  DatabaseDomain,
} from "./database-domain-types";
import { logicalDomainKey } from "./database-domain-validation";

export function resolveDatabaseColumns(
  columns: unknown,
  catalog: DomainCatalog,
) {
  if (!Array.isArray(columns) || !columns.length || columns.length > 100)
    throw new HttpError(400, "컬럼을 1~100개 등록해 주세요.");
  const byKey = new Map(catalog.items.map((d) => [d.logicalKey, d]));
  const bindings = new Map<string, DomainBinding>();
  let matched = 0;
  const names = new Set<string>();
  const resolved = columns.map((value: unknown): Record<string, unknown> => {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new HttpError(400, "컬럼 형식을 확인해 주세요.");
    const c = { ...value } as Record<string, unknown>;
    if (c.domainBinding !== undefined)
      throw new HttpError(400, "도메인 적용 정보는 서버가 생성합니다.");
    if (
      typeof c.logicalName !== "string" ||
      !c.logicalName.trim() ||
      c.logicalName.length > 100
    )
      throw new HttpError(
        400,
        "AI 신규 컬럼에는 논리명(logicalName)이 필요합니다.",
      );
    const logicalName = c.logicalName.trim(),
      key = logicalDomainKey(logicalName);
    const exact = byKey.get(key);
    let primary: DatabaseDomain | undefined = exact;
    const parts: string[] = [];
    if (!exact) {
      const tokens = key.split("_");
      const domains: DatabaseDomain[] = [];
      let unresolved = false;
      for (let i = 0; i < tokens.length; ) {
        let found: DatabaseDomain | undefined,
          consumed = 0;
        for (let end = tokens.length; end > i; end--) {
          const d = byKey.get(tokens.slice(i, end).join("_"));
          if (d) {
            found = d;
            consumed = end - i;
            break;
          }
        }
        if (found) {
          domains.push(found);
          parts.push(found.physicalName);
          i += consumed;
        } else {
          if (tokens[i] === "아이디" || tokens[i] === "id") parts.push("id");
          else unresolved = true;
          i++;
        }
      }
      if (domains.length && unresolved)
        throw new HttpError(
          400,
          `${logicalName}: 일부 용어가 도메인 메타에 없습니다. 전체 명칭 또는 남은 용어를 등록해 주세요.`,
        );
      if (domains.length) {
        primary = domains[0];
        if (
          domains.some(
            (d) =>
              d.dataType !== primary!.dataType || d.length !== primary!.length,
          )
        )
          throw new HttpError(
            400,
            `${logicalName}: 자료형이 충돌합니다. 복합 명칭 메타를 등록해 주세요.`,
          );
      }
    }
    if (primary) {
      const name = exact ? exact.physicalName : parts.join("_");
      const binding: DomainBinding = {
        domainId: primary.id,
        domainVersion: primary.version,
        catalogRevision: catalog.catalogRevision,
        ruleVersion: catalog.ruleVersion,
        sourceLogicalName: logicalName,
        physicalName: name,
        dataType: primary.dataType,
        length: primary.length,
      };
      if (typeof c.id !== "string")
        throw new HttpError(400, "컬럼 ID가 필요합니다.");
      bindings.set(c.id, binding);
      Object.assign(c, {
        name,
        dataType: primary.dataType,
        length: primary.length,
      });
      matched++;
    }
    const name = typeof c.name === "string" ? c.name.trim().toLowerCase() : "";
    if (!name || name.length > 100 || names.has(name))
      throw new HttpError(
        400,
        "메타 적용 후 컬럼 물리명이 비어 있거나 중복·길이 제한을 위반합니다.",
      );
    names.add(name);
    return { ...c, logicalName };
  });
  return {
    columns: resolved,
    bindings,
    matched,
    unmatched: columns.length - matched,
  };
}
