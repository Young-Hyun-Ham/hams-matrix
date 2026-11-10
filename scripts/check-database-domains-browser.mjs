import assert from "node:assert/strict";
export async function checkDatabaseDomainsBrowser({
  evaluate,
  click,
  resize,
  pause,
  waitFor,
  screenshot,
  db,
  call,
  origin,
}) {
  await call("Network.setCookie", {
    name: "hams_session",
    value: "nav-admin-session",
    url: origin,
    httpOnly: true,
  });
  async function navigate(path) {
    await call("Page.navigate", { url: origin + path });
    await waitFor(
      () => evaluate("!!document.querySelector('.database-tools')"),
      "database page",
    );
    await pause(400);
  }
  async function input(selector, value) {
    await evaluate(
      `(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(e.tagName==='SELECT'?HTMLSelectElement.prototype:e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))})()`,
    );
  }
  async function submit(selector) {
    await evaluate(
      `document.querySelector(${JSON.stringify(selector)}).requestSubmit()`,
    );
  }
  async function checkHeader() {
    await waitFor(
      () =>
        evaluate(
          "!!document.querySelector('.database-tool-header .theme-toggle:not(:disabled)')",
        ),
      "theme ready",
    );
    assert.equal(
      await evaluate(
        "document.querySelector('.database-tool-header').textContent.includes('DB설계로 돌아가기')",
      ),
      false,
    );
    assert.deepEqual(
      await evaluate(
        "(()=>{const button=document.querySelector('[aria-label=\"관리 화면 닫기\"]'),theme=document.querySelector('.database-tool-header .theme-toggle');return {font:getComputedStyle(button).fontSize,height:button.getBoundingClientRect().height,title:getComputedStyle(document.querySelector('h1')).fontSize,themeHeight:theme.getBoundingClientRect().height,themePadding:getComputedStyle(theme).padding}})()",
      ),
      {
        font: "12px",
        height: 26,
        title: "12px",
        themeHeight: 26,
        themePadding: "4px",
      },
    );
    await evaluate(
      "window.databaseOriginalClose=window.close;window.databaseCloseCalls=0;window.close=()=>{window.databaseCloseCalls++}",
    );
    await click('[aria-label="관리 화면 닫기"]');
    assert.equal(await evaluate("window.databaseCloseCalls"), 1);
    await evaluate("window.close=window.databaseOriginalClose");
  }
  await resize(1440);
  await navigate("/projects/nav-project/database/domains");
  await checkHeader();
  await click(".database-tool-header .theme-toggle");
  await waitFor(
    () =>
      evaluate(
        "document.documentElement.dataset.theme==='dark'&&!document.querySelector('.theme-toggle').disabled",
      ),
    "dark theme saved",
  );
  assert.equal(
    (
      await db.execute(
        "SELECT default_theme FROM user_preferences WHERE user_id='nav-admin'",
      )
    ).rows[0].default_theme,
    "dark",
  );
  await click(".database-tool-header .theme-toggle");
  await waitFor(
    () =>
      evaluate(
        "document.documentElement.dataset.theme==='light'&&!document.querySelector('.theme-toggle').disabled",
      ),
    "light theme saved",
  );
  await waitFor(
    () =>
      evaluate(
        "[...document.querySelectorAll('button')].some(b=>b.textContent==='도메인 메타 등록')",
      ),
    "domain create permission",
  );
  await evaluate(
    "[...document.querySelectorAll('button')].find(b=>b.textContent==='도메인 메타 등록').click()",
  );
  await waitFor(
    () => evaluate("!!document.querySelector('.database-domain-dialog[open]')"),
    "domain modal",
  );
  assert.equal(
    await evaluate(
      "document.querySelector('dialog[open] [name=dataType]').disabled",
    ),
    true,
  );
  for (const [database, type] of [
    ["turso", "TEXT"],
    ["postgresql", "UUID"],
    ["mysql", "BIGINT"],
    ["oracle", "VARCHAR2"],
  ]) {
    await input("dialog[open] [name=databaseType]", database);
    assert.ok(
      await evaluate(
        `Array.from(document.querySelector('dialog[open] [name=dataType]').options).some(o=>o.value===${JSON.stringify(type)})`,
      ),
    );
  }
  await input("dialog[open] [name=dataType]", "VARCHAR2");
  await input("dialog[open] [name=length]", "16");
  await input("dialog[open] [name=databaseType]", "mysql");
  assert.equal(
    await evaluate(
      "document.querySelector('dialog[open] [name=dataType]').value",
    ),
    "",
  );
  assert.equal(
    await evaluate(
      "document.querySelector('dialog[open] [name=length]').value",
    ),
    "",
  );
  for (const [name, value] of Object.entries({
    logicalName: "작업",
    physicalName: "job",
    databaseType: "oracle",
    dataType: "VARCHAR2",
    length: "16",
  }))
    await input(`dialog[open] [name=${name}]`, value);
  await submit(".database-domain-dialog form");
  await waitFor(
    () =>
      evaluate(
        "!document.querySelector('dialog[open]')&&document.querySelector('tbody')?.textContent.includes('VARCHAR2')",
      ),
    "domain saved",
  );
  const meta = (
    await db.execute(
      "SELECT data_type,length AS domain_length FROM project_database_domains WHERE logical_key='작업'",
    )
  ).rows[0];
  assert.equal(meta.domain_length, "16");
  await click("tbody button");
  await waitFor(
    () => evaluate("!!document.querySelector('dialog[open]')"),
    "edit domain",
  );
  await input("dialog[open] [name=description]", "browser description");
  assert.equal(
    await evaluate(
      "document.querySelector('dialog[open] [name=databaseType]').value",
    ),
    "oracle",
  );
  assert.equal(
    await evaluate(
      "document.querySelector('dialog[open] [name=dataType]').value",
    ),
    "VARCHAR2",
  );
  await submit(".database-domain-dialog form");
  await waitFor(
    () => evaluate("!document.querySelector('dialog[open]')"),
    "domain updated",
  );
  // Create table definitions through the real API, using this synthetic session.
  const col = {
    id: "id",
    name: "job_id",
    logicalName: "작업_아이디",
    dataType: "VARCHAR2",
    length: "16",
    nullable: false,
    primaryKey: true,
    unique: false,
    description: "",
    defaultValue: "",
  };
  async function create(name, columns) {
    return evaluate(
      `(async()=>{const r=await fetch('/api/projects/nav-project/artifacts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(${JSON.stringify({ kind: "database", title: name, status: "초안", fields: { definition: "Browser test", physicalName: name, logicalName: name }, links: [], structure: { columns } })})});const d=await r.json();if(!r.ok)throw new Error(d.error);return d.artifact})()`,
    );
  }
  const parent = await create("job", [col]);
  const child = await create("job_child", [
    {
      ...col,
      primaryKey: false,
      reference: { tableId: parent.id, columnId: "id" },
    },
  ]);
  await create("free_table", [col]);
  // Real API fixture: 23 domains match the current physical column name.
  await evaluate(
    `(async()=>{for(let i=0;i<23;i++){const r=await fetch('/api/projects/nav-project/database/domains',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({logicalName:'검색'+i,physicalName:'job_id_case'+String(i).padStart(2,'0'),databaseType:'oracle',dataType:'VARCHAR2',length:'16'})});if(!r.ok)throw new Error('Pagination fixture failed')}})()`,
  );
  await navigate("/projects/nav-project/database/erd");
  await checkHeader();
  await waitFor(
    () =>
      evaluate("!!document.querySelector('button[aria-label=\"job 수정\"]')"),
    "ERD actions",
  );
  // Resize the actual canvas and check both cards and FK endpoints reflow.
  for (const [viewport, perRow] of [
    [1920, 3],
    [1440, 3],
    [1100, 2],
    [650, 1],
    [390, 1],
  ]) {
    await resize(viewport);
    await waitFor(
      () =>
        evaluate(
          `(()=>{const groups=[...document.querySelectorAll('.table-scroll svg > g')];if(groups.length!==3)return false;const positions=groups.map(g=>g.transform.baseVal.consolidate().matrix);return positions.filter(p=>p.f===positions[0].f).length===${perRow}})()`,
        ),
      `ERD ${perRow} cards per row at ${viewport}`,
    );
    assert.equal(
      await evaluate(
        "(()=>{const svg=document.querySelector('.table-scroll svg'),g=[...svg.querySelectorAll(':scope > g')].map(e=>e.transform.baseVal.consolidate().matrix),path=svg.querySelector('path[marker-end]'),n=path.getAttribute('d').match(/-?\\d+(?:\\.\\d+)?/g).map(Number);return n.every(Number.isFinite)&&n[0]===g[1].e+(g[1].e>g[0].e?0:330)&&n[1]===g[1].f+65&&n[6]===g[0].e+330&&n[7]===g[0].f+65})()",
      ),
      true,
    );
    if (viewport === 1440) await screenshot("database-erd-three-columns");
  }
  await resize(1440);
  const previewButton = ".database-erd-section-header > button";
  const previewClose =
    ".database-erd-preview[open] .database-erd-preview-header button";
  await click(previewButton);
  await waitFor(
    () =>
      evaluate(
        "!!document.querySelector('.database-erd-preview[open] img')?.naturalWidth&&!document.querySelector('.database-erd-preview [aria-busy=true]')",
      ),
    "first ERD preview image generated",
  );
  const firstPreview = (
    await db.execute(
      "SELECT id,source_hash FROM database_erd_images WHERE project_id='nav-project'",
    )
  ).rows[0];
  assert.ok(firstPreview.id);
  await screenshot("database-erd-ai-preview");
  await click(previewClose);
  await click(previewButton);
  await waitFor(
    () =>
      evaluate(
        "!!document.querySelector('.database-erd-preview[open] img')?.naturalWidth",
      ),
    "saved ERD preview reused",
  );
  assert.equal(
    (
      await db.execute(
        "SELECT id FROM database_erd_images WHERE project_id='nav-project'",
      )
    ).rows[0].id,
    firstPreview.id,
  );
  await evaluate(
    "window.erdAnchorClick=HTMLAnchorElement.prototype.click;window.erdDownloaded='';HTMLAnchorElement.prototype.click=function(){if(this.href.startsWith('blob:'))window.erdDownloaded=this.download;else window.erdAnchorClick.call(this)};[...document.querySelectorAll('.database-erd-preview[open] button')].find(b=>b.textContent==='이미지 다운로드').click()",
  );
  await waitFor(
    () =>
      evaluate(
        "window.erdDownloaded==='ERD-nav-project.png'&&!document.querySelector('.database-erd-preview [aria-busy=true]')",
      ),
    "ERD PNG download",
  );
  await evaluate("HTMLAnchorElement.prototype.click=window.erdAnchorClick");
  await click(previewClose);
  await db.execute(
    "UPDATE projects SET name='Updated ERD project' WHERE id='nav-project'",
  );
  await click(previewButton);
  await waitFor(
    () =>
      evaluate(
        "document.querySelector('.database-erd-preview[open]').textContent.includes('테이블이 변경되었습니다')",
      ),
    "stale ERD remains cached",
  );
  assert.equal(
    (
      await db.execute(
        "SELECT id FROM database_erd_images WHERE project_id='nav-project'",
      )
    ).rows[0].id,
    firstPreview.id,
  );
  await evaluate(
    "[...document.querySelectorAll('.database-erd-preview[open] button')].find(b=>b.textContent==='다시 생성').click()",
  );
  await waitFor(
    () =>
      evaluate(
        "!!document.querySelector('.database-erd-preview[open] img')?.naturalWidth&&!document.querySelector('.database-erd-preview [aria-busy=true]')",
      ),
    "ERD regeneration completed",
  );
  assert.equal(
    await evaluate(
      "document.querySelector('.database-erd-preview[open] [role=alert]')?.textContent??''",
    ),
    "",
  );
  assert.notEqual(
    (
      await db.execute(
        "SELECT id FROM database_erd_images WHERE project_id='nav-project'",
      )
    ).rows[0].id,
    firstPreview.id,
  );
  await click(previewClose);
  assert.equal(
    await evaluate(
      "document.querySelector('button[aria-label=\"job 삭제\"]').disabled",
    ),
    true,
  );
  assert.equal(
    await evaluate(
      "document.querySelector('button[aria-label=\"job_child 삭제\"]').disabled",
    ),
    true,
  );
  assert.ok(
    await evaluate(
      "document.querySelector('.database-tools').textContent.includes('FK 연결을 먼저 해제')",
    ),
  );
  await click('button[aria-label="job 수정"]');
  await waitFor(
    () =>
      evaluate(
        "!!document.querySelector('dialog[open] form input[name=title]')",
      ),
    "table edit modal",
  );
  assert.equal(
    await evaluate(
      "document.querySelector('dialog[open] [name=physicalName]').value",
    ),
    "job",
  );
  await evaluate(
    "window.domainFetchOriginal=window.fetch;window.domainQueries=[];window.domainWrites=0;window.fetch=(u,o)=>{if(String(u).includes('/database/domains?'))window.domainQueries.push(String(u));if(String(u).includes('/artifacts')&&o?.method==='PATCH')window.domainWrites++;return window.domainFetchOriginal(u,o)}",
  );
  await click("dialog[open] .database-domain-trigger");
  await waitFor(
    () =>
      evaluate(
        "document.querySelectorAll('dialog[open] [role=option]').length===10",
      ),
    "domain first 10",
  );
  assert.ok(
    await evaluate(
      "window.domainQueries.at(-1).includes('q=job_id')&&window.domainQueries.at(-1).includes('pageSize=10')",
    ),
  );
  for (const count of [10, 3]) {
    await evaluate(
      "[...document.querySelectorAll('dialog[open] [aria-label=\"도메인 검색 페이지\"] button')].find(b=>b.textContent==='다음').click()",
    );
    await waitFor(
      () =>
        evaluate(
          `document.querySelectorAll('dialog[open] [role=option]').length===${count}&&!document.querySelector('[aria-busy=true]')`,
        ),
      "domain next page",
    );
  }
  assert.ok(
    await evaluate(
      "document.querySelector('[aria-label=\"도메인 검색 페이지\"]').textContent.includes('3 / 3')",
    ),
  );
  await input('dialog[open] [aria-label="도메인 검색어"]', "작업");
  const enterSearch = () =>
    evaluate(
      "document.querySelector('dialog[open] [role=combobox]').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}))",
    );
  await enterSearch();
  await waitFor(
    () =>
      evaluate(
        "document.querySelectorAll('dialog[open] [role=option]').length===1",
      ),
    "Enter applies query",
  );
  const requests = await evaluate("window.domainQueries.length");
  await enterSearch();
  await waitFor(
    () =>
      evaluate(
        `window.domainQueries.length===${requests + 1}&&document.querySelectorAll('dialog[open] [role=option]').length===1`,
      ),
    "same query refreshes",
  );
  await evaluate(
    "document.querySelector('dialog[open] [role=combobox]').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true,cancelable:true}))",
  );
  await pause(100);
  assert.equal(await evaluate("window.domainQueries.length"), requests + 1);
  assert.equal(await evaluate("window.domainWrites"), 0);
  await evaluate(
    "document.querySelector('dialog[open] [role=combobox]').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}))",
  );
  assert.equal(
    await evaluate(
      "!!document.querySelector('dialog[open]')&&!document.querySelector('dialog[open] [role=combobox]')",
    ),
    true,
  );
  await evaluate(
    "window.domainOriginalConfirm=window.confirm;window.domainConfirmCalls=0;window.confirm=()=>{window.domainConfirmCalls++;return false}",
  );
  await click("dialog[open] .admin-detail-close");
  assert.equal(await evaluate("window.domainConfirmCalls"), 0);
  assert.equal(
    await evaluate("!!document.querySelector('dialog[open]')"),
    false,
  );
  await evaluate("window.confirm=window.domainOriginalConfirm");
  await click('button[aria-label="job 수정"]');
  await waitFor(
    () =>
      evaluate(
        "!!document.querySelector('dialog[open] .database-domain-trigger')",
      ),
    "reopened editor",
  );
  await click("dialog[open] .database-domain-trigger");
  await input('dialog[open] [aria-label="도메인 검색어"]', "작업");
  await enterSearch();
  await waitFor(
    () =>
      evaluate(
        "document.querySelectorAll('dialog[open] [role=option]').length===1",
      ),
    "selection query",
  );
  await click("dialog[open] [role=option]");
  assert.equal(
    await evaluate(
      "JSON.parse(document.querySelector('dialog[open] [name=columns]').value)[0].name",
    ),
    "job",
  );
  assert.equal(
    await evaluate(
      "document.querySelector('dialog[open] .matrix-column input[required]').readOnly",
    ),
    true,
  );
  await input("dialog[open] input[name=title]", "Edited from ERD");
  await evaluate(
    "window.databaseOriginalConfirm=window.confirm;window.confirm=()=>false",
  );
  await click("dialog[open] .admin-detail-close");
  assert.equal(
    await evaluate(
      "document.querySelector('dialog[open] input[name=title]').value",
    ),
    "Edited from ERD",
  );
  await evaluate("window.confirm=window.databaseOriginalConfirm");
  await submit("dialog[open] form");
  await waitFor(
    () => evaluate("!document.querySelector('dialog[open]')"),
    "ERD table saved",
  );
  assert.equal(
    (
      await db.execute({
        sql: "SELECT title FROM project_artifacts WHERE id=?",
        args: [parent.id],
      })
    ).rows[0].title,
    "Edited from ERD",
  );
  await click('button[aria-label="free_table 삭제"]');
  await waitFor(
    () =>
      evaluate(
        "[...document.querySelectorAll('dialog[open] button')].some(b=>b.textContent==='삭제')",
      ),
    "table deletion confirmation",
  );
  await evaluate(
    "[...document.querySelectorAll('dialog[open] button')].find(b=>b.textContent==='삭제').click()",
  );
  await waitFor(
    () =>
      evaluate(
        "!document.querySelector('button[aria-label=\"free_table 수정\"]')",
      ),
    "deleted table disappears",
  );
  await screenshot("database-erd-actions");
  await resize(390, 844);
  assert.ok(
    await evaluate(
      "document.querySelector('.table-scroll').scrollWidth>document.querySelector('.table-scroll').clientWidth",
    ),
  );
  assert.equal(
    await evaluate("document.documentElement.scrollWidth>innerWidth"),
    false,
  );
  await evaluate("document.documentElement.dataset.theme='dark'");
  await screenshot("database-erd-mobile-dark");
  // Self-FK has no artifact_links row, but must still prevent deletion.
  const clear = await evaluate(
    `(async()=>{const r=await fetch('/api/projects/nav-project/artifacts');return (await r.json()).artifacts.find(a=>a.id===${JSON.stringify(child.id)})})()`,
  );
  delete clear.structure.columns[0].reference;
  await evaluate(
    `fetch('/api/projects/nav-project/artifacts/${child.id}',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(${JSON.stringify(clear)})}).then(r=>{if(!r.ok)throw new Error('clear FK failed')})`,
  );
  // Viewer can read domain details and ERD but cannot mutate either.
  await db.executeMultiple(
    "INSERT INTO project_members(project_id,workspace_id,user_id,role) VALUES ('nav-project','nav-ws','nav-user','viewer');",
  );
  await call("Network.setCookie", {
    name: "hams_session",
    value: "nav-user-session",
    url: origin,
    httpOnly: true,
  });
  await navigate("/projects/nav-project/database/erd");
  assert.equal(
    await evaluate(
      "document.querySelectorAll('.database-card-header button').length",
    ),
    0,
  );
  await navigate("/projects/nav-project/database/domains");
  await waitFor(
    () =>
      evaluate("document.querySelector('tbody')?.textContent.includes('job')"),
    "reader domain list",
  );
  assert.equal(
    await evaluate(
      "[...document.querySelectorAll('button')].some(b=>b.textContent==='도메인 메타 등록'||b.textContent==='삭제')",
    ),
    false,
  );
  await click("tbody button");
  await waitFor(
    () => evaluate("!!document.querySelector('dialog[open]')"),
    "read-only domain detail",
  );
  assert.equal(
    await evaluate("document.querySelector('dialog[open] fieldset').disabled"),
    true,
  );
  // Channel creation can be blocked even when BroadcastChannel exists.
  await call("Network.setCookie", {
    name: "hams_session",
    value: "nav-admin-session",
    url: origin,
    httpOnly: true,
  });
  const blocked = await call("Page.addScriptToEvaluateOnNewDocument", {
    source:
      "globalThis.BroadcastChannel=class {constructor(){throw new Error('Synthetic blocked channel')}}",
  });
  await navigate("/projects/nav-project/database/domains");
  await waitFor(
    () =>
      evaluate(
        "[...document.querySelectorAll('button')].some(b=>b.textContent==='도메인 메타 등록')",
      ),
    "blocked channel page works",
  );
  await evaluate(
    "[...document.querySelectorAll('button')].find(b=>b.textContent==='도메인 메타 등록').click()",
  );
  await waitFor(
    () => evaluate("!!document.querySelector('.database-domain-dialog[open]')"),
    "blocked channel form",
  );
  for (const [name, value] of Object.entries({
    logicalName: "통지차단",
    physicalName: "blocked_channel",
    databaseType: "oracle",
    dataType: "DATE",
  }))
    await input(`dialog[open] [name=${name}]`, value);
  await submit(".database-domain-dialog form");
  await waitFor(
    () => evaluate("!document.querySelector('dialog[open]')"),
    "save succeeds without channels",
  );
  assert.equal(
    (
      await db.execute(
        "SELECT COUNT(*) AS n FROM project_database_domains WHERE physical_name='blocked_channel' AND database_type='oracle' AND deleted_at IS NULL",
      )
    ).rows[0].n,
    1,
  );
  await call("Page.removeScriptToEvaluateOnNewDocument", {
    identifier: blocked.identifier,
  });
}
