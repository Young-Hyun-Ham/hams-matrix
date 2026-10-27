import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@libsql/client";
const folder = await mkdtemp(join(tmpdir(), "matrix-team-migration-"));
const client = createClient({ url: pathToFileURL(join(folder, "test.db")).href });
try {
  for (const name of (await readdir("db/migrations")).filter(name => name.endsWith(".sql") && name < "018").sort()) await client.executeMultiple(await readFile(join("db/migrations", name), "utf8"));
  await client.executeMultiple(`
    INSERT INTO users(id,name,account_role) VALUES ('owner','owner','owner'),('approved','approved','user'),('guest','guest','user');
    INSERT INTO workspaces(id,name,owner_id) VALUES ('ws','team','owner');
    INSERT INTO workspace_members(workspace_id,user_id,role) VALUES ('ws','owner','owner'),('ws','approved','viewer'),('ws','guest','viewer');
    INSERT INTO team_join_requests(id,workspace_id,user_id,status) VALUES ('request','ws','approved','approved');
    INSERT INTO projects(id,workspace_id,name,created_by) VALUES ('project','ws','existing','owner');
    INSERT INTO project_members(project_id,workspace_id,user_id) VALUES ('project','ws','approved');
  `);
  await client.executeMultiple(await readFile("db/migrations/018_team_collaboration.sql", "utf8"));
  const members = (await client.execute("SELECT user_id,role,join_source FROM workspace_members ORDER BY user_id")).rows;
  assert.equal(members.find(row => row.user_id === "approved").role, "member");
  assert.equal(members.find(row => row.user_id === "approved").join_source, "application");
  assert.equal(members.find(row => row.user_id === "guest").role, "viewer");
  assert.equal((await client.execute("SELECT owner_id FROM projects")).rows[0].owner_id, "owner");
  assert.equal((await client.execute("SELECT user_id FROM project_members WHERE user_id='owner'")).rows.length, 1);
  assert.ok((await client.execute("SELECT job_title FROM users")).rows.every(row => row.job_title === ""));
  await assert.rejects(client.execute("UPDATE projects SET owner_id=NULL WHERE id='project'"));
  console.log("PASS: existing approvals become members, unrelated viewers remain unchanged, creator ownership/membership is preserved, and job titles default safely.");
} finally { client.close(); }
