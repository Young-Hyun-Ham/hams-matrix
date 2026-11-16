import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import ts from "typescript";
import { dashboardFixture } from "./dashboard-test-fixture.mjs";

const fixture = await dashboardFixture(
  new Date("2026-11-13T03:00:00.000Z"),
  "044_personal_theme_presets.sql",
);
const { db } = fixture;
const require = createRequire(import.meta.url),
  cache = new Map();
let token = "dash-owner-session";
let restrictScreen = false;
let providerCalls = 0,
  generatedPlan = null;
let fileText = "Synthetic file source";
let lastAiOptions,
  renewDuringCall = false,
  renewedLease = false,
  cancelCalls = 0;
function load(file) {
  if (file === resolve("lib/ai/background-response.ts"))
    return {
      activeResponse: (status) => ["queued", "in_progress"].includes(status),
      retrieveResponse: async (id, cancel) => {
        if (cancel) cancelCalls++;
        return { id, status: cancel ? "cancelled" : "in_progress" };
      },
    };
  if (file === resolve("lib/r2.ts"))
    return { getDocument: async () => Buffer.from(fileText) };
  if (file === resolve("lib/ai-server.ts"))
    return {
      aiModels: async () => ["gpt-test"],
      generateAi: async (...args) => {
        providerCalls++;
        lastAiOptions = args[8];
        await lastAiOptions?.onResponse?.(
          lastAiOptions.resumeResponseId ?? "resp-worker-test",
        );
        if (renewDuringCall) {
          const before = (
            await db.execute(
              "SELECT lease_until FROM project_deliverable_generation_requests WHERE lease_token IS NOT NULL LIMIT 1",
            )
          ).rows[0];
          const originalNow = Date.now;
          Date.now = () => originalNow() + 21000;
          try {
            await args[7]();
          } finally {
            Date.now = originalNow;
          }
          const after = (
            await db.execute(
              "SELECT lease_until FROM project_deliverable_generation_requests WHERE lease_token IS NOT NULL LIMIT 1",
            )
          ).rows[0];
          renewedLease = after.lease_until > before.lease_until;
        }
        return JSON.stringify(generatedPlan);
      },
    };
  if (file === resolve("lib/db.ts")) return { db: () => db };
  if (cache.has(file)) return cache.get(file).exports;
  const mod = { exports: {} };
  cache.set(file, mod);
  const code = ts.transpileModule(readFileSync(file, "utf8"), {
    fileName: file,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
  new Function("require", "module", "exports", code)(
    (name) => {
      if (name === "server-only") return {};
      if (name === "next/headers")
        return {
          cookies: async () => ({
            get: () => (token ? { value: token } : undefined),
          }),
        };
      if (name === "next/server") return { connection: async () => {} };
      if (!name.startsWith(".") && !name.startsWith("@/")) return require(name);
      const base = name.startsWith("@/")
        ? resolve(name.slice(2))
        : resolve(dirname(file), name);
      const target = [base, `${base}.ts`, `${base}.tsx`, `${base}.json`].find(
        existsSync,
      );
      if (!target) throw Error(`Missing module ${base}`);
      if (target.endsWith(".json"))
        return JSON.parse(readFileSync(target, "utf8"));
      const result = load(target);
      // READ is fixed true in today's policy. Exercise future restricted READ using the real
      // permission resolver with only its returned screen READ value narrowed (never broadened).
      if (target === resolve("lib/project-permissions.ts"))
        return {
          ...result,
          projectPermissionAccess: async (...args) => {
            const access = await result.projectPermissionAccess(...args);
            if (restrictScreen) access.permissionsByTab.screen.READ = false;
            return access;
          },
        };
      return result;
    },
    mod,
    mod.exports,
  );
  return mod.exports;
}

try {
  // Exercise a populated parent rebuild with existing links, revisions and planning-board FK.
  const before = (
    await db.execute("SELECT * FROM project_artifacts ORDER BY id")
  ).rows;
  const oldLinks = (
    await db.execute(
      "SELECT * FROM artifact_links ORDER BY source_id,target_id,relation",
    )
  ).rows;
  const oldRevisions = (
    await db.execute("SELECT * FROM artifact_revisions ORDER BY id")
  ).rows;
  const screen = before.find((a) => a.kind === "screen");
  await db.execute({
    sql: "INSERT INTO planning_boards(id,workspace_id,project_id,screen_artifact_id,document_json,created_by,updated_by,created_at,updated_at) VALUES ('migration-board','dash-ws','dash-p1',?,'{}','dash-owner','dash-owner','2026-11-13','2026-11-13')",
    args: [screen.id],
  });
  await db.execute(
    "INSERT INTO ai_conversations(conv_id,workspace_id,user_id,project_id,title,created_at,updated_at,target_page,target_version) VALUES ('old-conv','dash-ws','dash-owner','dash-p1','Existing conversation','2026-11-13','2026-11-13','program',5)",
  );
  await db.executeMultiple(
    "BEGIN IMMEDIATE;" +
      readFileSync("db/migrations/045_deliverable_generation.sql", "utf8") +
      "COMMIT;",
  );
  assert.deepEqual((await db.execute("PRAGMA foreign_key_check")).rows, []);
  assert.deepEqual(
    (await db.execute("PRAGMA integrity_check")).rows.map(
      (r) => r.integrity_check,
    ),
    ["ok"],
  );
  const migrated = (
    await db.execute("SELECT * FROM project_artifacts ORDER BY id")
  ).rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).filter(([key]) => key !== "detail_level"),
    ),
  );
  assert.deepEqual(migrated, before);
  assert.deepEqual(
    (
      await db.execute(
        "SELECT * FROM artifact_links ORDER BY source_id,target_id,relation",
      )
    ).rows,
    oldLinks,
  );
  assert.deepEqual(
    (await db.execute("SELECT * FROM artifact_revisions ORDER BY id")).rows,
    oldRevisions,
  );
  assert.equal(
    (
      await db.execute(
        "SELECT target_version FROM ai_conversations WHERE conv_id='old-conv'",
      )
    ).rows[0].target_version,
    5,
  );
  assert.equal(
    (await db.execute("SELECT COUNT(*) AS n FROM planning_boards")).rows[0].n,
    1,
  );
  await db.execute(
    "UPDATE ai_conversations SET target_page='function' WHERE conv_id='old-conv'",
  );
  await assert.rejects(
    () => db.execute("UPDATE artifact_revisions SET actor_name='tampered'"),
    /immutable/i,
  );
  const user = await load(resolve("lib/auth.ts")).requireUser();
  const artifacts = load(resolve("lib/artifacts.ts"));
  const { createEmptyRfp } = load(resolve("lib/rfp-template.ts"));
  const { mutateRfp } = load(resolve("lib/rfp-server.ts"));
  const request = new Request("http://localhost:3000/api/test", {
    method: "POST",
  });
  const draft = createEmptyRfp("dash-p1");
  draft.title = "Synthetic procurement";
  draft.scope.included = "Account registration and customer data";
  await mutateRfp(request, user, "dash-p1", { draft }, "CREATE");
  const policy = {
    ...load(resolve("lib/ai/guardrail-types.ts")).defaultGuardrailPolicy,
    maxChanges: 20,
  };
  await db.execute({
    sql: "INSERT INTO ai_guardrail_policies(workspace_id,version,config_json,published_by,published_at) VALUES ('dash-ws',1,?,'dash-owner','2026-11-13')",
    args: [JSON.stringify(policy)],
  });
  await db.execute({
    sql: "INSERT INTO ai_guardrail_configs(workspace_id,active_version,draft_json,updated_by,updated_at) VALUES ('dash-ws',1,?,'dash-owner','2026-11-13')",
    args: [JSON.stringify(policy)],
  });
  const service = load(resolve("lib/ai/deliverable-generation.ts"));
  const { randomUUID } = require("node:crypto");
  const kinds = [
    "wbs",
    "requirement",
    "screen",
    "function",
    "database",
    "program",
  ];
  function plan(suffix = "") {
    return {
      complete: true,
      coverage: kinds.map((kind) => ({ kind, reason: "Synthetic coverage" })),
      items: kinds.map((kind, i) => ({
        clientRef: "@item" + i,
        kind,
        title: "Generated " + kind + suffix,
        purpose: "Synthetic document purpose",
        summary: "Initial data",
        definition: "Initial definition",
        details: "Initial details",
        category: kind === "requirement" ? "SFR" : "",
        links:
          kind === "wbs"
            ? ["@item5"]
            : kind === "requirement"
              ? []
              : kind === "function"
                ? ["@item1", "@item2", "@item4"]
                : kind === "program"
                  ? ["@item3", "@item2", "@item4"]
                  : ["@item1"],
        sourceIndex: 0,
        excerpt: "",
        rationale: "Derived initial design",
        origin: "설계 도출",
      })),
    };
  }
  async function start() {
    const requestId = randomUUID();
    const input = {
      requestId,
      sources: [{ type: "rfp" }],
      targets: kinds,
      model: "gpt-test",
      prompt: "Create initial documents",
    };
    const result = await service.startDeliverables(
      request,
      user,
      "dash-p1",
      input,
    );
    return { requestId, input, result };
  }
  generatedPlan = plan();
  const first = await start();
  assert.equal(first.result.stage, 0);
  assert.deepEqual(
    await service.startDeliverables(request, user, "dash-p1", first.input),
    first.result,
  );
  await assert.rejects(
    () =>
      service.startDeliverables(request, user, "dash-p1", {
        ...first.input,
        prompt: "Different",
      }),
    (e) => e.status === 409,
  );
  let state = await service.continueDeliverables(
    request,
    user,
    "dash-p1",
    first.requestId,
    {},
  );
  assert.equal(state.status, "validating");
  state = await service.continueDeliverables(
    request,
    user,
    "dash-p1",
    first.requestId,
    {},
  );
  assert.equal(state.status, "completed");
  assert.equal(state.result.length, 6);
  assert.equal(providerCalls, 1);
  assert.deepEqual(
    await service.continueDeliverables(
      request,
      user,
      "dash-p1",
      first.requestId,
      {},
    ),
    state,
  );
  assert.equal(providerCalls, 1);
  const data = await artifacts.projectData(db, user, "dash-p1");
  const fn = data.artifacts.find((a) => a.kind === "function");
  assert.equal(fn.detailLevel, "skeleton");
  assert.equal(fn.sources.length, 1);
  assert.match(fn.code, /^FNC-/);
  const metrics = load(resolve("lib/integration.ts")).taskMetrics([
    {
      id: "pending-parent",
      kind: "wbs",
      detailLevel: "skeleton",
      fields: { taskType: "요약" },
      structure: {},
      links: [],
    },
    {
      id: "detailed-child",
      kind: "wbs",
      detailLevel: "detail",
      fields: {
        taskType: "작업",
        plannedEffort: "10",
        actualEffort: "5",
        progress: "50",
      },
      structure: { parentId: "pending-parent" },
      links: [],
    },
  ]);
  assert.equal(metrics.plannedEffort, 10);
  assert.equal(metrics.progress, 50);
  const program = data.artifacts.find(
    (a) => a.id === state.result.find((x) => x.kind === "program").id,
  );
  assert.ok(program.links.includes(fn.id));
  assert.ok(
    load(resolve("lib/traceability.ts"))
      .traceRows(data.artifacts)
      .some((r) => r.function?.id === fn.id && r.program?.id === program.id),
  );
  assert.ok(
    load(resolve("lib/workbook.ts"))
      .exportSheets(data)
      .some((s) => s.name === "기능명세서"),
  );
  await assert.rejects(
    () =>
      artifacts.mutateArtifact(
        request,
        user,
        "dash-p1",
        { ...fn, status: "승인", version: fn.version },
        "UPDATE",
        fn.id,
      ),
    (e) => e.status === 400,
  );
  const updated = await artifacts.mutateArtifact(
    request,
    user,
    "dash-p1",
    {
      ...fn,
      fields: { ...fn.fields, summary: "Updated summary" },
      title: "Renamed function",
      version: fn.version,
    },
    "UPDATE",
    fn.id,
  );
  assert.equal(updated.sources.length, 1);
  await assert.rejects(
    () =>
      artifacts.mutateArtifact(
        request,
        user,
        "dash-p1",
        { ...fn, version: fn.version },
        "UPDATE",
        fn.id,
      ),
    (e) => e.status === 409,
  );
  await assert.rejects(
    () =>
      artifacts.mutateArtifact(
        request,
        user,
        "dash-p1",
        { version: updated.version },
        "DELETE",
        fn.id,
      ),
    (e) => e.status === 409,
  );
  const sources = load(resolve("lib/source-references.ts"));
  const snap = await sources.readSourceSnapshot(
    db,
    user,
    "dash-p1",
    fn.sources[0].snapshotId,
  );
  assert.ok(snap.content.includes(draft.title));
  await assert.rejects(
    () =>
      sources.readSourceSnapshot(db, user, "dash-p2", fn.sources[0].snapshotId),
    (e) => e.status === 404,
  );
  generatedPlan = plan("-failure");
  generatedPlan.items[5].links = ["@missing"];
  const failed = await start();
  await service.continueDeliverables(
    request,
    user,
    "dash-p1",
    failed.requestId,
    {},
  );
  const count = (
    await db.execute("SELECT COUNT(*) AS n FROM project_artifacts")
  ).rows[0].n;
  const seq = (
    await db.execute(
      "SELECT * FROM project_sequences ORDER BY project_id,prefix",
    )
  ).rows;
  await assert.rejects(
    () =>
      service.continueDeliverables(
        request,
        user,
        "dash-p1",
        failed.requestId,
        {},
      ),
    (e) => e.status === 400,
  );
  assert.equal(
    (await db.execute("SELECT COUNT(*) AS n FROM project_artifacts")).rows[0].n,
    count,
  );
  assert.deepEqual(
    (
      await db.execute(
        "SELECT * FROM project_sequences ORDER BY project_id,prefix",
      )
    ).rows,
    seq,
  );
  // Fail after artifact rows and source/link writes have begun, not only during plan validation.
  generatedPlan = plan("-rollback-save");
  const partial = await start();
  const partialState = await service.continueDeliverables(
    request,
    user,
    "dash-p1",
    partial.requestId,
    {},
  );
  const partialChoices = Object.fromEntries(
    partialState.duplicates.map((d) => [d.clientRef, "new"]),
  );
  const businessTables = [
    "project_artifacts",
    "artifact_links",
    "artifact_source_references",
    "artifact_revisions",
    "audit_logs",
  ];
  async function businessSnapshot() {
    const counts = {};
    for (const table of businessTables)
      counts[table] = (
        await db.execute("SELECT COUNT(*) AS n FROM " + table)
      ).rows[0].n;
    return {
      counts,
      sequences: (
        await db.execute(
          "SELECT * FROM project_sequences ORDER BY project_id,prefix",
        )
      ).rows,
    };
  }
  const beforeSaveFailure = await businessSnapshot();
  await db.execute(
    "CREATE TRIGGER deliverable_test_save_failure BEFORE INSERT ON artifact_revisions BEGIN SELECT RAISE(ABORT,'synthetic save failure'); END",
  );
  try {
    await assert.rejects(() =>
      service.continueDeliverables(
        request,
        user,
        "dash-p1",
        partial.requestId,
        partialChoices,
      ),
    );
  } finally {
    await db.execute("DROP TRIGGER deliverable_test_save_failure");
  }
  assert.deepEqual(
    await businessSnapshot(),
    beforeSaveFailure,
    "all business writes and sequences roll back after partial save",
  );
  generatedPlan = plan();
  const duplicate = await start();
  state = await service.continueDeliverables(
    request,
    user,
    "dash-p1",
    duplicate.requestId,
    {},
  );
  assert.equal(state.status, "review_required");
  const choices = Object.fromEntries(
    state.duplicates.map((d) => [d.clientRef, d.candidates[0].id]),
  );
  state = await service.continueDeliverables(
    request,
    user,
    "dash-p1",
    duplicate.requestId,
    choices,
  );
  assert.equal(state.status, "completed");
  assert.ok(state.result.every((r) => r.reused));
  const stop = await start();
  assert.equal(
    (await service.stopDeliverables(user, "dash-p1", stop.requestId)).status,
    "cancelled",
  );

  const fileSize = Buffer.byteLength(fileText);
  await db.execute({
    sql: "INSERT INTO project_files(id,workspace_id,project_id,name,object_key,byte_length,mime_type,created_by) VALUES ('synthetic-file','dash-ws','dash-p1','source.txt','test-key',?,'text/plain','dash-owner')",
    args: [fileSize],
  });
  const originalRfpId = (
    await load(resolve("lib/rfp-server.ts")).readRfp(db, user, "dash-p1")
  ).document.id;
  // A registered business document must work without a structured RFP.
  await db.execute(
    "UPDATE project_rfp_documents SET deleted_at=CURRENT_TIMESTAMP WHERE project_id='dash-p1'",
  );
  await assert.rejects(
    () =>
      service.startDeliverables(request, user, "dash-p1", {
        ...first.input,
        requestId: randomUUID(),
        sources: [{ type: "rfp" }, { type: "file", id: "synthetic-file" }],
      }),
    (error) => error.status === 400,
  );
  const rfpService = load(resolve("lib/rfp-server.ts"));
  function rfpPlan(suffix) {
    const generated = plan(suffix);
    const draft = load(resolve("lib/rfp-template.ts")).createEmptyRfp("");
    draft.title = "Generated RFP from attachment";
    draft.basic.background = "Synthetic file source";
    draft.scope.included = "Synthetic scope";
    draft.requirements = [
      {
        id: "placeholder",
        number: "SFR-001",
        category: "SFR",
        title: generated.items.find((p) => p.kind === "requirement").title,
        definition: "Derived requirement",
        details: "",
        outputs: "",
        acceptance: "",
      },
    ];
    return { ...generated, rfpDocument: draft };
  }
  async function startRfpPlan() {
    const id = randomUUID();
    await service.startDeliverables(request, user, "dash-p1", {
      ...first.input,
      requestId: id,
      createRfp: true,
      sources: [{ type: "file", id: "synthetic-file" }],
    });
    await service.continueDeliverables(request, user, "dash-p1", id, {});
    return id;
  }
  generatedPlan = plan("-missing-rfp");
  const missingRfpJob = randomUUID();
  await service.startDeliverables(request, user, "dash-p1", {
    ...first.input,
    requestId: missingRfpJob,
    createRfp: true,
    sources: [{ type: "file", id: "synthetic-file" }],
  });
  await assert.rejects(
    () =>
      service.continueDeliverables(request, user, "dash-p1", missingRfpJob, {}),
    (e) => e.status === 502,
  );
  assert.equal((await rfpService.readRfp(db, user, "dash-p1")).document, null);
  generatedPlan = rfpPlan("-rfp-concurrent");
  const conflictingRfpJob = await startRfpPlan();
  const manualDraft = {
    ...generatedPlan.rfpDocument,
    projectId: "dash-p1",
    title: "Manual RFP wins",
  };
  const manualRfp = await rfpService.mutateRfp(
    request,
    user,
    "dash-p1",
    { draft: manualDraft },
    "CREATE",
  );
  const beforeConflict = await businessSnapshot();
  await assert.rejects(
    () =>
      service.continueDeliverables(
        request,
        user,
        "dash-p1",
        conflictingRfpJob,
        {},
      ),
    (e) => e.status === 409,
  );
  assert.deepEqual(await businessSnapshot(), beforeConflict);
  assert.equal(
    (await rfpService.readRfp(db, user, "dash-p1")).document.id,
    manualRfp.id,
  );
  await db.execute({
    sql: "UPDATE project_rfp_documents SET deleted_at=CURRENT_TIMESTAMP WHERE id=?",
    args: [manualRfp.id],
  });
  generatedPlan = rfpPlan("-rfp-rollback");
  const rolledRfpId = await startRfpPlan();
  const beforeRfpRollback = await businessSnapshot();
  const rfpCounts = async () => ({
    documents: (
      await db.execute("SELECT count(*) AS n FROM project_rfp_documents")
    ).rows[0].n,
    revisions: (
      await db.execute("SELECT count(*) AS n FROM project_rfp_revisions")
    ).rows[0].n,
    snapshots: (
      await db.execute("SELECT count(*) AS n FROM project_source_snapshots")
    ).rows[0].n,
  });
  const beforeRfpCounts = await rfpCounts();
  await db.execute(
    "CREATE TRIGGER rfp_test_save_failure BEFORE INSERT ON artifact_revisions BEGIN SELECT RAISE(ABORT,'synthetic RFP batch failure'); END",
  );
  try {
    await assert.rejects(() =>
      service.continueDeliverables(request, user, "dash-p1", rolledRfpId, {}),
    );
  } finally {
    await db.execute("DROP TRIGGER rfp_test_save_failure");
  }
  assert.equal((await rfpService.readRfp(db, user, "dash-p1")).document, null);
  assert.deepEqual(await businessSnapshot(), beforeRfpRollback);
  assert.deepEqual(
    await rfpCounts(),
    beforeRfpCounts,
    "RFP, its revision and generated RFP snapshot roll back with artifacts",
  );

  generatedPlan = rfpPlan("-rfp-success");
  const newRfpJob = await startRfpPlan();
  const savedRfpBatch = await service.continueDeliverables(
    request,
    user,
    "dash-p1",
    newRfpJob,
    {},
  );
  assert.equal(savedRfpBatch.status, "completed");
  assert.ok(savedRfpBatch.rfpResult?.id);
  const createdRfp = (await rfpService.readRfp(db, user, "dash-p1")).document;
  assert.equal(createdRfp.id, savedRfpBatch.rfpResult.id);
  assert.notEqual(createdRfp.draft.requirements[0].id, "placeholder");
  assert.equal(createdRfp.draft.basic.startDate, "");
  assert.ok(createdRfp.draft.appendix.references.includes("source.txt"));
  const newArtifacts = (
    await artifacts.projectData(db, user, "dash-p1")
  ).artifacts.filter((a) => savedRfpBatch.result.some((x) => x.id === a.id));
  assert.equal(newArtifacts.length, 6);
  for (const artifact of newArtifacts) {
    assert.ok(
      artifact.sources.some(
        (r) => r.snapshotId === savedRfpBatch.rfpResult.snapshotId,
      ),
    );
    assert.equal(artifact.sources.length, 2);
  }
  assert.equal(
    (
      await sources.readSourceSnapshot(
        db,
        user,
        "dash-p1",
        savedRfpBatch.rfpResult.snapshotId,
      )
    ).sourceId,
    createdRfp.id,
  );
  await assert.rejects(
    () =>
      service.startDeliverables(request, user, "dash-p1", {
        ...first.input,
        requestId: randomUUID(),
        createRfp: true,
        sources: [{ type: "file", id: "synthetic-file" }],
      }),
    (e) => e.status === 409,
  );
  assert.equal(
    (await rfpService.readRfp(db, user, "dash-p1")).document.version,
    createdRfp.version,
  );
  await db.execute({
    sql: "UPDATE project_rfp_documents SET deleted_at=CURRENT_TIMESTAMP WHERE id=?",
    args: [createdRfp.id],
  });
  generatedPlan = rfpPlan("-rfp-reuse");
  const reuseRfpJob = await startRfpPlan();
  const reuseRfpState = await service.deliverableStatus(
    user,
    "dash-p1",
    reuseRfpJob,
  );
  assert.equal(reuseRfpState.status, "review_required");
  const reuseRfpChoices = Object.fromEntries(
    reuseRfpState.duplicates.map((d) => [
      d.clientRef,
      d.candidates.find((c) => newArtifacts.some((a) => a.id === c.id)).id,
    ]),
  );
  const reuseRfpSaved = await service.continueDeliverables(
    request,
    user,
    "dash-p1",
    reuseRfpJob,
    reuseRfpChoices,
  );
  assert.equal(reuseRfpSaved.status, "completed");
  assert.ok(reuseRfpSaved.result.every((r) => r.reused));
  const reusedRfpArtifacts = (
    await artifacts.projectData(db, user, "dash-p1")
  ).artifacts.filter((a) => newArtifacts.some((x) => x.id === a.id));
  for (const reused of reusedRfpArtifacts) {
    const before = newArtifacts.find((a) => a.id === reused.id);
    assert.deepEqual(reused.fields, before.fields);
    assert.equal(reused.version, before.version + 1);
    assert.ok(
      reused.sources.some(
        (r) => r.snapshotId === reuseRfpSaved.rfpResult.snapshotId,
      ),
    );
    assert.ok(
      reused.sources.some(
        (r) => r.snapshotId === savedRfpBatch.rfpResult.snapshotId,
      ),
    );
  }
  await db.execute({
    sql: "UPDATE project_rfp_documents SET deleted_at=CURRENT_TIMESTAMP WHERE id=?",
    args: [reuseRfpSaved.rfpResult.id],
  });
  generatedPlan = plan("-file");
  const fileId = randomUUID();
  await service.startDeliverables(request, user, "dash-p1", {
    ...first.input,
    requestId: fileId,
    sources: [{ type: "file", id: "synthetic-file" }],
  });
  const filePlanState = await service.continueDeliverables(
    request,
    user,
    "dash-p1",
    fileId,
    {},
  );
  const fileResult = await service.continueDeliverables(
    request,
    user,
    "dash-p1",
    fileId,
    Object.fromEntries(
      filePlanState.duplicates.map((d) => [d.clientRef, "new"]),
    ),
  );
  assert.equal(fileResult.status, "completed");
  await db.execute({
    sql: "UPDATE project_rfp_documents SET deleted_at=NULL WHERE id=?",
    args: [originalRfpId],
  });
  const fileArtifact = (
    await artifacts.projectData(db, user, "dash-p1")
  ).artifacts.find((a) => a.id === fileResult.result[0].id);
  const fileSnapshot = await sources.readSourceSnapshot(
    db,
    user,
    "dash-p1",
    fileArtifact.sources[0].snapshotId,
  );
  assert.equal(fileSnapshot.content, fileText);
  assert.equal(fileSnapshot.changed, false);
  fileText = "Modified file source";
  assert.equal(
    (
      await sources.readSourceSnapshot(
        db,
        user,
        "dash-p1",
        fileArtifact.sources[0].snapshotId,
      )
    ).changed,
    true,
  );
  await db.execute("DELETE FROM project_files WHERE id='synthetic-file'");
  assert.equal(
    (
      await sources.readSourceSnapshot(
        db,
        user,
        "dash-p1",
        fileArtifact.sources[0].snapshotId,
      )
    ).available,
    false,
  );
  assert.equal(
    (
      await sources.readSourceSnapshot(
        db,
        user,
        "dash-p1",
        fileArtifact.sources[0].snapshotId,
      )
    ).content,
    "Synthetic file source",
  );
  await assert.rejects(
    () =>
      service.startDeliverables(request, user, "dash-p1", {
        ...first.input,
        requestId: randomUUID(),
        sources: [null],
      }),
    (e) => e.status === 400,
  );

  // Queue commands never execute AI; workers finish independently of browser requests.
  const worker = load(resolve("lib/ai/deliverable-worker.ts"));
  const batch = load(resolve("lib/ai/deliverable-batch-commit.ts"));
  const bare = plan("-bare").items.map((p) => ({
    ...p,
    clientRef: p.clientRef.slice(1),
    links: p.links.map((id) => id.slice(1)),
  }));
  bare[0].links.push("existing-real-document-id");
  const normalized = batch.validateDeliverablePlan(bare, kinds, 100);
  assert.equal(normalized[0].clientRef, "@item0");
  assert.ok(normalized[0].links.includes("@item5"));
  assert.ok(normalized[0].links.includes("existing-real-document-id"));
  assert.deepEqual(
    bare[0].clientRef,
    "item0",
    "normalization does not mutate the AI response",
  );
  assert.throws(
    () =>
      batch.validateDeliverablePlan(
        [bare[0], { ...bare[0], clientRef: "@item0" }],
        kinds,
        100,
      ),
    (e) => e.details?.field === "임시 ID(clientRef)",
  );
  assert.throws(
    () =>
      batch.validateDeliverablePlan(
        [{ ...bare[0], purpose: "   " }],
        kinds,
        100,
      ),
    (e) => e.details?.field === "purpose",
  );
  const requirement = bare.find((p) => p.kind === "requirement");
  assert.throws(
    () =>
      batch.validateDeliverablePlan(
        [{ ...requirement, category: "UNKNOWN" }],
        kinds,
        100,
      ),
    (e) => e.details?.field === "초안 필수값",
  );
  const derived = {
    ...bare[0],
    origin: "설계 도출",
    excerpt: "AI paraphrase is not an original quotation",
  };
  const evidenceResult = batch.resolveDeliverableEvidence(
    [derived],
    [{ content: "Original source" }],
  );
  assert.equal(evidenceResult.items[0].excerpt, "");
  assert.equal(evidenceResult.items[0].origin, "설계 도출");
  assert.equal(evidenceResult.warnings.length, 1);
  assert.equal(derived.excerpt, "AI paraphrase is not an original quotation");
  assert.throws(
    () =>
      batch.resolveDeliverableEvidence(
        [{ ...derived, origin: "원문 명시" }],
        [{ content: "Original source" }],
      ),
    (e) => e.status === 400,
  );
  assert.throws(
    () =>
      batch.resolveDeliverableEvidence(
        [{ ...derived, sourceIndex: 1 }],
        [{ content: "Original source" }],
      ),
    (e) => e.status === 400,
  );
  assert.equal(
    batch.resolveDeliverableEvidence(
      [{ ...derived, excerpt: "Original" }],
      [{ content: "Original source" }],
    ).warnings.length,
    0,
  );
  generatedPlan = plan("-worker");
  generatedPlan.items.find((p) => p.kind === "program").excerpt =
    "AI-derived paraphrase";
  generatedPlan.items = generatedPlan.items.map((p) => ({
    ...p,
    clientRef: p.clientRef.slice(1),
    links: p.links.map((id) => id.slice(1)),
  }));
  const background = await start();
  const beforeQueue = providerCalls;
  assert.equal(
    (await service.queueDeliverables(user, "dash-p1", background.requestId, {}))
      .status,
    "running",
  );
  assert.equal(providerCalls, beforeQueue);
  const pick1 = await worker.processNextDeliverable();
  const pick2 = await worker.processNextDeliverable();
  renewDuringCall = true;
  await Promise.all([pick1.run(), pick2.run()]);
  renewDuringCall = false;
  assert.equal(
    providerCalls,
    beforeQueue + 1,
    "only one worker acquires the lease",
  );
  assert.equal(lastAiOptions.deadline, null);
  assert.equal(
    (await service.deliverableStatus(user, "dash-p1", background.requestId))
      .evidenceWarnings.length,
    1,
  );
  assert.equal(renewedLease, true);
  let bg = await service.deliverableStatus(
    user,
    "dash-p1",
    background.requestId,
  );
  assert.ok(["review_required", "validating"].includes(bg.status));
  if (bg.status === "review_required")
    await service.queueDeliverables(
      user,
      "dash-p1",
      bg.requestId,
      Object.fromEntries(bg.duplicates.map((d) => [d.clientRef, "new"])),
    );
  // Execute the queued save in a real standalone process with native TS loading.
  // No API key is provided: this stage contains the already-generated plan only.
  const child = spawn(process.execPath, ["scripts/deliverable-worker.mjs"], {
    env: {
      ...process.env,
      TURSO_DATABASE_URL: fixture.url,
      TURSO_AUTH_TOKEN: "",
      OPENAI_API_KEY: "",
    },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let workerLogs = "";
  child.stdout.on("data", (chunk) => {
    workerLogs += chunk;
  });
  child.stderr.on("data", (chunk) => {
    workerLogs += chunk;
  });
  try {
    for (let attempt = 0; attempt < 200; attempt++) {
      const current = await service.deliverableStatus(
        user,
        "dash-p1",
        bg.requestId,
      );
      if (["completed", "failed"].includes(current.status)) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(
      (await service.deliverableStatus(user, "dash-p1", bg.requestId)).status,
      "completed",
      workerLogs,
    );
  } finally {
    const exited = new Promise((resolve) => child.once("exit", resolve));
    child.kill();
    await exited;
  }

  generatedPlan = plan("-restart");
  const recovered = await start();
  let payload = JSON.parse(
    String(
      (
        await db.execute({
          sql: "SELECT payload_json FROM project_deliverable_generation_requests WHERE request_id=?",
          args: [recovered.requestId],
        })
      ).rows[0].payload_json,
    ),
  );
  payload.aiResponseId = "resp-before-worker-restart";
  payload.aiAttempted = true;
  await db.execute({
    sql: "UPDATE project_deliverable_generation_requests SET payload_json=?,lease_token='expired-worker',lease_until='2020-01-01' WHERE request_id=?",
    args: [JSON.stringify(payload), recovered.requestId],
  });
  await (await worker.processNextDeliverable()).run();
  assert.equal(lastAiOptions.resumeResponseId, "resp-before-worker-restart");
  bg = await service.deliverableStatus(user, "dash-p1", recovered.requestId);
  if (bg.status === "review_required")
    await service.queueDeliverables(
      user,
      "dash-p1",
      bg.requestId,
      Object.fromEntries(bg.duplicates.map((d) => [d.clientRef, "new"])),
    );
  await (await worker.processNextDeliverable()).run();
  assert.equal(
    (await service.deliverableStatus(user, "dash-p1", bg.requestId)).status,
    "completed",
  );

  const stopped = await start();
  payload = JSON.parse(
    String(
      (
        await db.execute({
          sql: "SELECT payload_json FROM project_deliverable_generation_requests WHERE request_id=?",
          args: [stopped.requestId],
        })
      ).rows[0].payload_json,
    ),
  );
  payload.aiResponseId = "resp-stop-after-restart";
  await db.execute({
    sql: "UPDATE project_deliverable_generation_requests SET payload_json=? WHERE request_id=?",
    args: [JSON.stringify(payload), stopped.requestId],
  });
  assert.equal(
    (await service.stopDeliverables(user, "dash-p1", stopped.requestId)).status,
    "stop_requested",
  );
  await (await worker.processNextDeliverable()).run();
  assert.ok(cancelCalls > 0);
  assert.equal(
    (await service.deliverableStatus(user, "dash-p1", stopped.requestId))
      .status,
    "cancelled",
  );

  const ambiguous = await start();
  payload = JSON.parse(
    String(
      (
        await db.execute({
          sql: "SELECT payload_json FROM project_deliverable_generation_requests WHERE request_id=?",
          args: [ambiguous.requestId],
        })
      ).rows[0].payload_json,
    ),
  );
  payload.aiAttempted = true;
  await db.execute({
    sql: "UPDATE project_deliverable_generation_requests SET payload_json=? WHERE request_id=?",
    args: [JSON.stringify(payload), ambiguous.requestId],
  });
  const beforeAmbiguous = providerCalls;
  await (await worker.processNextDeliverable()).run();
  assert.equal(
    providerCalls,
    beforeAmbiguous,
    "do not repeat a paid creation with uncertain acceptance",
  );
  assert.equal(
    (await service.deliverableStatus(user, "dash-p1", ambiguous.requestId))
      .status,
    "failed",
  );
  assert.equal(
    (await service.latestDeliverable(user, "dash-p1")).requestId,
    ambiguous.requestId,
  );
  token = "dash-viewer-session";
  const viewer = await load(resolve("lib/auth.ts")).requireUser();
  await assert.rejects(
    () =>
      service.startDeliverables(request, viewer, "dash-p1", {
        ...first.input,
        requestId: randomUUID(),
      }),
    (e) => e.status === 403,
  );
  await assert.rejects(
    () => service.deliverableStatus(viewer, "dash-p1", first.requestId),
    (e) => e.status === 404,
  );
  assert.deepEqual((await db.execute("PRAGMA foreign_key_check")).rows, []);
  console.log(
    "PASS: populated migration, FK/revision/board/conversation preservation, six-kind atomic creation, idempotency, rollback and sequence preservation, RFP/file snapshots and original mutation/deletion, function CRUD/version checks, duplicate reuse, cancellation, permissions, traceability and workbook.",
  );
} finally {
  db.close();
}
