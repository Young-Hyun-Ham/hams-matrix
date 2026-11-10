import { checkDatabaseDomainSelection } from "./check-database-domain-selection.mjs";
import assert from "node:assert/strict";
import { resolve } from "node:path";

export async function checkDatabaseDomains({ load, client, setToken }) {
  const api = load(
    resolve("app/api/projects/[projectId]/database/domains/route.ts"),
  );
  const detail = load(
    resolve(
      "app/api/projects/[projectId]/database/domains/[domainId]/route.ts",
    ),
  );
  const artifactApi = load(
    resolve("app/api/projects/[projectId]/artifacts/[artifactId]/route.ts"),
  );
  const { db } = load(resolve("lib/db.ts"));
  const { createPageAgent } = load(resolve("lib/ai/page-tools.ts"));
  const { aiPages } = load(resolve("lib/ai/page-prompts.ts"));
  const { readAiPage } = load(resolve("lib/ai/page-data.ts"));
  const { resolveDatabaseColumns } = load(
    resolve("lib/database-domain-resolver.ts"),
  );
  const { domainDataType } = load(resolve("lib/database-domain-validation.ts"));
  const { readDomainCatalog, domainContext } = load(
    resolve("lib/database-domains.ts"),
  );
  const user = {
    id: "owner",
    name: "Owner",
    workspaceId: "ws",
    role: "owner",
    accountRole: "user",
    onboardingComplete: true,
  };
  const context = { projectId: "project", tab: "database" };
  const req = (method, value, query = "") =>
    new Request(`http://localhost:3000/test${query}`, {
      method,
      headers: {
        origin: "http://localhost:3000",
        "Content-Type": "application/json",
      },
      ...(value === undefined ? {} : { body: JSON.stringify(value) }),
    });
  const ctx = (projectId = "project", extra = {}) => ({
    params: Promise.resolve({ projectId, ...extra }),
  });
  const body = async (r, code = 200) => {
    assert.equal(r.status, code, await r.clone().text());
    return r.json();
  };
  const count = async () =>
    Number(
      (await client.execute("SELECT COUNT(*) AS n FROM project_artifacts"))
        .rows[0].n,
    );
  const makeAgent = (prompt = "테이블을 등록해줘", revision) =>
    createPageAgent(
      req("POST", {}),
      user,
      context,
      aiPages.database,
      true,
      prompt,
      undefined,
      undefined,
      revision,
    );
  const column = (logicalName = "작업_아이디", patch = {}) => ({
    id: "key",
    logicalName,
    name: "model_guess",
    dataType: "INTEGER",
    length: "",
    description: "Free explanation",
    nullable: false,
    primaryKey: true,
    unique: false,
    defaultValue: "",
    ...patch,
  });
  const table = (physicalName, columns = [column()]) => ({
    title: physicalName,
    fields: {
      definition: "Synthetic database design",
      physicalName,
      logicalName: physicalName,
    },
    structure: { columns },
  });
  async function commit(agent) {
    const tx = await db().transaction("write");
    try {
      const result = await agent.commit(tx);
      await tx.commit();
      return result;
    } catch (e) {
      await tx.rollback();
      throw e;
    } finally {
      tx.close();
    }
  }
  async function saved(id) {
    const row = (
      await client.execute({
        sql: "SELECT * FROM project_artifacts WHERE id=?",
        args: [id],
      })
    ).rows[0];
    return {
      id,
      version: Number(row.version),
      kind: row.kind,
      title: row.title,
      status: row.status,
      fields: JSON.parse(row.fields_json),
      links: [],
      structure: JSON.parse(row.structure_json),
    };
  }

  assert.deepEqual(domainDataType("varchar2(16)"), {
    dataType: "VARCHAR2",
    length: "16",
  });
  assert.deepEqual(domainDataType("number(18, 2)"), {
    dataType: "NUMBER",
    length: "18,2",
  });
  for (const args of [
    ["VARCHAR2(16)", "20"],
    ["NUMBER", "2,3"],
    ["DATE", "16"],
    ["VARCHAR2(16 CHAR)", ""],
    ["TEXT); DROP TABLE users;--", ""],
  ])
    assert.throws(() => domainDataType(...args));
  assert.equal(
    (await body(await api.GET(req("GET"), ctx()))).catalogRevision,
    1,
  );
  const created = await body(
    await api.POST(
      req("POST", {
        databaseType: "oracle",
        logicalName: "작업",
        physicalName: "job",
        dataType: "varchar2(16)",
      }),
      ctx(),
    ),
    201,
  );
  const meta = created.item;
  assert.equal(created.catalogRevision, 2);
  assert.equal(meta.length, "16");
  assert.equal(meta.dataType, "VARCHAR2");
  await body(
    await api.POST(
      req("POST", {
        databaseType: "oracle",
        logicalName: " 작업 ",
        physicalName: "another",
        dataType: "DATE",
      }),
      ctx(),
    ),
    409,
  );
  await body(
    await api.POST(
      req("POST", {
        databaseType: "oracle",
        logicalName: "invalid",
        physicalName: "bad-name",
        dataType: "DATE",
      }),
      ctx(),
    ),
    400,
  );
  await body(await api.GET(req("GET", undefined, "?pageSize=101"), ctx()), 400);
  assert.equal(
    (await body(await api.GET(req("GET", undefined, "?q=job"), ctx()))).total,
    1,
  );
  assert.equal((await body(await api.GET(req("GET"), ctx("second")))).total, 0);
  await body(
    await detail.GET(req("GET"), ctx("second", { domainId: meta.id })),
    404,
  );
  setToken("reader-token");
  await body(await api.GET(req("GET"), ctx()));
  await body(
    await api.POST(
      req("POST", {
        databaseType: "oracle",
        logicalName: "reader",
        physicalName: "reader",
        dataType: "DATE",
      }),
      ctx(),
    ),
    403,
  );
  await body(
    await detail.PATCH(
      req("PATCH", { version: meta.version, description: "forbidden" }),
      ctx("project", { domainId: meta.id }),
    ),
    403,
  );
  await body(
    await detail.DELETE(
      req("DELETE", { version: meta.version }),
      ctx("project", { domainId: meta.id }),
    ),
    403,
  );
  setToken("outsider-token");
  await body(await api.GET(req("GET"), ctx()), 404);
  setToken("");
  await body(await api.GET(req("GET"), ctx()), 401);
  setToken("owner-token");
  await body(
    await api.POST(
      new Request("http://localhost:3000/test", {
        method: "POST",
        headers: { origin: "https://invalid.example" },
        body: "{}",
      }),
      ctx(),
    ),
    403,
  );
  let catalog = await readDomainCatalog(user, "project");
  const first = resolveDatabaseColumns([column()], catalog);
  assert.equal(first.columns[0].name, "job_id");
  assert.equal(first.columns[0].length, "16");
  assert.equal(first.matched, 1);
  assert.equal(
    resolveDatabaseColumns([column("작업 아이디")], catalog).columns[0].name,
    "job_id",
  );
  assert.equal(
    resolveDatabaseColumns([column("일괄작업_아이디")], catalog).unmatched,
    1,
  );
  assert.throws(
    () => resolveDatabaseColumns([column("작업_담당자")], catalog),
    /일부 용어/,
  );
  assert.throws(
    () =>
      resolveDatabaseColumns(
        [column(), column("작업 아이디", { id: "other" })],
        catalog,
      ),
    /중복/,
  );
  assert.throws(
    () => resolveDatabaseColumns([column("", {})], catalog),
    /논리명/,
  );
  assert.throws(
    () =>
      resolveDatabaseColumns([column("작업", { domainBinding: {} })], catalog),
    /서버/,
  );
  const exact = {
    ...meta,
    id: "exact",
    logicalName: "작업_아이디",
    logicalKey: "작업_아이디",
    physicalName: "task_key",
    dataType: "CHAR",
    length: "20",
  };
  assert.equal(
    resolveDatabaseColumns([column()], { ...catalog, items: [meta, exact] })
      .columns[0].name,
    "task_key",
  );
  assert.throws(
    () =>
      resolveDatabaseColumns([column("작업_상태")], {
        ...catalog,
        items: [meta, { ...exact, logicalKey: "상태", physicalName: "status" }],
      }),
    /충돌/,
  );
  const huge = domainContext({
    ...catalog,
    items: Array.from({ length: 200 }, (_, i) => ({
      ...meta,
      id: String(i),
      description: "x".repeat(1000),
    })),
  });
  assert.equal(huge.truncated, true);
  assert.equal(huge.total, 200);
  const page = await readAiPage(user, context, aiPages.database);
  assert.equal(page.domainMeta.catalogRevision, 2);
  assert.equal(page.domainMeta.total, 1);
  assert.equal(page.total, 0);
  const agent = makeAgent(undefined, page.domainMeta.catalogRevision),
    before = await count();
  const preview = await agent.execute("save_artifact", {
    action: "CREATE",
    ...table("job_table"),
  });
  assert.equal(preview.success, true, JSON.stringify(preview));
  assert.equal(preview.pending, true);
  assert.equal(preview.domainResult.columns[0].name, "job_id");
  assert.equal(await count(), before);
  const [action] = await commit(agent),
    persisted = await saved(action.id);
  assert.equal(persisted.structure.columns[0].name, "job_id");
  assert.equal(persisted.structure.columns[0].dataType, "VARCHAR2");
  assert.equal(persisted.structure.columns[0].length, "16");
  assert.equal(persisted.structure.columns[0].domainBinding.domainId, meta.id);
  // A normal edit preserves trusted provenance, even if the client omits it.
  const edit = structuredClone(persisted);
  edit.title = "Changed table description";
  delete edit.structure.columns[0].domainBinding;
  delete edit.structure.columns[0].logicalName;
  await body(
    await artifactApi.PATCH(
      req("PATCH", edit),
      ctx("project", { artifactId: action.id }),
    ),
  );
  const edited = await saved(action.id);
  assert.equal(edited.structure.columns[0].logicalName, "작업_아이디");
  assert.equal(edited.structure.columns[0].domainBinding.domainId, meta.id);
  const spoof = structuredClone(edited);
  spoof.structure.columns[0].domainBinding.domainId = "forged";
  await body(
    await artifactApi.PATCH(
      req("PATCH", spoof),
      ctx("project", { artifactId: action.id }),
    ),
    400,
  );
  const spoofNew = makeAgent();
  assert.equal(
    (
      await spoofNew.execute("save_artifact", {
        action: "CREATE",
        ...table("forged", [
          column("작업", { domainBinding: { domainId: meta.id } }),
        ]),
      })
    ).success,
    false,
  );
  const changed = await body(
    await detail.PATCH(
      req("PATCH", { version: 1, length: "20" }),
      ctx("project", { domainId: meta.id }),
    ),
  );
  await body(
    await detail.PATCH(
      req("PATCH", { version: 1, length: "24" }),
      ctx("project", { domainId: meta.id }),
    ),
    409,
  );
  assert.equal((await saved(action.id)).structure.columns[0].length, "16");
  const stale = makeAgent(undefined, 2);
  assert.equal(
    (
      await stale.execute("save_artifact", {
        action: "CREATE",
        ...table("stale_initial"),
      })
    ).status,
    409,
  );
  const pending = makeAgent();
  assert.equal(
    (
      await pending.execute("save_artifact", {
        action: "CREATE",
        ...table("stale_commit"),
      })
    ).success,
    true,
  );
  await body(
    await api.POST(
      req("POST", {
        databaseType: "oracle",
        logicalName: "추가",
        physicalName: "added",
        dataType: "DATE",
      }),
      ctx(),
    ),
    201,
  );
  const beforeConflict = await count();
  await assert.rejects(
    () => commit(pending),
    (e) => e.status === 409,
  );
  assert.equal(await count(), beforeConflict);
  const batchAgent = makeAgent();
  const parent = { clientRef: "parent", ...table("domain_parent") };
  const child = {
    clientRef: "child",
    ...table("domain_child", [
      column("작업_아이디", {
        primaryKey: false,
        nullable: true,
        reference: { tableId: "@parent", columnId: "key" },
      }),
    ]),
  };
  const batch = await batchAgent.execute("save_database_tables", {
    items: [parent, child],
  });
  assert.equal(batch.success, true, JSON.stringify(batch));
  assert.equal(batch.domainResults[0].columns[0].name, "job_id");
  const batchActions = await commit(batchAgent),
    parentAction = batchActions.find((a) => a.title === "domain_parent"),
    childAction = batchActions.find((a) => a.title === "domain_child");
  const childSaved = await saved(childAction.id);
  assert.equal(
    childSaved.structure.columns[0].reference.tableId,
    parentAction.id,
  );
  for (const a of [parentAction, childAction])
    await body(
      await artifactApi.DELETE(
        req("DELETE", { version: 1 }),
        ctx("project", { artifactId: a.id }),
      ),
      409,
    );
  const illegal = await saved(parentAction.id);
  illegal.structure.columns[0].length = "19";
  await body(
    await artifactApi.PATCH(
      req("PATCH", illegal),
      ctx("project", { artifactId: parentAction.id }),
    ),
    400,
  );
  const selfAgent = makeAgent();
  const self = {
    clientRef: "self",
    ...table("domain_self", [
      column("작업_아이디", {
        reference: { tableId: "@self", columnId: "key" },
      }),
    ]),
  };
  assert.equal(
    (await selfAgent.execute("save_database_tables", { items: [self] }))
      .success,
    true,
  );
  const [selfAction] = await commit(selfAgent);
  assert.equal(
    Number(
      (
        await client.execute({
          sql: "SELECT COUNT(*) n FROM artifact_links WHERE source_id=?",
          args: [selfAction.id],
        })
      ).rows[0].n,
    ),
    0,
  );
  await body(
    await artifactApi.DELETE(
      req("DELETE", { version: 1 }),
      ctx("project", { artifactId: selfAction.id }),
    ),
    409,
  );
  const clear = await saved(selfAction.id);
  delete clear.structure.columns[0].reference;
  await body(
    await artifactApi.PATCH(
      req("PATCH", clear),
      ctx("project", { artifactId: selfAction.id }),
    ),
  );
  await body(
    await artifactApi.DELETE(
      req("DELETE", { version: 2 }),
      ctx("project", { artifactId: selfAction.id }),
    ),
  );
  const invalidBatch = makeAgent();
  const size = await count();
  assert.equal(
    (
      await invalidBatch.execute("save_database_tables", {
        items: [
          { clientRef: "good", ...table("rollback_good") },
          {
            clientRef: "bad",
            ...table("rollback_bad", [column("작업_담당자")]),
          },
        ],
      })
    ).success,
    false,
  );
  await commit(invalidBatch);
  assert.equal(await count(), size);
  const noIntent = makeAgent("테이블 초안을 설명해줘");
  assert.equal(
    (
      await noIntent.execute("save_artifact", {
        action: "CREATE",
        ...table("no_intent"),
      })
    ).success,
    false,
  );
  assert.equal(
    (
      await body(
        await detail.DELETE(
          req("DELETE", { version: changed.item.version }),
          ctx("project", { domainId: meta.id }),
        ),
      )
    ).catalogRevision,
    5,
  );
  await body(
    await detail.GET(req("GET"), ctx("project", { domainId: meta.id })),
    404,
  );
  assert.equal(
    (await saved(action.id)).structure.columns[0].domainBinding.domainVersion,
    1,
  );
  await body(
    await api.POST(
      req("POST", {
        databaseType: "oracle",
        logicalName: "작업",
        physicalName: "new_job",
        dataType: "VARCHAR2(24)",
      }),
      ctx(),
    ),
    201,
  );
  const logs = Number(
    (
      await client.execute(
        "SELECT COUNT(*) n FROM audit_logs WHERE resource_type='database_domain'",
      )
    ).rows[0].n,
  );
  assert.ok(logs >= 5);
  const snapshot = JSON.parse(
    (
      await client.execute(
        "SELECT after_json FROM audit_logs WHERE resource_type='database_domain' AND action='CREATE' LIMIT 1",
      )
    ).rows[0].after_json,
  );
  assert.equal(snapshot.fields.physicalName, "job");
  await client.execute(
    "UPDATE admin_setting SET value_json='false' WHERE setting_key='DB_LOGGING_ENABLED'",
  );
  await body(
    await api.POST(
      req("POST", {
        databaseType: "oracle",
        logicalName: "로그없음",
        physicalName: "no_log",
        dataType: "DATE",
      }),
      ctx(),
    ),
    201,
  );
  assert.equal(
    Number(
      (
        await client.execute(
          "SELECT COUNT(*) n FROM audit_logs WHERE resource_type='database_domain'",
        )
      ).rows[0].n,
    ),
    logs,
  );
  await checkDatabaseDomainSelection({ load, client, user, req, ctx, body });
  console.log(
    "Database domains: CRUD, normalization, scope/permissions, AI single/batch previews and commits, catalog conflicts, trusted provenance, FK/self-FK deletion and audit checks passed.",
  );
}
