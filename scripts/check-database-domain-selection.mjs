import assert from "node:assert/strict";
import { resolve } from "node:path";

export async function checkDatabaseDomainSelection({
  load,
  client,
  user,
  req,
  ctx,
  body,
}) {
  const domains = load(
    resolve("app/api/projects/[projectId]/database/domains/route.ts"),
  );
  const detail = load(
    resolve(
      "app/api/projects/[projectId]/database/domains/[domainId]/route.ts",
    ),
  );
  const artifacts = load(
    resolve("app/api/projects/[projectId]/artifacts/route.ts"),
  );
  const artifact = load(
    resolve("app/api/projects/[projectId]/artifacts/[artifactId]/route.ts"),
  );
  const { domainDataType } = load(resolve("lib/database-domain-validation.ts"));
  for (const [db, type, length] of [
    ["turso", "TEXT", ""],
    ["postgresql", "UUID", ""],
    ["mysql", "BIT", "64"],
    ["oracle", "NUMBER", "18,2"],
    ["mysql", "TIMESTAMP", "0"],
  ])
    assert.equal(domainDataType(type, length, db).length, length);
  for (const args of [
    ["VARCHAR2", "16", "mysql"],
    ["BIGINT", "4", "mysql"],
    ["NUMBER", "2,3", "oracle"],
    ["VARCHAR", "", "mysql"],
    ["BIT", "65", "mysql"],
    ["TIMESTAMP", "7", "postgresql"],
    ["TEXT", "", "unknown"],
  ])
    assert.throws(() => domainDataType(...args));
  await body(
    await domains.POST(
      req("POST", {
        logicalName: "DB누락",
        physicalName: "missing_db",
        dataType: "TEXT",
      }),
      ctx("second"),
    ),
    400,
  );
  await body(
    await domains.POST(
      req("POST", {
        logicalName: "DB오류",
        physicalName: "bad_db",
        dataType: "VARCHAR2",
        length: "16",
        databaseType: "mysql",
      }),
      ctx("second"),
    ),
    400,
  );

  // The new column is nullable, and a pre-existing legacy row is not guessed.
  await client.execute({
    sql: "INSERT INTO project_database_domains(id,project_id,workspace_id,logical_name,logical_key,physical_name,data_type,length,description,created_by,updated_by,created_at,updated_at) VALUES ('legacy-type','second','ws','레거시','레거시','legacy_type','VARCHAR2','16','','owner','owner',?,?)",
    args: [new Date().toISOString(), new Date().toISOString()],
  });
  const legacy = (
    await body(
      await detail.GET(req("GET"), ctx("second", { domainId: "legacy-type" })),
    )
  ).item;
  assert.equal(legacy.databaseType, null);
  await body(
    await detail.PATCH(
      req("PATCH", { version: legacy.version, description: "legacy edit" }),
      ctx("second", { domainId: legacy.id }),
    ),
  );

  const metas = [];
  for (let i = 0; i < 23; i++) {
    const suffix = String(i).padStart(2, "0");
    metas.push(
      (
        await body(
          await domains.POST(
            req("POST", {
              databaseType: "oracle",
              logicalName: `검색_${suffix}`,
              physicalName: `page_case_${suffix}`,
              dataType: "VARCHAR2",
              length: "16",
            }),
            ctx("second"),
          ),
          201,
        )
      ).item,
    );
  }
  const listing = async (query) =>
    body(
      await domains.GET(
        req("GET", undefined, `?${new URLSearchParams(query)}`),
        ctx("second"),
      ),
    );
  for (const [page, count] of [
    [1, 10],
    [2, 10],
    [3, 3],
    [99, 3],
  ]) {
    const result = await listing({ q: "PAGE_CASE", page, pageSize: 10 });
    assert.equal(result.total, 23);
    assert.equal(result.items.length, count);
    assert.equal(result.page, Math.min(page, 3));
  }
  assert.equal((await listing({ q: "page%", pageSize: 10 })).total, 0);
  assert.equal((await listing({ q: "page_case_00", pageSize: 10 })).total, 1);
  const pages = await Promise.all(
    [1, 2, 3].map((page) => listing({ q: "검색", page, pageSize: 10 })),
  );
  assert.equal(
    new Set(pages.flatMap((page) => page.items.map((item) => item.id))).size,
    23,
  );
  assert.equal(
    (await listing({ q: "없는검색어", page: 99, pageSize: 10 })).page,
    1,
  );
  assert.equal((await listing({ q: "!", pageSize: 10 })).total, 0);

  const selected = metas[0];
  const column = {
    id: "stable-column",
    logicalName: "preview",
    name: "preview",
    dataType: "TEXT",
    length: "",
    nullable: true,
    primaryKey: false,
    unique: false,
    defaultValue: "keep",
    description: "keep description",
    domainSelection: { domainId: selected.id, domainVersion: selected.version },
  };
  const input = {
    kind: "database",
    title: "Manual selection",
    status: "초안",
    fields: {
      definition: "Synthetic",
      physicalName: "manual_selection",
      logicalName: "수동",
    },
    links: [],
    structure: { columns: [column] },
  };
  let saved = (
    await body(await artifacts.POST(req("POST", input), ctx("second")), 201)
  ).artifact;
  const edit = async (value, status = 200) =>
    body(
      await artifact.PATCH(
        req("PATCH", value),
        ctx("second", { artifactId: saved.id }),
      ),
      status,
    );
  const first = saved.structure.columns[0];
  assert.equal(first.name, selected.physicalName);
  assert.equal(first.logicalName, selected.logicalName);
  assert.equal(first.dataType, "VARCHAR2");
  assert.equal(first.length, "16");
  assert.equal(first.id, column.id);
  assert.equal(first.description, column.description);
  assert.equal(first.defaultValue, column.defaultValue);
  assert.equal(first.domainReference.domainId, selected.id);
  assert.equal(first.domainReference.databaseType, "oracle");
  assert.equal(first.domainSelection, undefined);
  const forged = structuredClone(saved);
  forged.structure.columns[0].domainReference.domainId = "forged";
  await edit(forged, 400);
  const changed = structuredClone(saved);
  changed.structure.columns[0].name = "unlinked_edit";
  await edit(changed, 400);
  const preserve = structuredClone(saved);
  delete preserve.structure.columns[0].domainReference;
  preserve.structure.columns[0].description = "new explanation";
  saved = (await edit(preserve)).artifact;
  assert.equal(
    saved.structure.columns[0].domainReference.domainId,
    selected.id,
  );
  // An unrelated metadata revision does not conflict with an explicit selection.
  await body(
    await detail.PATCH(
      req("PATCH", { version: metas[1].version, description: "unrelated" }),
      ctx("second", { domainId: metas[1].id }),
    ),
  );
  const reselect = structuredClone(saved);
  reselect.structure.columns[0].domainSelection = {
    domainId: selected.id,
    domainVersion: selected.version,
  };
  saved = (await edit(reselect)).artifact;
  await body(
    await detail.PATCH(
      req("PATCH", { version: selected.version, description: "changed" }),
      ctx("second", { domainId: selected.id }),
    ),
  );
  const stale = structuredClone(saved);
  stale.structure.columns[0].domainSelection = {
    domainId: selected.id,
    domainVersion: selected.version,
  };
  await edit(stale, 409);
  const retained = structuredClone(saved);
  retained.structure.columns[0].description = "keep snapshot";
  saved = (await edit(retained)).artifact;
  assert.equal(
    saved.structure.columns[0].domainReference.domainVersion,
    selected.version,
  );
  const beforeFailure = saved.version;
  const duplicate = structuredClone(saved);
  duplicate.structure.columns.push({ ...column, id: "duplicate" });
  duplicate.structure.columns[0].domainSelection = {
    domainId: metas[2].id,
    domainVersion: metas[2].version,
  };
  duplicate.structure.columns[1].domainSelection = {
    domainId: metas[2].id,
    domainVersion: metas[2].version,
  };
  await edit(duplicate, 400);
  assert.equal(
    Number(
      (
        await client.execute({
          sql: "SELECT version FROM project_artifacts WHERE id=?",
          args: [saved.id],
        })
      ).rows[0].version,
    ),
    beforeFailure,
  );
  const cross = structuredClone(saved);
  cross.structure.columns[0].domainSelection = {
    domainId: "legacy-type",
    domainVersion: 2,
  };
  await edit(cross, 400);
  await body(
    await detail.DELETE(
      req("DELETE", { version: metas[3].version }),
      ctx("second", { domainId: metas[3].id }),
    ),
  );
  cross.structure.columns[0].domainSelection = {
    domainId: metas[3].id,
    domainVersion: metas[3].version,
  };
  await edit(cross, 409);
  const foreign = await client.execute(
    "SELECT id,version FROM project_database_domains WHERE project_id='project' AND deleted_at IS NULL LIMIT 1",
  );
  cross.structure.columns[0].domainSelection = {
    domainId: foreign.rows[0].id,
    domainVersion: Number(foreign.rows[0].version),
  };
  await edit(cross, 404);
  const detach = structuredClone(saved);
  detach.structure.columns[0].domainSelection = null;
  detach.structure.columns[0].name = "manual_after_detach";
  saved = (await edit(detach)).artifact;
  assert.equal(saved.structure.columns[0].domainReference, undefined);
  assert.equal(saved.structure.columns[0].name, "manual_after_detach");
  const legacySelect = structuredClone(saved);
  legacySelect.structure.columns[0].domainSelection = {
    domainId: "legacy-type",
    domainVersion: 2,
  };
  await edit(legacySelect, 400);
  const makeParent = structuredClone(saved);
  makeParent.structure.columns[0].primaryKey = true;
  makeParent.structure.columns[0].nullable = false;
  saved = (await edit(makeParent)).artifact;
  await body(
    await artifacts.POST(
      req("POST", {
        ...input,
        title: "FK child",
        fields: { ...input.fields, physicalName: "manual_fk_child" },
        structure: {
          columns: [
            {
              ...saved.structure.columns[0],
              id: "child-column",
              primaryKey: false,
              nullable: true,
              reference: { tableId: saved.id, columnId: column.id },
            },
          ],
        },
      }),
      ctx("second"),
    ),
    201,
  );
  const textDomain = (
    await body(
      await domains.POST(
        req("POST", {
          databaseType: "turso",
          logicalName: "텍스트",
          physicalName: "text_column",
          dataType: "TEXT",
        }),
        ctx("second"),
      ),
      201,
    )
  ).item;
  const mismatch = structuredClone(saved);
  mismatch.structure.columns[0].domainSelection = {
    domainId: textDomain.id,
    domainVersion: textDomain.version,
  };
  await edit(mismatch, 400);
  assert.equal(
    Number(
      (
        await client.execute({
          sql: "SELECT version FROM project_artifacts WHERE id=?",
          args: [saved.id],
        })
      ).rows[0].version,
    ),
    saved.version,
  );
  // The immutable AI generation snapshot remains separate from manual references.
  const { resolveDomainSelections } = load(
    resolve("lib/database-domain-selection.ts"),
  );
  await assert.rejects(() =>
    resolveDomainSelections(
      client,
      { ...user, workspaceId: "other" },
      "second",
      input,
    ),
  );
  console.log(
    "Domain types/selection: DB validation, SQL literal LIKE, 10-row pagination, legacy NULL, server snapshots, explicit detach, conflicts, isolation and atomic rollback passed.",
  );
}
