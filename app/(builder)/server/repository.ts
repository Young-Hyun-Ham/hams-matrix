import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { Client, Transaction, Row } from "@libsql/client";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/auth";
import { auditStatements } from "@/lib/audit";
import type { User } from "@/lib/types";
import { assertBuilderAccess } from "./access";

type Input = Record<string, unknown>;
type Executor = Pick<Client, "execute">;
export const object = (v: unknown): Input => {
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw new HttpError(400, "올바른 객체가 필요합니다.");
  return v as Input;
};
const text = (v: unknown, max = 200, required = true) => {
  if (typeof v !== "string" || (required && !v.trim()) || v.length > max)
    throw new HttpError(400, "입력 길이와 형식을 확인해 주세요.");
  return v.trim();
};
const integer = (v: unknown, min = 1) => {
  const n = Number(v);
  if (!Number.isSafeInteger(n) || n < min)
    throw new HttpError(400, "올바른 버전 번호가 필요합니다.");
  return n;
};
const json = (v: unknown) => {
  const s = JSON.stringify(v);
  if (!s || Buffer.byteLength(s) > 2_000_000)
    throw new HttpError(413, "저장할 내용이 너무 큽니다.");
  return s;
};
const parse = (v: unknown) => JSON.parse(String(v));
const revision = (p: Input) => integer(p.expectedRevision ?? p.revision);
const type = (v: unknown) => {
  const s = v === "unit" ? "agent" : (v ?? "sub");
  if (!["agent", "multi", "sub"].includes(String(s)))
    throw new HttpError(400, "시나리오 타입을 확인해 주세요.");
  return String(s);
};
function graph(p: Input) {
  const nodes = p.nodes ?? [],
    edges = p.edges ?? [];
  if (
    !Array.isArray(nodes) ||
    !Array.isArray(edges) ||
    nodes.length > 10000 ||
    edges.length > 30000
  )
    throw new HttpError(400, "노드와 연결선 형식을 확인해 주세요.");
  const ids = new Set<string>();
  const cleanNodes = nodes.map((n) => {
    const a = object(n);
    const id = text(a.id, 200);
    if (ids.has(id)) throw new HttpError(400, "중복 노드 ID입니다.");
    ids.add(id);
    const { selected, dragging, ...clean } = a;
    void selected;
    void dragging;
    return clean;
  });
  for (const n of cleanNodes)
    if (n.parentNode && !ids.has(String(n.parentNode)))
      throw new HttpError(400, "그룹 노드를 찾을 수 없습니다.");
  const edgeIds = new Set<string>();
  const cleanEdges = edges.map((e) => {
    const a = object(e);
    const id = text(a.id, 300);
    if (
      edgeIds.has(id) ||
      !ids.has(String(a.source)) ||
      !ids.has(String(a.target))
    )
      throw new HttpError(400, "연결선 참조를 확인해 주세요.");
    edgeIds.add(id);
    const { selected, ...clean } = a;
    void selected;
    return clean;
  });
  const start = p.startNodeId ?? p.start_node_id ?? null;
  if (start !== null && !ids.has(String(start)))
    throw new HttpError(400, "시작 노드를 찾을 수 없습니다.");
  const notes = p.notes ?? [],
    canvasMemos = p.canvasMemos ?? [];
  if (
    !Array.isArray(notes) ||
    !Array.isArray(canvasMemos) ||
    notes.length > 1000 ||
    canvasMemos.length > 1000
  )
    throw new HttpError(400, "메모 형식을 확인해 주세요.");
  for (const memo of [...notes, ...canvasMemos]) {
    const value = object(memo);
    text(value.id, 200);
    text(value.text ?? "", 100000, false);
  }
  return {
    nodes: cleanNodes,
    edges: cleanEdges,
    startNodeId: start,
    notes,
    canvasMemos,
  };
}
export function scenarioDto(r: Row, definition = true) {
  return {
    id: String(r.id),
    name: String(r.name),
    description: String(r.description),
    job: String(r.job),
    scenario_type: String(r.scenario_type),
    revision: Number(r.revision),
    ...(definition ? { commandEnabled: Number(r.command_enabled) === 1 } : {}),
    latest_version: Number(r.latest_version),
    deployed_version:
      r.deployed_version === null ? null : Number(r.deployed_version),
    ltst_ver_id: Number(r.latest_version),
    depn_ver_id:
      r.deployed_version === null ? null : Number(r.deployed_version),
    updatedAt: r.updated_at,
    lastUsedAt: r.last_used_at,
    updated_by: r.updated_by,
    ...(definition ? parse(r.definition_json) : {}),
  };
}
async function scenario(ex: Executor, u: User, id: string) {
  const r = (
    await ex.execute({
      sql: "SELECT * FROM builder_scenarios WHERE workspace_id=? AND id=? AND deleted_at IS NULL",
      args: [u.workspaceId, id],
    })
  ).rows[0];
  if (!r) throw new HttpError(404, "시나리오를 찾을 수 없습니다.");
  return r;
}
async function currentAccess(ex: Executor, u: User) {
  const r = (
    await ex.execute({
      sql: "SELECT u.account_role,u.onboarding_complete,m.role FROM users u JOIN workspace_members m ON m.user_id=u.id WHERE u.id=? AND m.workspace_id=?",
      args: [u.id, u.workspaceId],
    })
  ).rows[0];
  if (!r) throw new HttpError(403, "현재 워크스페이스 접근 권한이 없습니다.");
  assertBuilderAccess({
    ...u,
    accountRole: String(r.account_role) as User["accountRole"],
    role: String(r.role),
    onboardingComplete: !!r.onboarding_complete,
  });
}
async function write<T>(
  request: Request,
  u: User,
  fn: (tx: Transaction) => Promise<T>,
  client = db(),
): Promise<T> {
  assertBuilderAccess(u);
  const conflict = (error: unknown) => {
    const code = String((error as { code?: unknown })?.code ?? "");
    if (/SQLITE_BUSY|SQLITE_LOCKED|TRANSACTION_BUSY|LOCK_TIMEOUT/.test(code))
      return new HttpError(
        409,
        "다른 변경 작업이 진행 중입니다. 다시 조회한 뒤 시도해 주세요.",
      );
    return error;
  };
  let tx: Transaction;
  try {
    tx = await client.transaction("write");
  } catch (error) {
    throw conflict(error);
  }
  try {
    await currentAccess(tx, u);
    const result = await fn(tx);
    await tx.commit();
    return result;
  } catch (e) {
    await tx.rollback();
    throw conflict(e);
  } finally {
    tx.close();
  }
}
async function audit(
  tx: Executor,
  request: Request,
  u: User,
  action: "CREATE" | "UPDATE" | "DELETE",
  resource: string,
  id: string,
) {
  for (const statement of auditStatements(request, {
    user: u,
    action,
    resource,
    resourceId: id,
  }))
    await tx.execute(statement);
}
export async function listScenarios(
  u: User,
  q: URLSearchParams,
  client = db(),
) {
  assertBuilderAccess(u);
  const args: string[] = [u.workspaceId];
  const conditions = ["workspace_id=?", "deleted_at IS NULL"];
  const name = q.get("name");
  if (name) {
    conditions.push("instr(lower(name),lower(?))>0");
    (args as string[]).push(name);
  }
  const kind = q.get("scenario_type");
  if (kind) {
    conditions.push("scenario_type=?");
    (args as string[]).push(type(kind));
  }
  const deployment = q.get("deployment");
  if (deployment === "deployed")
    conditions.push("deployed_version IS NOT NULL");
  if (deployment === "undeployed") conditions.push("deployed_version IS NULL");
  const days: Record<string, number> = {
    week: 7,
    month: 30,
    "7d": 7,
    "30d": 30,
  };
  if (days[q.get("period") ?? ""]) {
    conditions.push("updated_at>=?");
    (args as string[]).push(
      new Date(Date.now() - days[q.get("period")!] * 86400000).toISOString(),
    );
  }
  // Stable ID cursor: the UI applies its presentation sorting after collecting pages.
  const cursor = q.get("cursor");
  if (cursor) {
    conditions.push("id>?");
    (args as string[]).push(cursor);
  }
  const limit = Math.min(integer(q.get("limit") ?? 100), 200);
  const rows = (
    await client.execute({
      sql: `SELECT id,name,description,job,scenario_type,revision,latest_version,deployed_version,updated_at,last_used_at,updated_by FROM builder_scenarios WHERE ${conditions.join(" AND ")} ORDER BY id LIMIT ?`,
      args: [...(args as string[]), limit + 1],
    })
  ).rows;
  return {
    items: rows.slice(0, limit).map((r) => scenarioDto(r, false)),
    nextCursor: rows.length > limit ? String(rows[limit - 1].id) : null,
  };
}
export async function getScenario(u: User, id: string, client = db()) {
  assertBuilderAccess(u);
  return scenarioDto(await scenario(client, u, id));
}
export async function createScenario(
  request: Request,
  u: User,
  p: Input,
  client = db(),
) {
  const id = randomUUID(),
    now = new Date().toISOString(),
    name = text(p.name ?? p.newScenarioName),
    description = text(p.description ?? "", 10000, false),
    job = text(p.job ?? "Process");
  const definition = json(graph(p));
  return write(
    request,
    u,
    async (tx) => {
      await tx.execute({
        sql: "INSERT INTO builder_scenarios(id,workspace_id,name,description,job,scenario_type,definition_json,created_by,updated_by,created_at,updated_at,last_used_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
        args: [
          id,
          u.workspaceId,
          name,
          description,
          job,
          type(p.scenario_type),
          definition,
          u.id,
          u.id,
          now,
          now,
          now,
        ],
      });
      await audit(tx, request, u, "CREATE", "builder_scenario", id);
      return scenarioDto(await scenario(tx, u, id));
    },
    client,
  );
}
export async function updateScenario(
  request: Request,
  u: User,
  id: string,
  p: Input,
  client = db(),
) {
  return write(
    request,
    u,
    async (tx) => {
      const r = await scenario(tx, u, id);
      if (Number(r.revision) !== revision(p))
        throw new HttpError(
          409,
          "다른 변경이 저장되었습니다. 새로 조회한 뒤 다시 시도해 주세요.",
        );
      const old = parse(r.definition_json);
      const def = json(graph({ ...old, ...p }));
      await tx.execute({
        sql: "UPDATE builder_scenarios SET name=?,description=?,job=?,scenario_type=?,definition_json=?,updated_by=?,updated_at=?,revision=revision+1 WHERE workspace_id=? AND id=? AND revision=?",
        args: [
          text(p.name ?? r.name),
          text(p.description ?? r.description, 10000, false),
          text(p.job ?? r.job),
          type(p.scenario_type ?? r.scenario_type),
          def,
          u.id,
          new Date().toISOString(),
          u.workspaceId,
          id,
          revision(p),
        ],
      });
      await audit(tx, request, u, "UPDATE", "builder_scenario", id);
      return scenarioDto(await scenario(tx, u, id));
    },
    client,
  );
}
export async function setScenarioCommand(
  request: Request,
  u: User,
  id: string,
  p: Input,
) {
  if (typeof p.enabled !== "boolean")
    throw new HttpError(400, "커맨드 등록 상태를 확인해 주세요.");
  return write(request, u, async (tx) => {
    const row = await scenario(tx, u, id);
    const currentRevision = Number(row.revision);
    if (currentRevision !== revision(p))
      throw new HttpError(
        409,
        "다른 변경이 저장되었습니다. 다시 조회한 뒤 시도해 주세요.",
      );
    if ((Number(row.command_enabled) === 1) === p.enabled)
      return { id, commandEnabled: p.enabled, revision: currentRevision };
    await tx.execute({
      sql: "UPDATE builder_scenarios SET command_enabled=?, revision=revision+1, updated_by=?, updated_at=? WHERE workspace_id=? AND id=? AND revision=?",
      args: [
        p.enabled ? 1 : 0,
        u.id,
        new Date().toISOString(),
        u.workspaceId,
        id,
        currentRevision,
      ],
    });
    await audit(tx, request, u, "UPDATE", "builder_scenario", id);
    return { id, commandEnabled: p.enabled, revision: currentRevision + 1 };
  });
}
export async function deleteScenarios(
  request: Request,
  u: User,
  p: Input,
  client = db(),
) {
  if (
    !Array.isArray(p.scenarioIds) ||
    !p.scenarioIds.length ||
    p.scenarioIds.length > 200
  )
    throw new HttpError(400, "삭제 대상을 확인해 주세요.");
  const expected = object(p.expectedRevisions);
  return write(
    request,
    u,
    async (tx) => {
      for (const value of [...new Set(p.scenarioIds as string[])]) {
        const id = text(value);
        const r = await scenario(tx, u, id);
        if (Number(r.revision) !== integer(expected[id]))
          throw new HttpError(409, "삭제 대상이 변경되었습니다.");
        const now = new Date().toISOString();
        await tx.execute({
          sql: "UPDATE builder_scenarios SET deleted_at=?,updated_at=?,updated_by=?,revision=revision+1 WHERE workspace_id=? AND id=?",
          args: [now, now, u.id, u.workspaceId, id],
        });
        await audit(tx, request, u, "DELETE", "builder_scenario", id);
      }
      return { deleted: true };
    },
    client,
  );
}
export async function cloneScenario(
  request: Request,
  u: User,
  id: string,
  p: Input,
  client = db(),
) {
  return write(
    request,
    u,
    async (tx) => {
      const r = await scenario(tx, u, id),
        newId = randomUUID(),
        now = new Date().toISOString();
      await tx.execute({
        sql: "INSERT INTO builder_scenarios(id,workspace_id,name,description,job,scenario_type,definition_json,created_by,updated_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        args: [
          newId,
          u.workspaceId,
          text(p.newName ?? `${r.name} 복사`),
          r.description,
          r.job,
          r.scenario_type,
          r.definition_json,
          u.id,
          u.id,
          now,
          now,
        ],
      });
      await audit(tx, request, u, "CREATE", "builder_scenario", newId);
      return scenarioDto(await scenario(tx, u, newId));
    },
    client,
  );
}
function snapshotDto(r: Row) {
  return {
    ...parse(r.snapshot_json),
    id: String(r.id),
    scenario_id: String(r.scenario_id),
    ver_id: Number(r.version_number),
    version: Number(r.version_number),
    createdAt: r.created_at,
  };
}
export async function versions(u: User, id: string, client = db()) {
  assertBuilderAccess(u);
  const current = await scenario(client, u, id);
  return {
    deployed_version:
      current.deployed_version === null
        ? null
        : Number(current.deployed_version),
    version_list: (
      await client.execute({
        sql: "SELECT * FROM builder_scenario_versions WHERE workspace_id=? AND scenario_id=? ORDER BY version_number DESC",
        args: [u.workspaceId, id],
      })
    ).rows.map(snapshotDto),
  };
}
export async function version(u: User, id: string, n: unknown, client = db()) {
  assertBuilderAccess(u);
  await scenario(client, u, id);
  const r = (
    await client.execute({
      sql: "SELECT * FROM builder_scenario_versions WHERE workspace_id=? AND scenario_id=? AND version_number=?",
      args: [u.workspaceId, id, integer(n)],
    })
  ).rows[0];
  if (!r) throw new HttpError(404, "버전을 찾을 수 없습니다.");
  return snapshotDto(r);
}
export async function publish(
  request: Request,
  u: User,
  id: string,
  p: Input,
  client = db(),
) {
  const req = text(p.requestId),
    hash = createHash("sha256").update(json(p)).digest("hex");
  return write(
    request,
    u,
    async (tx) => {
      const r = await scenario(tx, u, id);
      const existing = (
        await tx.execute({
          sql: "SELECT * FROM builder_scenario_versions WHERE workspace_id=? AND scenario_id=? AND request_id=?",
          args: [u.workspaceId, id, req],
        })
      ).rows[0];
      if (existing) {
        if (existing.request_hash !== hash)
          throw new HttpError(409, "같은 요청 ID의 내용이 다릅니다.");
        return {
          ...scenarioDto(r),
          publishedVersion: Number(existing.version_number),
        };
      }
      if (Number(r.revision) !== revision(p))
        throw new HttpError(409, "작업본이 변경되었습니다.");
      const def = graph({ ...parse(r.definition_json), ...p }),
        n = Number(r.latest_version) + 1,
        now = new Date().toISOString();
      const snap = {
        name: text(p.name ?? r.name),
        description: text(p.description ?? r.description, 10000, false),
        job: text(p.job ?? r.job),
        scenario_type: type(p.scenario_type ?? r.scenario_type),
        ...def,
      };
      await tx.execute({
        sql: "UPDATE builder_scenarios SET name=?,description=?,job=?,scenario_type=?,definition_json=?,latest_version=?,revision=revision+1,updated_by=?,updated_at=? WHERE workspace_id=? AND id=?",
        args: [
          snap.name,
          snap.description,
          snap.job,
          snap.scenario_type,
          json(def),
          n,
          u.id,
          now,
          u.workspaceId,
          id,
        ],
      });
      await tx.execute({
        sql: "INSERT INTO builder_scenario_versions(id,workspace_id,scenario_id,version_number,snapshot_json,created_by,created_at,request_id,request_hash) VALUES (?,?,?,?,?,?,?,?,?)",
        args: [
          randomUUID(),
          u.workspaceId,
          id,
          n,
          json(snap),
          u.id,
          now,
          req,
          hash,
        ],
      });
      await audit(tx, request, u, "CREATE", "builder_scenario_version", id);
      return scenarioDto(await scenario(tx, u, id));
    },
    client,
  );
}
export async function restore(
  request: Request,
  u: User,
  id: string,
  p: Input,
  client = db(),
) {
  return write(
    request,
    u,
    async (tx) => {
      const r = await scenario(tx, u, id);
      if (Number(r.revision) !== revision(p))
        throw new HttpError(409, "작업본이 변경되었습니다.");
      const vr = (
        await tx.execute({
          sql: "SELECT snapshot_json FROM builder_scenario_versions WHERE workspace_id=? AND scenario_id=? AND version_number=?",
          args: [u.workspaceId, id, integer(p.versionNumber)],
        })
      ).rows[0];
      if (!vr) throw new HttpError(404, "버전을 찾을 수 없습니다.");
      const s = parse(vr.snapshot_json);
      await tx.execute({
        sql: "UPDATE builder_scenarios SET name=?,description=?,job=?,scenario_type=?,definition_json=?,revision=revision+1,updated_by=?,updated_at=? WHERE workspace_id=? AND id=?",
        args: [
          s.name,
          s.description,
          s.job,
          s.scenario_type,
          json(graph(s)),
          u.id,
          new Date().toISOString(),
          u.workspaceId,
          id,
        ],
      });
      await audit(tx, request, u, "UPDATE", "builder_scenario_restore", id);
      return scenarioDto(await scenario(tx, u, id));
    },
    client,
  );
}
export async function deploy(
  request: Request,
  u: User,
  id: string,
  p: Input,
  client = db(),
) {
  const req = text(p.requestId),
    hash = createHash("sha256").update(json(p)).digest("hex");
  return write(
    request,
    u,
    async (tx) => {
      const r = await scenario(tx, u, id);
      const old = (
        await tx.execute({
          sql: "SELECT * FROM builder_scenario_deployments WHERE workspace_id=? AND scenario_id=? AND request_id=?",
          args: [u.workspaceId, id, req],
        })
      ).rows[0];
      if (old) {
        if (old.request_hash !== hash)
          throw new HttpError(409, "같은 요청 ID의 내용이 다릅니다.");
        return scenarioDto(r);
      }
      if (Number(r.revision) !== revision(p))
        throw new HttpError(409, "작업본이 변경되었습니다.");
      const n = integer(p.versionNumber);
      const v = (
        await tx.execute({
          sql: "SELECT id FROM builder_scenario_versions WHERE workspace_id=? AND scenario_id=? AND version_number=?",
          args: [u.workspaceId, id, n],
        })
      ).rows[0];
      if (!v) throw new HttpError(404, "버전을 찾을 수 없습니다.");
      const now = new Date().toISOString();
      await tx.execute({
        sql: "UPDATE builder_scenarios SET deployed_version=?,revision=revision+1,updated_by=?,updated_at=? WHERE workspace_id=? AND id=?",
        args: [n, u.id, now, u.workspaceId, id],
      });
      await tx.execute({
        sql: "INSERT INTO builder_scenario_deployments(id,workspace_id,scenario_id,version_number,memo,created_by,created_at,request_id,request_hash) VALUES (?,?,?,?,?,?,?,?,?)",
        args: [
          randomUUID(),
          u.workspaceId,
          id,
          n,
          text(p.memo ?? "", 2000, false),
          u.id,
          now,
          req,
          hash,
        ],
      });
      await audit(tx, request, u, "UPDATE", "builder_scenario_deployment", id);
      return scenarioDto(await scenario(tx, u, id));
    },
    client,
  );
}
export async function deployments(
  u: User,
  id: string,
  q: URLSearchParams,
  client = db(),
) {
  assertBuilderAccess(u);
  await scenario(client, u, id);
  const page = integer(q.get("page") ?? 1),
    size = Math.min(integer(q.get("pageSize") ?? 50), 200);
  const total = (
    await client.execute({
      sql: "SELECT count(*) AS n FROM builder_scenario_deployments WHERE workspace_id=? AND scenario_id=?",
      args: [u.workspaceId, id],
    })
  ).rows[0];
  const rows = (
    await client.execute({
      sql: "SELECT * FROM builder_scenario_deployments WHERE workspace_id=? AND scenario_id=? ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?",
      args: [u.workspaceId, id, size, (page - 1) * size],
    })
  ).rows;
  return {
    items: rows.map((r) => ({
      id: r.id,
      ver_id: r.version_number,
      depn_dt: r.created_at,
      depn_usr_id: r.created_by,
      depn_memo: r.memo,
    })),
    totalCount: Number(total.n),
  };
}
export async function lastUsed(
  request: Request,
  u: User,
  id: string,
  client = db(),
) {
  return write(
    request,
    u,
    async (tx) => {
      await scenario(tx, u, id);
      await tx.execute({
        sql: "UPDATE builder_scenarios SET last_used_at=? WHERE workspace_id=? AND id=?",
        args: [new Date().toISOString(), u.workspaceId, id],
      });
      return { ok: true };
    },
    client,
  );
}

type Resource = "forms" | "templates";
const table = (r: Resource) =>
  r === "forms" ? "builder_forms" : "builder_templates";
function resourceDto(r: Row, resource: Resource) {
  return resource === "forms"
    ? {
        id: r.id,
        title: r.title,
        elements: parse(r.elements_json),
        definition: parse(r.definition_json),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        revision: Number(r.revision),
      }
    : {
        ...parse(r.content_json),
        id: r.id,
        name: r.name,
        kind: r.kind,
        revision: Number(r.revision),
      };
}
function elements(v: unknown) {
  if (!Array.isArray(v) || v.length > 2000)
    throw new HttpError(400, "폼 요소 형식을 확인해 주세요.");
  const ids = new Set<string>();
  for (const e of v) {
    const a = object(e),
      id = text(a.id);
    if (ids.has(id)) throw new HttpError(400, "중복 폼 요소 ID입니다.");
    ids.add(id);
    text(a.type);
    if (a.type === "grid") {
      const rows = integer(a.rows),
        columns = integer(a.columns);
      if (rows * columns > 10000)
        throw new HttpError(400, "그리드 크기가 너무 큽니다.");
    }
  }
  return v;
}
export async function listResources(
  u: User,
  r: Resource,
  q: URLSearchParams,
  client = db(),
) {
  assertBuilderAccess(u);
  const kind = q.get("kind"),
    cursor = q.get("cursor"),
    limit = Math.min(integer(q.get("limit") ?? 100), 200);
  const cond = ["workspace_id=?", "deleted_at IS NULL"];
  const args: string[] = [u.workspaceId];
  if (r === "templates" && kind) {
    if (!["api", "form"].includes(kind))
      throw new HttpError(400, "템플릿 타입을 확인해 주세요.");
    cond.push("kind=?");
    args.push(kind);
  }
  if (cursor) {
    cond.push("id>?");
    args.push(cursor);
  }
  const rows = (
    await client.execute({
      sql: `SELECT * FROM ${table(r)} WHERE ${cond.join(" AND ")} ORDER BY id LIMIT ?`,
      args: [...args, limit + 1],
    })
  ).rows;
  return {
    items: rows.slice(0, limit).map((x) => resourceDto(x, r)),
    nextCursor: rows.length > limit ? String(rows[limit - 1].id) : null,
  };
}
export async function getResource(
  u: User,
  r: Resource,
  id: string,
  client = db(),
) {
  assertBuilderAccess(u);
  const row = (
    await client.execute({
      sql: `SELECT * FROM ${table(r)} WHERE workspace_id=? AND id=? AND deleted_at IS NULL`,
      args: [u.workspaceId, id],
    })
  ).rows[0];
  if (!row) throw new HttpError(404, "자료를 찾을 수 없습니다.");
  return resourceDto(row, r);
}
export async function saveResource(
  request: Request,
  u: User,
  r: Resource,
  id: string | null,
  p: Input,
  client = db(),
) {
  return write(
    request,
    u,
    async (tx) => {
      const t = table(r),
        now = new Date().toISOString();
      let old: Row | undefined;
      if (id) {
        old = (
          await tx.execute({
            sql: `SELECT * FROM ${t} WHERE workspace_id=? AND id=? AND deleted_at IS NULL`,
            args: [u.workspaceId, id],
          })
        ).rows[0];
        if (!old) throw new HttpError(404, "자료를 찾을 수 없습니다.");
        if (Number(old.revision) !== revision(p))
          throw new HttpError(409, "자료가 변경되었습니다.");
      }
      const key = id ?? randomUUID();
      const title = text(
        r === "forms" ? (p.title ?? old?.title) : (p.name ?? old?.name),
      );
      const content =
        r === "forms"
          ? json(elements(p.elements ?? (old ? parse(old.elements_json) : [])))
          : json(object(p.content ?? p));
      const definition =
        r === "forms"
          ? json(p.definition ?? (old ? parse(old.definition_json) : {}))
          : undefined;
      const kind = String(p.kind ?? old?.kind ?? "api");
      if (r === "templates" && !["api", "form"].includes(kind))
        throw new HttpError(400, "템플릿 타입을 확인해 주세요.");
      if (r === "templates" && kind === "form") {
        const a = object(p.content ?? p);
        elements(a.elements ?? []);
      }
      if (id)
        await tx.execute({
          sql: `UPDATE ${t} SET ${r === "forms" ? "title=?,elements_json=?,definition_json=?" : "name=?,content_json=?,kind=?"},revision=revision+1,updated_by=?,updated_at=? WHERE workspace_id=? AND id=?`,
          args: [
            title,
            content,
            ...(r === "forms" ? [definition!] : []),
            ...(r === "templates" ? [kind] : []),
            u.id,
            now,
            u.workspaceId,
            key,
          ],
        });
      else
        await tx.execute({
          sql: `INSERT INTO ${t}(id,workspace_id,${r === "forms" ? "title,elements_json,definition_json" : "name,content_json,kind"},created_by,updated_by,created_at,updated_at) VALUES (${"?,?,?,?,?,?,?,?,?"})`,
          args: [
            key,
            u.workspaceId,
            title,
            content,
            ...(r === "forms" ? [definition!] : []),
            ...(r === "templates" ? [kind] : []),
            u.id,
            u.id,
            now,
            now,
          ],
        });
      await audit(
        tx,
        request,
        u,
        id ? "UPDATE" : "CREATE",
        `builder_${r}`,
        key,
      );
      const row = (
        await tx.execute({
          sql: `SELECT * FROM ${t} WHERE workspace_id=? AND id=?`,
          args: [u.workspaceId, key],
        })
      ).rows[0];
      return resourceDto(row, r);
    },
    client,
  );
}
export async function deleteResource(
  request: Request,
  u: User,
  r: Resource,
  id: string,
  p: Input,
  client = db(),
) {
  return write(
    request,
    u,
    async (tx) => {
      const result = await tx.execute({
        sql: `UPDATE ${table(r)} SET deleted_at=?,revision=revision+1,updated_by=? WHERE workspace_id=? AND id=? AND deleted_at IS NULL AND revision=?`,
        args: [new Date().toISOString(), u.id, u.workspaceId, id, revision(p)],
      });
      if (!result.rowsAffected) {
        const found = await tx.execute({
          sql: `SELECT id FROM ${table(r)} WHERE workspace_id=? AND id=? AND deleted_at IS NULL`,
          args: [u.workspaceId, id],
        });
        throw new HttpError(
          found.rows.length ? 409 : 404,
          "자료의 상태가 변경되었습니다.",
        );
      }
      await audit(tx, request, u, "DELETE", `builder_${r}`, id);
      return { deleted: true };
    },
    client,
  );
}
export async function settings(u: User, client = db()) {
  assertBuilderAccess(u);
  const r = (
    await client.execute({
      sql: "SELECT settings_json,revision FROM builder_user_settings WHERE workspace_id=? AND user_id=?",
      args: [u.workspaceId, u.id],
    })
  ).rows[0];
  return r
    ? { settings: parse(r.settings_json), revision: Number(r.revision) }
    : { settings: {}, revision: 0 };
}
export async function saveSettings(
  request: Request,
  u: User,
  p: Input,
  reset = false,
  client = db(),
) {
  return write(
    request,
    u,
    async (tx) => {
      const old = (
        await tx.execute({
          sql: "SELECT revision FROM builder_user_settings WHERE workspace_id=? AND user_id=?",
          args: [u.workspaceId, u.id],
        })
      ).rows[0];
      const expected = integer(p.expectedRevision ?? p.revision, 0);
      if (Number(old?.revision ?? 0) !== expected)
        throw new HttpError(409, "개인 설정이 변경되었습니다.");
      const now = new Date().toISOString();
      const input = reset ? {} : object(p.settings);
      const allowed = ["unuseNodes", "unuseFormElements", "nodeColors"];
      if (Object.keys(input).some((k) => !allowed.includes(k)))
        throw new HttpError(400, "지원하지 않는 설정입니다.");
      for (const key of ["unuseNodes", "unuseFormElements"])
        if (
          input[key] !== undefined &&
          (!Array.isArray(input[key]) ||
            (input[key] as unknown[]).some((x) => typeof x !== "string"))
        )
          throw new HttpError(400, "설정 형식을 확인해 주세요.");
      const next = expected + 1;
      if (old)
        await tx.execute({
          sql: "UPDATE builder_user_settings SET settings_json=?,revision=?,updated_at=? WHERE workspace_id=? AND user_id=?",
          args: [json(input), next, now, u.workspaceId, u.id],
        });
      else
        await tx.execute({
          sql: "INSERT INTO builder_user_settings(workspace_id,user_id,settings_json,revision,created_at,updated_at) VALUES (?,?,?,?,?,?)",
          args: [u.workspaceId, u.id, json(input), next, now, now],
        });
      await audit(tx, request, u, "UPDATE", "builder_settings", u.id);
      return { settings: input, revision: next };
    },
    client,
  );
}
