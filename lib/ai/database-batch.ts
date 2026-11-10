import "server-only";
import { HttpError } from "../auth";
import { definitions } from "../artifact-types";
export { applyDatabaseBatch } from "./database-batch-commit";

export type DatabaseBatchItem = {
  clientRef: string;
  title: string;
  status?: string;
  fields: Record<string, string>;
  links?: string[];
  structure: { columns: Record<string, unknown>[] };
};

// Local references exist only inside this batch. Never trust them as persisted IDs.
export function databaseBatchItems(value: unknown): DatabaseBatchItem[] {
  if (!Array.isArray(value) || !value.length || value.length > 100)
    throw new HttpError(400, "일괄 등록 항목은 1~100개입니다.");
  const items = structuredClone(value) as DatabaseBatchItem[];
  const refs = new Set<string>();
  for (const item of items) {
    if (
      !item ||
      typeof item !== "object" ||
      Array.isArray(item) ||
      Object.keys(item).some(
        (key) =>
          ![
            "clientRef",
            "title",
            "status",
            "fields",
            "links",
            "structure",
          ].includes(key),
      ) ||
      typeof item.clientRef !== "string" ||
      !/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(item.clientRef) ||
      refs.has(item.clientRef) ||
      !item.structure ||
      !Array.isArray(item.structure.columns) ||
      !item.structure.columns.length ||
      item.structure.columns.length > 100 ||
      !item.fields ||
      typeof item.fields !== "object" ||
      Array.isArray(item.fields) ||
      Object.entries(item.fields).some(
        ([key, value]) =>
          typeof value !== "string" ||
          !definitions.database.fields.some((field) => field.key === key),
      )
    )
      throw new HttpError(
        400,
        "테이블의 고유 clientRef·필드·컬럼 형식을 확인해 주세요.",
      );
    refs.add(item.clientRef);
  }
  for (const item of items)
    for (const column of item.structure.columns) {
      if (!column || typeof column !== "object" || Array.isArray(column))
        throw new HttpError(400, "컬럼 형식을 확인해 주세요.");
      const id = (column.reference as { tableId?: unknown } | undefined)
        ?.tableId;
      if (
        typeof id === "string" &&
        id.startsWith("@") &&
        !refs.has(id.slice(1))
      )
        throw new HttpError(400, "일괄 등록 내 FK 대상 clientRef가 없습니다.");
    }
  return items;
}
