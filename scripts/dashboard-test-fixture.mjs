// Isolated synthetic data only. This helper never loads .env or contacts a remote DB.
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { createClient } from "@libsql/client";

export async function dashboardFixture(now = new Date()) {
  const folder = await mkdtemp(join(tmpdir(), "matrix-dashboard-"));
  const url = pathToFileURL(join(folder, "test.db")).href;
  const db = createClient({ url, timeout: 5000 });
  await db.execute("PRAGMA foreign_keys=ON");
  await db.execute("PRAGMA journal_mode=WAL");
  for (const name of (await readdir("db/migrations"))
    .filter((n) => n.endsWith(".sql"))
    .sort())
    await db.executeMultiple(
      (await readFile(join("db/migrations", name), "utf8")).replace(
        /^\uFEFF/,
        "",
      ),
    );
  await db.executeMultiple(`
    INSERT INTO users(id,name,account_role,onboarding_complete) VALUES
      ('dash-owner','Dashboard Owner','user',1),('dash-viewer','Dashboard Viewer','user',1),
      ('dash-outsider','Outsider','user',1),('dash-guest','Guest','guest',1),('dash-empty','Empty','user',1);
    UPDATE user_subscriptions SET plan_code='team' WHERE user_id IN ('dash-owner','dash-viewer','dash-outsider','dash-guest');
    INSERT INTO workspaces(id,name,owner_id,plan,subscription_plan) VALUES
      ('dash-ws','Dashboard workspace','dash-owner','team','team'),
      ('dash-foreign','Foreign workspace','dash-outsider','team','team'),
      ('dash-empty-ws','Empty workspace','dash-empty','free','free');
    INSERT INTO workspace_members(workspace_id,user_id,role) VALUES
      ('dash-ws','dash-owner','owner'),('dash-ws','dash-viewer','viewer'),('dash-ws','dash-guest','viewer'),
      ('dash-ws','dash-outsider','member'),('dash-foreign','dash-outsider','owner'),('dash-empty-ws','dash-empty','owner');
    INSERT INTO projects(id,workspace_id,name,description,created_by,owner_id) VALUES
      ('dash-p1','dash-ws','커머스 플랫폼 고도화','구매와 배송을 연결하는 프로젝트','dash-owner','dash-owner'),
      ('dash-p2','dash-ws','스마트 업무 포털','팀의 업무와 문서를 연결합니다','dash-owner','dash-owner'),
      ('dash-hidden','dash-ws','Secret unassigned','PRIVATE','dash-outsider','dash-outsider'),
      ('dash-foreign-p','dash-foreign','Secret foreign','PRIVATE','dash-outsider','dash-outsider');
    INSERT INTO project_members(project_id,workspace_id,user_id,role) VALUES
      ('dash-p1','dash-ws','dash-owner','admin'),('dash-p1','dash-ws','dash-viewer','viewer'),
      ('dash-p2','dash-ws','dash-owner','admin'),('dash-p1','dash-ws','dash-guest','viewer'),
      ('dash-hidden','dash-ws','dash-outsider','admin'),('dash-foreign-p','dash-foreign','dash-outsider','admin');
  `);
  for (const [id, ws] of [
    ["dash-owner", "dash-ws"],
    ["dash-viewer", "dash-ws"],
    ["dash-outsider", "dash-ws"],
    ["dash-guest", "dash-ws"],
    ["dash-empty", "dash-empty-ws"],
  ]) {
    await db.execute({
      sql: "INSERT INTO sessions(id,token_hash,user_id,workspace_id,created_at,expires_at) VALUES (?,?,?,?,?,?)",
      args: [
        id,
        createHash("sha256").update(`${id}-session`).digest("hex"),
        id,
        ws,
        new Date(Date.now() - 1000).toISOString(),
        new Date(Date.now() + 86400000).toISOString(),
      ],
    });
  }
  const stamp = new Date(now.getTime() - 60000).toISOString();
  const artifacts = [];
  async function artifact(
    id,
    projectId,
    kind,
    status = "초안",
    fields = {},
    structure = {},
    deleted = false,
  ) {
    const ws = projectId === "dash-foreign-p" ? "dash-foreign" : "dash-ws";
    const a = {
      id,
      projectId,
      kind,
      code: id.toUpperCase(),
      title: `${kind} ${id}`,
      status,
      fields,
      structure,
      version: 2,
      createdAt: stamp,
      updatedAt: stamp,
      links: [],
    };
    await db.execute({
      sql: "INSERT INTO project_artifacts(id,workspace_id,project_id,kind,code,title,status,fields_json,structure_json,version,created_by,updated_by,created_at,updated_at,deleted_at) VALUES (?,?,?,?,?,?,?,?,?,2,?,?,?,?,?)",
      args: [
        id,
        ws,
        projectId,
        kind,
        a.code,
        a.title,
        status,
        JSON.stringify(fields),
        JSON.stringify(structure),
        "dash-owner",
        "dash-owner",
        stamp,
        stamp,
        deleted ? stamp : null,
      ],
    });
    artifacts.push(a);
    return a;
  }
  const requirement = await artifact(
    "dash-req",
    "dash-p1",
    "requirement",
    "완료",
    { owner: "담당자", acceptance: "검수 기준" },
  );
  await artifact("dash-screen", "dash-p1", "screen", "검토 중");
  await artifact("dash-program", "dash-p1", "program");
  await artifact("dash-database", "dash-p1", "database");
  await artifact("dash-architecture", "dash-p1", "architecture", "승인");
  await artifact("dash-wbs", "dash-p1", "wbs", "완료", {
    taskType: "작업",
    progress: "100",
    plannedEffort: "10",
    actualEffort: "8",
  });
  const test = await artifact(
    "dash-test",
    "dash-p1",
    "test",
    "승인",
    { result: "통과" },
    { baselines: [{ artifactId: requirement.id, version: 1 }] },
  );
  await db.execute({
    sql: "INSERT INTO artifact_links(source_id,target_id,project_id,workspace_id) VALUES (?,?,'dash-p1','dash-ws')",
    args: [test.id, requirement.id],
  });
  test.links = [requirement.id];
  await artifact("dash-deleted", "dash-p1", "screen", "검토 중", {}, {}, true);
  const p2 = await artifact("dash-p2-req", "dash-p2", "requirement");
  const hidden = await artifact("dash-secret", "dash-hidden", "screen");
  await artifact("dash-foreign-a", "dash-foreign-p", "screen");
  let serial = 100;
  async function revision(a, occurredAt, action = "UPDATE") {
    const version = ++serial;
    await db.execute({
      sql: "INSERT INTO artifact_revisions(id,artifact_id,project_id,workspace_id,version,action,actor_id,actor_name,snapshot_json,occurred_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
      args: [
        `dash-revision-${version}`,
        a.id,
        a.projectId,
        "dash-ws",
        version,
        action,
        "dash-owner",
        "기록 작업자",
        JSON.stringify({ ...a, version }),
        occurredAt,
      ],
    });
  }
  const today = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
  }).format(now);
  const midnight = new Date(`${today}T00:00:00+09:00`).getTime();
  const start = new Date(midnight - 6 * 86400000).toISOString();
  await revision(requirement, start);
  await revision(requirement, new Date(Date.parse(start) - 1).toISOString());
  await revision(requirement, stamp);
  await revision(requirement, stamp, "CREATE");
  await revision(requirement, stamp, "DELETE");
  await revision(requirement, new Date(midnight + 86400000).toISOString());
  await revision(requirement, new Date(now.getTime() + 1).toISOString());
  await revision(p2, stamp);
  for (let i = 0; i < 12; i++) await revision(hidden, stamp);
  return { db, folder, url, now, artifacts, requirement, test, revision };
}
