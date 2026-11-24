import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { HttpError } from "../auth";

// A durable replay journal: replay completed model responses and preview tools,
// then continue at the first incomplete operation. Never replay committed writes.
export type ExecutionJournal = {
  format: 1;
  logicalRequestId?: string;
  sourceHash?: string;
  policyVersion?: number;
  turn?: { id: string; seq: number };
  historyContext?: {
    ids: string[];
    messages: Record<string, unknown>[];
    hash: string;
  };
  entries: Record<string, unknown>;
  grants: string[];
  inspections: number;
  elapsed: number;
};
type Execution = {
  journal: ExecutionJournal;
  counters: Record<string, number>;
  approvalId?: string;
  started: number;
};
const storage = new AsyncLocalStorage<Execution>();
export function executionHash(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(value) ?? "null")
    .digest("hex");
}
export function executionContext() {
  return storage.getStore();
}
export function runExecution<T>(
  fn: () => T,
  journal?: ExecutionJournal,
  approvalId?: string,
): T {
  if (storage.getStore()) return fn();
  return storage.run(
    {
      journal: journal ?? {
        format: 1,
        entries: {},
        grants: [],
        inspections: 0,
        elapsed: 0,
      },
      counters: {},
      approvalId,
      started: Date.now(),
    },
    fn,
  );
}
export async function journalStep<T>(
  kind: string,
  input: unknown,
  perform: () => Promise<T>,
) {
  const scope = storage.getStore();
  if (!scope) return { key: "", value: await perform(), replayed: false };
  const base = `${kind}:${executionHash(input)}`;
  const ordinal = scope.counters[base] ?? 0;
  scope.counters[base] = ordinal + 1;
  const key = `${base}:${ordinal}`;
  const saved = scope.journal.entries[key] as
    | { value: T; counters: Record<string, number> }
    | undefined;
  if (saved) {
    Object.assign(scope.counters, saved.counters);
    return { key, value: structuredClone(saved.value), replayed: true };
  }
  const value = await perform();
  scope.journal.entries[key] = {
    value: structuredClone(value),
    counters: { ...scope.counters },
  };
  return { key, value, replayed: false };
}
export function countInspection() {
  const scope = storage.getStore();
  if (scope && ++scope.journal.inspections > 40)
    throw new HttpError(422, "가드레일 검사 횟수를 초과했습니다.");
}
export function snapshotExecution() {
  const scope = storage.getStore();
  if (!scope) throw new HttpError(409, "재개 상태를 찾을 수 없습니다.");
  return {
    ...scope.journal,
    elapsed: scope.journal.elapsed + Date.now() - scope.started,
  };
}
