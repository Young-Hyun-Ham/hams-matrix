import "server-only";
import type { Client } from "@libsql/client";
import type { User } from "./types";
import { HttpError } from "./auth";
import { domainCatalog } from "./database-domains";
import type { DomainCatalog } from "./database-domain-types";
import { resolveDatabaseColumns } from "./database-domain-resolver";
const prepared = new WeakMap<
  object,
  {
    userId: string;
    workspaceId: string;
    projectId: string;
    catalogRevision: number;
    ruleVersion: string;
    result: ReturnType<typeof resolveDatabaseColumns>;
  }
>();
export function hasPreparedDatabaseInput(input: object) {
  return prepared.has(input);
}
export function prepareDatabaseInput(
  input: object,
  columns: unknown,
  catalog: DomainCatalog,
  user: User,
  projectId: string,
) {
  const result = resolveDatabaseColumns(columns, catalog);
  prepared.set(input, {
    userId: user.id,
    workspaceId: user.workspaceId,
    projectId,
    catalogRevision: catalog.catalogRevision,
    ruleVersion: catalog.ruleVersion,
    result,
  });
  return result;
}
export async function preparedDatabaseInput(
  input: object,
  executor: Pick<Client, "execute">,
  user: User,
  projectId: string,
  knownCatalog?: DomainCatalog,
) {
  const value = prepared.get(input);
  if (!value) return undefined;
  if (
    value.userId !== user.id ||
    value.workspaceId !== user.workspaceId ||
    value.projectId !== projectId
  )
    throw new HttpError(403, "메타 적용 범위가 다릅니다.");
  const catalog =
    knownCatalog ?? (await domainCatalog(executor, user, projectId));
  if (
    catalog.catalogRevision !== value.catalogRevision ||
    catalog.ruleVersion !== value.ruleVersion
  )
    throw new HttpError(
      409,
      "도메인 메타가 변경되었습니다. 메타를 다시 조회한 뒤 재생성해 주세요.",
    );
  return value.result;
}
