import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

export async function checkProjectTemplates({
  client,
  handle,
  setToken,
  setStorageFailure,
  setOnPut,
  binary,
  load,
  resolve,
}) {
  await client.executeMultiple(`INSERT INTO projects(id,workspace_id,name,created_by,owner_id) VALUES ('tpl-project','ws','Templates','owner','owner'),('tpl-other','ws','Other project','owner','owner');
    INSERT INTO project_members(project_id,workspace_id,user_id,role) VALUES ('tpl-project','ws','owner','admin'),('tpl-project','ws','member','admin'),('tpl-project','ws','reader','viewer'),('tpl-other','ws','owner','admin');
    INSERT INTO project_artifacts(id,workspace_id,project_id,kind,code,title,status,fields_json,structure_json,version,created_by,updated_by,created_at,updated_at) VALUES ('tpl-source','ws','tpl-project','screen','TPL-1','Source','초안','{}','{}',1,'owner','owner','now','now'),('tpl-target','ws','tpl-project','screen','TPL-2','Target','초안','{}','{}',1,'owner','owner','now','now'),('tpl-elsewhere','ws','tpl-other','screen','TPL-3','Other','초안','{}','{}',1,'owner','owner','now','now');`);
  const request = async (segments, method = "GET", body, raw = false) =>
    handle(
      new Request("http://localhost:3000/api/planning/" + segments.join("/"), {
        method,
        headers: {
          origin: "http://localhost:3000",
          "Content-Type": raw ? "image/png" : "application/json",
        },
        ...(body === undefined
          ? {}
          : { body: raw ? body : JSON.stringify(body) }),
      }),
      segments,
    );
  const project = (method = "GET", body, id) =>
    request(
      ["projects", "tpl-project", "templates", ...(id ? [id] : [])],
      method,
      body,
    );
  const scoped = (screen, resource, method = "GET", body, raw = false) =>
    request(
      ["projects", "tpl-project", "screens", screen, ...resource.split("/")],
      method,
      body,
      raw,
    );
  const ok = async (response) => {
    assert.equal(response.status, 200, await response.clone().text());
    return response.json();
  };
  setToken("owner-token");
  assert.equal(
    (await ok(await scoped("tpl-source", "access"))).canCreateTemplate,
    true,
  );
  const asset = await ok(
    await scoped("tpl-source", "assets", "POST", binary, true),
  );
  const document = {
    schemaVersion: 1,
    title: "Snapshot",
    activePageId: "page",
    layers: [
      {
        id: "page",
        name: "Page",
        kind: "page",
        children: [
          {
            id: "group",
            name: "Group",
            kind: "layer",
            children: [
              { id: "picture", name: "Picture", kind: "image" },
              { id: "note", name: "Note", kind: "text" },
            ],
          },
        ],
      },
    ],
    sizes: {
      page: { width: 860, height: 560 },
      group: { width: 300, height: 200 },
      picture: { width: 80, height: 60 },
      note: { width: 100, height: 80 },
    },
    positions: {
      group: { x: 20, y: 20 },
      picture: { x: 0, y: 0 },
      note: { x: 100, y: 0 },
    },
    layerText: { note: "First\n\nThird 😀" },
    layerImages: { picture: asset.url },
    layerStyles: {
      note: {
        verticalAlign: "bottom",
        textAlign: "right",
        backgroundColor: "#123456",
      },
    },
  };
  const input = {
    name: "  Shared snapshot  ",
    sourceScreenId: "tpl-source",
    requestId: randomUUID(),
    document,
  };
  const originalVersion = (await ok(await scoped("tpl-source", "board")))
    .version;
  const created = await ok(await project("POST", input));
  const id = created.template.id;
  assert.equal(created.template.name, "Shared snapshot");
  assert.equal(
    (await ok(await scoped("tpl-source", "board"))).version,
    originalVersion,
    "creation does not save source board",
  );
  assert.equal(
    (await ok(await project("POST", input))).template.id,
    id,
    "same creation request is idempotent",
  );
  assert.equal(
    (await project("POST", { ...input, name: "Changed" })).status,
    409,
  );
  assert.equal(
    (
      await project("POST", {
        ...input,
        name: "shared SNAPSHOT",
        requestId: randomUUID(),
      })
    ).status,
    409,
  );
  const detail = await ok(await project("GET", undefined, id));
  assert.match(detail.template.layerImages.picture, /^template-asset:/);
  assert.equal(detail.template.layerText.note, document.layerText.note);
  assert.equal(JSON.stringify(detail).includes("object_key"), false);
  assert.equal(
    (await request(["templates", id])).status,
    404,
    "global static route never exposes custom templates",
  );
  assert.equal(
    (await request(["projects", "tpl-other", "templates", id])).status,
    404,
  );
  assert.equal(
    (
      await request(
        [
          "projects",
          "tpl-other",
          "screens",
          "tpl-elsewhere",
          "templates",
          id,
          "apply",
        ],
        "POST",
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await ok(await request(["projects", "tpl-other", "templates"]))
    ).templates.some((item) => item.id === id),
    false,
  );
  setToken("reader-token");
  assert.equal(
    (await ok(await project())).templates.some((item) => item.id === id),
    true,
    "project members can list snapshots",
  );
  assert.equal(
    (
      await project("POST", {
        ...input,
        name: "Forbidden",
        requestId: randomUUID(),
      })
    ).status,
    403,
  );
  assert.equal(
    (await scoped("tpl-target", `templates/${id}/apply`, "POST")).status,
    403,
  );
  setToken("member-token");
  await client.execute(
    "UPDATE users SET account_role='master' WHERE id='member'",
  );
  assert.equal(
    (await ok(await scoped("tpl-source", "access"))).canCreateTemplate,
    false,
    "account master is not project owner",
  );
  assert.equal(
    (
      await project("POST", {
        ...input,
        name: "Platform master",
        requestId: randomUUID(),
      })
    ).status,
    403,
  );
  setToken("outsider-token");
  assert.equal((await project()).status, 404);
  setToken("");
  assert.equal((await project()).status, 401);
  setToken("owner-token");
  // A source deletion and pending expiry must not affect the independent template objects.
  await client.execute(
    "UPDATE project_artifacts SET deleted_at=CURRENT_TIMESTAMP WHERE id='tpl-source'",
  );
  await client.execute(
    "UPDATE planning_board_assets SET expires_at='2000-01-01' WHERE screen_artifact_id='tpl-source'",
  );
  const applied = await ok(
    await scoped("tpl-target", `templates/${id}/apply`, "POST"),
  );
  assert.ok(
    applied.document.layerImages.picture.includes("/screens/tpl-target/"),
  );
  assert.notEqual(applied.document.layerImages.picture, asset.url);
  assert.equal(
    (
      await request(
        applied.document.layerImages.picture
          .replace("/api/planning/", "")
          .split("/"),
      )
    ).status,
    200,
  );
  const before = await ok(await scoped("tpl-target", "board"));
  assert.equal(before.board, null, "prepare/apply does not write board");
  await ok(
    await scoped("tpl-target", "board", "PUT", {
      document: applied.document,
      expectedVersion: before.version,
      expectedScreenVersion: before.screenVersion,
    }),
  );
  const saved = await ok(await scoped("tpl-target", "board"));
  assert.deepEqual(saved.board.layerText, document.layerText);
  await client.execute(
    "UPDATE planning_boards SET status='review' WHERE screen_artifact_id='tpl-target'",
  );
  assert.equal(
    (await scoped("tpl-target", `templates/${id}/apply`, "POST")).status,
    409,
  );
  await client.execute(
    "UPDATE planning_boards SET status='draft' WHERE screen_artifact_id='tpl-target'",
  );
  await client.execute(
    "UPDATE project_artifacts SET deleted_at=NULL WHERE id='tpl-source'",
  );
  await client.execute(
    "UPDATE planning_board_assets SET expires_at='2999-01-01' WHERE screen_artifact_id='tpl-source'",
  );
  setStorageFailure(true);
  const failureInput = {
    ...input,
    name: "Storage failure",
    requestId: randomUUID(),
  };
  assert.equal((await project("POST", failureInput)).status, 503);
  assert.equal(
    (await ok(await project())).templates.some(
      (item) => item.name === "Storage failure",
    ),
    false,
  );
  setStorageFailure(false);
  await ok(await project("POST", failureInput));
  // Project ownership is immutable. Make the source screen unavailable during
  // storage copying and verify access is checked again before publication.
  setOnPut(async () => {
    setOnPut(undefined);
    await client.execute(
      "UPDATE project_artifacts SET deleted_at='2026-11-11T00:00:00.000Z' WHERE id='tpl-source'",
    );
  });
  assert.equal(
    (
      await project("POST", {
        ...input,
        name: "Revoked during copy",
        requestId: randomUUID(),
      })
    ).status,
    404,
  );
  await client.execute(
    "UPDATE project_artifacts SET deleted_at=NULL WHERE id='tpl-source'",
  );
  setOnPut(undefined);
  assert.equal(
    (await ok(await project())).templates.some(
      (item) => item.name === "Revoked during copy",
    ),
    false,
  );
  const { deleteSelection } = load(
    resolve("app/(editor)/planning-board/lib/editor-delete.ts"),
  );
  const { validateDocument } = load(
    resolve("app/(editor)/planning-board/lib/server/document-validation.ts"),
  );
  const deleted = deleteSelection(document, ["group", "note"]);
  assert.deepEqual([...deleted.removed].sort(), ["group", "note", "picture"]);
  assert.deepEqual(deleted.document.layerImages, {});
  validateDocument({ ...document, ...deleted.document });
  const locked = structuredClone(document);
  locked.layers[0].children[0].children[0].locked = true;
  assert.throws(() => deleteSelection(locked, ["group"]), /잠긴/);
  assert.throws(() => deleteSelection(document, ["page"]), /페이지/);
  const hidden = structuredClone(document);
  hidden.layers[0].children[0].visible = false;
  assert.ok(deleteSelection(hidden, ["group"]));
  assert.equal(deleteSelection(document, ["unknown"]), null);
  console.log(
    "PASS project templates: owner-only creation, project/workspace isolation, retry/name collisions, independent image snapshot/apply/save, review/role/storage failure and recursive atomic deletion",
  );
}
