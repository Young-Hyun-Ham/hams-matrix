import type { Artifact } from "./artifact-types";
import { referencesFor } from "./integration";
export function databaseDeleteReason(table: Artifact, artifacts: Artifact[]) {
  const references = artifacts
    .filter((a) => a.kind === "database")
    .flatMap((a) =>
      (a.structure?.columns ?? []).flatMap((c) =>
        c.reference && (a.id === table.id || c.reference.tableId === table.id)
          ? [`${a.fields.physicalName || a.code}.${c.name}`]
          : [],
      ),
    );
  if (references.length)
    return `FK 연결을 먼저 해제해 주세요: ${references.join(", ")}`;
  if (
    table.links.length ||
    artifacts.some(
      (a) => a.id !== table.id && referencesFor(a).includes(table.id),
    )
  )
    return "연결된 산출물이 있습니다. 연결을 먼저 해제해 주세요.";
  return "";
}
