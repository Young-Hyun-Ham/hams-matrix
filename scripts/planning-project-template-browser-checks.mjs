import assert from "node:assert/strict";

export async function checkProjectTemplateUI({
  evaluate,
  call,
  input,
  waitFor,
  clickText,
  db,
  screenshot,
}) {
  const before = Number(
    (
      await db.execute(
        "SELECT version FROM planning_boards WHERE screen_artifact_id='screen'",
      )
    ).rows[0].version,
  );
  await evaluate(
    "window.confirm=()=>true;document.querySelector('.page-more-button').click()",
  );
  await waitFor(
    () =>
      evaluate(
        "[...document.querySelectorAll('.page-menu button')].some(b=>b.textContent==='템플릿 생성')",
      ),
    "owner create template action",
  );
  await clickText(".page-menu button", "템플릿 생성");
  await waitFor(
    () =>
      evaluate(
        "!!document.querySelector('dialog.template-create-dialog[open]')",
      ),
    "create template dialog",
  );
  await input('[aria-label="템플릿 이름"]', "Project reusable layout");
  await screenshot("planning-template-create");
  await clickText("dialog.template-create-dialog button[type=submit]", "생성");
  await waitFor(
    () =>
      evaluate(
        "!document.querySelector('dialog.template-create-dialog') && [...document.querySelectorAll('[aria-label=\"템플릿 불러오기\"] option')].some(o=>o.textContent==='Project reusable layout')",
      ),
    "created template in project list",
  );
  const id = String(
    (
      await db.execute(
        "SELECT id FROM planning_project_templates WHERE name='Project reusable layout' AND status='ready'",
      )
    ).rows[0].id,
  );
  assert.equal(
    Number(
      (
        await db.execute(
          "SELECT version FROM planning_boards WHERE screen_artifact_id='screen'",
        )
      ).rows[0].version,
    ),
    before,
    "template creation never saves source",
  );
  const source = await evaluate(
    "document.querySelector('.artboard').outerHTML",
  );
  await evaluate(
    "const o=document.createElement('option');o.value='custom:missing';o.textContent='Missing';document.querySelector('[aria-label=\"템플릿 불러오기\"]').append(o);true",
  );
  await input('[aria-label="템플릿 불러오기"]', "custom:missing", true);
  await waitFor(
    () => evaluate("!!document.querySelector('.error-snackbar')"),
    "missing template is local error",
  );
  assert.equal(
    await evaluate("Boolean(document.querySelector('.planning-access-error'))"),
    false,
  );
  assert.equal(
    await evaluate("document.querySelector('.artboard').outerHTML"),
    source,
  );
  await evaluate(
    "window.history.pushState({},'', '/planning-board?projectId=p&screenId=template-target')",
  );
  await waitFor(
    () =>
      evaluate(
        `document.querySelector('.page-label span')?.textContent==='template-target' && !!document.querySelector('[value="custom:${id}"]') && !document.querySelector('[aria-label="템플릿 불러오기"]').disabled`,
      ),
    "template shared across project screens",
  );
  await input('[aria-label="템플릿 불러오기"]', `custom:${id}`, true);
  await waitFor(
    () =>
      evaluate(
        "document.querySelectorAll('.custom-canvas-layer').length>10 && !document.querySelector('[aria-label=\"템플릿 불러오기\"]').disabled",
      ),
    "custom snapshot applied",
  );
  assert.equal(
    await evaluate(
      "[...document.querySelectorAll('.custom-canvas-layer')].some(n=>n.style.backgroundImage.includes('/screens/template-target/assets/'))",
    ),
    true,
    "private image is cloned to target screen",
  );
  assert.equal(
    Number(
      (
        await db.execute(
          "SELECT count(*) n FROM planning_boards WHERE screen_artifact_id='template-target'",
        )
      ).rows[0].n,
    ),
    0,
    "applying snapshot is still unsaved",
  );
  await evaluate(
    "document.querySelector('[aria-label=\"실행 취소\"]').click()",
  );
  assert.equal(
    await evaluate("document.querySelectorAll('.custom-canvas-layer').length"),
    0,
    "one Undo restores original document",
  );
  await evaluate(
    "document.querySelector('[aria-label=\"다시 실행\"]').click()",
  );
  assert.ok(
    await evaluate(
      "document.querySelectorAll('.custom-canvas-layer').length>10",
    ),
  );
  await screenshot("planning-project-template-applied");
  await evaluate(
    "window.history.pushState({},'', '/planning-board?projectId=q&screenId=other-screen')",
  );
  await waitFor(
    () =>
      evaluate(
        "document.querySelector('.page-label span')?.textContent==='other-screen' && !document.querySelector('[aria-label=\"템플릿 불러오기\"]').disabled",
      ),
    "other project opened",
  );
  assert.equal(
    await evaluate(
      "[...document.querySelectorAll('[aria-label=\"템플릿 불러오기\"] option')].some(o=>o.textContent==='Project reusable layout')",
    ),
    false,
    "other project never lists source custom snapshot",
  );
  assert.equal(
    await evaluate(
      `(async()=> (await fetch('/api/planning/projects/q/templates/${id}')).status)()`,
    ),
    404,
  );
  await evaluate(
    "window.history.pushState({},'', '/planning-board?projectId=p&screenId=screen')",
  );
  await waitFor(
    () =>
      evaluate(
        "document.querySelectorAll('.custom-canvas-layer').length>10 && !document.querySelector('[aria-label=\"템플릿 불러오기\"]').disabled",
      ),
    "return to saved source",
  );
  await call("Input.dispatchMouseEvent", { type: "mouseMoved", x: 0, y: 0 });
  console.log(
    "PASS project template UI: owner creation dialog, immediate scoped list, missing-template recovery, other-screen image apply/undo and cross-project isolation",
  );
}
