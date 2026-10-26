import assert from "node:assert/strict";
import { resolve } from "node:path";

export async function checkWbsImages({ client, load, png, setToken, provider }) {
  setToken("owner-token");
  provider.setCallback(undefined);
  await client.execute("INSERT INTO project_members(project_id,workspace_id,user_id) VALUES ('project','ws','reader')");
  const tasks = [
    ["summary", "WBS-001", "설계 단계", "요약", "설계", "2027-02-01", "2027-03-31", "", []],
    ["design", "WBS-002", "상세 설계", "작업", "설계", "2027-02-01", "2027-03-30", "summary", []],
    ["m1", "WBS-003", "설계 확정", "마일스톤", "설계", "2027-03-31", "2027-03-31", "summary", ["design"]],
    ["build", "WBS-004", "시스템 개발", "작업", "개발", "2027-04-01", "2027-06-29", "", ["m1"]],
    ["m2", "WBS-005", "개발 완료", "마일스톤", "개발", "2027-06-30", "2027-06-30", "", ["build"]],
  ];
  for (const [id, code, title, type, phase, start, end, parentId, dependencies] of tasks) {
    await client.execute({
      sql: "INSERT INTO project_artifacts(id,workspace_id,project_id,kind,code,title,status,fields_json,structure_json,version,created_by,updated_by,created_at,updated_at) VALUES (?,'ws','project','wbs',?,?,'초안',?,?,1,'owner','owner','now','now')",
      args: [id, code, title, JSON.stringify({ taskType: type, phase, startDate: start, endDate: end, plannedEffort: type === "마일스톤" ? "0" : "16", actualEffort: "8", progress: "50", definition: "검증 작업 범위" }), JSON.stringify({ parentId, dependencies })],
    });
  }
  const route = load(resolve("app/api/projects/[projectId]/wbs/image/route.ts"));
  const content = load(resolve("app/api/projects/[projectId]/wbs/image/content/route.ts"));
  const context = { params: Promise.resolve({ projectId: "project" }) };
  const endpoint = "http://localhost:3000/api/projects/project/wbs/image";
  const get = () => route.GET(new Request(endpoint), context);
  let sourceHash = (await (await get()).json()).sourceHash;
  const post = (extra = {}, origin = "http://localhost:3000") => route.POST(new Request(endpoint, { method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify({ model: "gpt-image-2.5-sunburst", prompt: "마일스톤 날짜를 크게 표시", sourceHash, ...extra }) }), context);
  const bytes = (url) => content.GET(new Request(`http://localhost:3000${url}`), context);
  const saved = async () => (await client.execute("SELECT * FROM wbs_images WHERE project_id='project'")).rows[0];
  const locks = async () => (await client.execute("SELECT * FROM wbs_image_generations")).rows.length;
  assert.match(sourceHash, /^[a-f0-9]{64}$/);
  setToken("");
  assert.equal((await get()).status, 401);
  setToken("outsider-token");
  assert.equal((await get()).status, 404);
  setToken("reader-token");
  assert.equal((await get()).status, 200);
  assert.equal((await post()).status, 403);
  setToken("owner-token");
  const before = provider.calls();
  assert.equal((await post({ sourceHash: "stale" })).status, 409);
  assert.equal((await post({}, "https://other.example")).status, 403);
  assert.equal((await post({ model: "gpt-5.6-sol" })).status, 400);
  assert.equal(provider.calls(), before);
  const response = await post();
  assert.equal(response.status, 200, await response.clone().text());
  const first = (await response.json()).image;
  const request = provider.input();
  assert.equal(request.size, "2560x1024");
  assert.equal(request.quality, "high");
  for (const text of ["2027-03-31", "2027-06-30", "WBS-003", "WBS-005", "설계 확정", "개발 완료", "gold diamond", "ONLY for explicit", "do not invent milestone", "마일스톤 날짜를 크게 표시"])
    assert.ok(request.prompt.includes(text), text);
  const rawData = JSON.parse(request.prompt.split("WBS SOURCE DATA:\n")[1].split("\n\nADDITIONAL VISUAL REQUEST:")[0]);
  assert.equal(rawData.tasks.length, tasks.length);
  const codeIndex = rawData.taskColumns.indexOf("code"), dependencyIndex = rawData.taskColumns.indexOf("predecessorCodes");
  assert.deepEqual(rawData.tasks.find((task) => task[codeIndex] === "WBS-004")[dependencyIndex], ["WBS-003"]);
  assert.equal(rawData.phases.find((phase) => phase.phase === "설계").start, "2027-02-01");
  assert.equal(rawData.phases.find((phase) => phase.phase === "개발").end, "2027-06-30");
  const firstStored = await saved();
  assert.notEqual(firstStored.ciphertext_base64, png);
  assert.ok(!JSON.stringify(await (await get()).json()).includes("ciphertext_base64"));
  assert.equal(first.sourceHash, sourceHash);
  assert.equal(await locks(), 0);
  const preview = await bytes(first.url), download = await bytes(`${first.url}&download=1`);
  assert.equal(preview.headers.get("content-type"), "image/png");
  assert.ok(preview.headers.get("cache-control").includes("no-store"));
  assert.ok(download.headers.get("content-disposition").startsWith("attachment"));
  assert.equal(Buffer.from(await preview.arrayBuffer()).toString("base64"), png);
  assert.equal(Buffer.from(await download.arrayBuffer()).toString("base64"), png);
  const callsBeforeReuse = provider.calls();
  assert.equal((await (await post()).json()).reused, true);
  assert.equal(provider.calls(), callsBeforeReuse);
  setToken("reader-token");
  assert.equal((await bytes(first.url)).status, 200);
  assert.equal((await post({ regenerate: true, expectedImageId: first.id })).status, 403);
  setToken("outsider-token");
  assert.equal((await bytes(first.url)).status, 404);
  setToken("owner-token");
  const regen = { regenerate: true, expectedImageId: first.id };
  assert.equal((await post({ ...regen, expectedImageId: "old" })).status, 409);
  await client.execute("UPDATE wbs_images SET source_hash='tampered' WHERE project_id='project'");
  assert.equal((await bytes(first.url)).status, 500);
  await client.execute({ sql: "UPDATE wbs_images SET source_hash=? WHERE project_id='project'", args: [sourceHash] });
  provider.setFailure(true);
  assert.equal((await post(regen)).status, 502);
  provider.setFailure(false);
  assert.equal((await saved()).id, first.id);
  assert.equal(await locks(), 0);
  await client.execute("CREATE TRIGGER fail_wbs_save BEFORE UPDATE ON wbs_images BEGIN SELECT RAISE(ABORT,'save failure'); END");
  assert.equal((await post(regen)).status, 500);
  assert.equal((await saved()).id, first.id);
  assert.equal(await locks(), 0);
  await client.execute("DROP TRIGGER fail_wbs_save");
  let started, resume;
  const startedPromise = new Promise((resolve) => { started = resolve; });
  provider.setCallback(async () => { started(); await new Promise((resolve) => { resume = resolve; }); });
  const pending = post(regen);
  await startedPromise;
  const generatingCalls = provider.calls();
  assert.equal((await post(regen)).status, 409);
  assert.equal(provider.calls(), generatingCalls);
  resume();
  const secondResponse = await pending;
  assert.equal(secondResponse.status, 200, await secondResponse.clone().text());
  const second = (await secondResponse.json()).image;
  assert.notEqual(second.id, first.id);
  assert.equal((await bytes(first.url)).status, 404);
  const secondRegen = { regenerate: true, expectedImageId: second.id };
  provider.setCallback(async () => { await client.execute("UPDATE project_artifacts SET version=version+1 WHERE id='build'"); });
  assert.equal((await post(secondRegen)).status, 409);
  assert.equal((await saved()).id, second.id);
  const afterChange = await (await get()).json();
  assert.notEqual(afterChange.sourceHash, afterChange.image.sourceHash);
  const previousHash = sourceHash;
  sourceHash = afterChange.sourceHash;
  provider.setCallback(async () => { await client.execute("UPDATE project_artifacts SET deleted_at='now' WHERE id='m2'"); });
  assert.equal((await post(secondRegen)).status, 409);
  assert.equal((await saved()).id, second.id);
  assert.equal(await locks(), 0);
  await client.execute("UPDATE project_artifacts SET deleted_at=NULL WHERE id='m2'");
  provider.setCallback(undefined);
  const { wbsSourceHash, wbsImagePrompt } = load(resolve("lib/ai/wbs-image-prompt.ts"));
  const { wbsFor } = load(resolve("lib/ai/wbs-images.ts"));
  const { requireUser } = load(resolve("lib/auth.ts"));
  const actualSource = await wbsFor(client, await requireUser(), "project");
  assert.equal(wbsSourceHash(actualSource.projectName, [...actualSource.tasks].reverse()), actualSource.sourceHash);
  assert.notEqual(wbsSourceHash("다른 프로젝트명", actualSource.tasks), actualSource.sourceHash);
  assert.notEqual(previousHash, actualSource.sourceHash);
  const withoutMilestones = actualSource.tasks.filter((task) => task.fields.taskType !== "마일스톤");
  assert.ok(wbsImagePrompt("프로젝트", withoutMilestones, "").includes("등록된 마일스톤 없음"));
  const alteredDependency = actualSource.tasks.map((task) => task.id === "build" ? { ...task, structure: { ...task.structure, dependencies: [] } } : task);
  assert.notEqual(wbsSourceHash(actualSource.projectName, alteredDependency), actualSource.sourceHash);
  const stableHash = actualSource.sourceHash;
  await client.execute("UPDATE project_artifacts SET deleted_at='now' WHERE kind='wbs'");
  const empty = await (await get()).json();
  assert.notEqual(empty.sourceHash, stableHash);
  assert.equal((await post({ ...secondRegen, sourceHash: empty.sourceHash })).status, 400);
  assert.equal((await saved()).id, second.id);
  await client.execute("DELETE FROM project_members WHERE project_id='project' AND user_id='reader'");
  setToken("reader-token");
  assert.equal((await bytes(second.url)).status, 404);
  setToken("owner-token");
  console.log("PASS: WBS roadmap dates/milestones/dependencies, source fingerprint, authorization, encryption, preview/download reuse, failure preservation, duplicate generation and edits/deletions during generation");
}
