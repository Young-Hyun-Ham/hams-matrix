import "server-only";
import type { Row } from "@libsql/client";
import { db } from "../db";
import { HttpError } from "../auth";
import { requireConsoleOwner } from "../ai-console-access";
import type { User } from "../types";
import { collectRagSources } from "./rag-sources";
import type {
  IntentClassification,
  IntentClassificationDetail,
  IntentClassificationList,
  IntentReferenceDetail,
} from "./intent-classification-types";

function parseJson(value: unknown, fallback: unknown): unknown {
  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}
export async function intentClassificationReference(
  user: User,
  projectId: string,
  eventId: string,
  referenceIndex: string,
): Promise<IntentReferenceDetail> {
  const tx = await db().transaction("read");
  try {
    await requireConsoleOwner(user, projectId, tx);
    if (
      !eventId ||
      eventId.length > 100 ||
      !/^(0|[1-9]\d{0,5})$/.test(referenceIndex)
    )
      invalid();
    const row = (
      await tx.execute({
        sql: "SELECT generation_id,source_refs_json FROM ai_orchestration_events WHERE workspace_id=? AND project_id=? AND id=?",
        args: [user.workspaceId, projectId, eventId],
      })
    ).rows[0];
    if (!row) throw new HttpError(404, "분류 이력을 찾을 수 없습니다.");
    const reference = references(row)[Number(referenceIndex)];
    if (!reference) throw new HttpError(404, "검색 참조를 찾을 수 없습니다.");
    // Reuse the current source/READ checks. A historical index must not restore
    // content from a deleted source or bypass current source permissions.
    const source = (await collectRagSources(user, projectId, tx)).find(
      (item) =>
        item.type === reference.sourceType && item.id === reference.sourceId,
    );
    const chunk =
      source && row.generation_id && reference.chunkId
        ? (
            await tx.execute({
              sql: "SELECT c.section,c.content FROM project_rag_chunks c JOIN project_rag_sources s ON s.id=c.source_record_id AND s.generation_id=c.generation_id AND s.project_id=c.project_id AND s.workspace_id=c.workspace_id WHERE c.workspace_id=? AND c.project_id=? AND c.generation_id=? AND c.id=? AND s.source_type=? AND s.source_id=? AND s.source_version=?",
              args: [
                user.workspaceId,
                projectId,
                row.generation_id,
                reference.chunkId,
                reference.sourceType,
                reference.sourceId,
                reference.version,
              ],
            })
          ).rows[0]
        : undefined;
    await tx.commit();
    return {
      reference,
      source: source
        ? {
            title: source.title,
            version: source.version,
            content: source.text,
            href: source.href,
            changed: source.version !== reference.version,
          }
        : null,
      chunk: chunk
        ? { section: String(chunk.section), content: String(chunk.content) }
        : null,
    };
  } catch (error) {
    await tx.rollback();
    throw error;
  } finally {
    tx.close();
  }
}
function references(row: Row): IntentClassificationDetail["references"] {
  const raw = parseJson(row.source_refs_json, []);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r) => r && typeof r === "object")
    .map((r) => ({
      sourceType: typeof r.sourceType === "string" ? r.sourceType : "",
      sourceId: typeof r.sourceId === "string" ? r.sourceId : "",
      version: typeof r.version === "string" ? r.version : "",
      chunkId: typeof r.chunkId === "string" ? r.chunkId : "",
    }));
}
function summary(row: Row): IntentClassification {
  const raw = parseJson(row.route_flags_json, {});
  const flags =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const flag = (key: string) =>
    typeof flags[key] === "boolean" ? (flags[key] as boolean) : null;
  return {
    eventId: String(row.id),
    createdAt: String(row.created_at),
    primaryIntent: String(row.primary_intent),
    classifierVersion: Number(row.classifier_version),
    flags: {
      needsRag: flag("needsRag"),
      needsRealtime: flag("needsRealtime"),
      needsExecution: flag("needsExecution"),
      needsClarification: flag("needsClarification"),
    },
    reasonCode: String(row.reason_code ?? ""),
    fallbackCode: row.fallback_code ? String(row.fallback_code) : null,
    durationMs: Number(row.duration_ms),
    referenceCount: Number(row.reference_count ?? references(row).length),
  };
}
function invalid(): never {
  throw new HttpError(400, "검색 조건이나 목록 커서를 확인해 주세요.");
}
function dateBoundary(value: string, end = false) {
  const time = Date.parse(`${value}T00:00:00+09:00`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(time) ||
    new Date(time + 9 * 3600000).toISOString().slice(0, 10) !== value
  )
    invalid();
  return new Date(time + (end ? 86400000 : 0)).toISOString();
}
export async function intentClassifications(
  user: User,
  projectId: string,
  params: URLSearchParams,
): Promise<IntentClassificationList> {
  const tx = await db().transaction("read");
  try {
    await requireConsoleOwner(user, projectId, tx);
    const clauses = ["workspace_id=?", "project_id=?"],
      args: (string | number)[] = [user.workspaceId, projectId];
    const from = params.get("from"),
      to = params.get("to");
    if (from) {
      clauses.push("created_at>=?");
      args.push(dateBoundary(from));
    }
    if (to) {
      clauses.push("created_at<?");
      args.push(dateBoundary(to, true));
    }
    if (from && to && from > to) invalid();
    const intent = params.get("intent");
    if (intent) {
      if (!["rag", "realtime", "execution"].includes(intent)) invalid();
      clauses.push("primary_intent=?");
      args.push(intent);
    }
    for (const key of ["clarification", "fallback"] as const) {
      const value = params.get(key);
      if (!value) continue;
      if (!["true", "false"].includes(value)) invalid();
      clauses.push(
        key === "clarification"
          ? "json_extract(route_flags_json,'$.needsClarification')=?"
          : "(fallback_code IS NOT NULL AND fallback_code!='')=?",
      );
      args.push(value === "true" ? 1 : 0);
    }
    const cursor = params.get("cursor");
    if (cursor) {
      if (cursor.length > 500 || !/^[A-Za-z0-9_-]+$/.test(cursor)) invalid();
      const parsed = parseJson(
        Buffer.from(cursor, "base64url").toString(),
        null,
      );
      if (
        !Array.isArray(parsed) ||
        parsed.length !== 2 ||
        !parsed.every(
          (v) => typeof v === "string" && v.length > 0 && v.length <= 100,
        ) ||
        !Number.isFinite(Date.parse(parsed[0]))
      )
        invalid();
      clauses.push("(created_at<? OR (created_at=? AND id<?))");
      args.push(parsed[0], parsed[0], parsed[1]);
    }
    const rows = await tx.execute({
      sql: `SELECT id,created_at,primary_intent,classifier_version,route_flags_json,reason_code,fallback_code,duration_ms,json_array_length(source_refs_json) AS reference_count FROM ai_orchestration_events WHERE ${clauses.join(" AND ")} ORDER BY created_at DESC,id DESC LIMIT 21`,
      args,
    });
    const page = rows.rows.slice(0, 20),
      last = page.at(-1);
    await tx.commit();
    return {
      events: page.map(summary),
      nextCursor:
        rows.rows.length > 20 && last
          ? Buffer.from(JSON.stringify([last.created_at, last.id])).toString(
              "base64url",
            )
          : null,
    };
  } catch (error) {
    await tx.rollback();
    throw error;
  } finally {
    tx.close();
  }
}
export async function intentClassification(
  user: User,
  projectId: string,
  eventId: string,
): Promise<IntentClassificationDetail> {
  const tx = await db().transaction("read");
  try {
    await requireConsoleOwner(user, projectId, tx);
    if (!eventId || eventId.length > 100) invalid();
    const result = await tx.execute({
      sql: "SELECT id,created_at,primary_intent,classifier_version,route_flags_json,reason_code,fallback_code,duration_ms,generation_id,source_refs_json FROM ai_orchestration_events WHERE workspace_id=? AND project_id=? AND id=?",
      args: [user.workspaceId, projectId, eventId],
    });
    const row = result.rows[0];
    if (!row) throw new HttpError(404, "분류 이력을 찾을 수 없습니다.");
    await tx.commit();
    return {
      ...summary(row),
      generationId: row.generation_id ? String(row.generation_id) : null,
      references: references(row),
    };
  } catch (error) {
    await tx.rollback();
    throw error;
  } finally {
    tx.close();
  }
}
