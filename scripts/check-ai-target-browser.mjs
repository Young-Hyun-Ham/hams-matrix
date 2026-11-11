import assert from "node:assert/strict";
import { checkAiWindowBrowser } from "./check-ai-window-browser.mjs";

export async function checkAiTargetBrowser({
  evaluate,
  click,
  navigate,
  resize,
  pause,
  waitFor,
  screenshot,
  db,
  call,
}) {
  const selector = '[aria-label="AI 대상 페이지"]';
  const ai = '[aria-controls="matrix-ai-conversations"]';
  async function options() {
    if (
      !(await evaluate(
        `document.querySelector(${JSON.stringify(ai)}).getAttribute('aria-expanded')==='true'`,
      ))
    )
      await click(ai);
    if (
      !(await evaluate(
        "document.querySelector('.matrix-ai-project-toggle').getAttribute('aria-expanded')==='true'",
      ))
    )
      await click(".matrix-ai-project-toggle");
  }
  async function setTarget(value) {
    await evaluate(
      `(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}))})()`,
    );
    await waitFor(
      () =>
        evaluate(
          `document.querySelector(${JSON.stringify(selector)}).value===${JSON.stringify(value)}&&!document.querySelector(${JSON.stringify(selector)}).disabled`,
        ),
      `target ${value}`,
    );
  }
  async function input(value) {
    await evaluate(
      `(()=>{const e=document.querySelector('textarea[aria-label="AI 요청 내용"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}))})()`,
    );
    await pause(100);
  }
  const path = "/projects/nav-project?tab=database";
  await resize(1440);
  await navigate("nav-admin", path);
  await waitFor(
    () => evaluate("!!document.querySelector('.matrix-tab-content')"),
    "project ready",
  );
  await options();
  await click(".matrix-ai-new-chat");
  await waitFor(
    () =>
      evaluate(
        `document.querySelector(${JSON.stringify(selector)})?.value==='database'&&!document.querySelector(${JSON.stringify(selector)}).disabled`,
      ),
    "new room current target",
  );
  await waitFor(
    () =>
      evaluate(
        "!document.querySelector('[aria-label=\"AI 대상 페이지\"] option[value=requirement]').disabled",
      ),
    "target permissions",
  );
  await evaluate(
    `(()=>{window.permissionOriginalFetch=window.fetch;window.permissionCalls=[];window.denyPermissionCheck=false;window.fetch=(url,init)=>{const path=String(url);if(path.endsWith('/access')||path==='/api/ai/chats'||(path.startsWith('/api/ai/conversations/')&&init?.method==='PATCH'))window.permissionCalls.push({path,method:init?.method||'GET'});if(path.endsWith('/access')&&window.denyPermissionCheck)return Promise.resolve(Response.json({error:'Synthetic denied preflight'},{status:403}));return window.permissionOriginalFetch(url,init);};})()`,
  );
  await pause(21000);
  assert.equal(
    await evaluate(
      "window.permissionCalls.filter(c=>c.path.endsWith('/access')).length",
    ),
    0,
    "no ten-second permission polling",
  );
  await evaluate(
    "window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'))",
  );
  await pause(500);
  assert.equal(
    await evaluate(
      "window.permissionCalls.filter(c=>c.path.endsWith('/access')).length",
    ),
    0,
    "focus does not trigger an access GET",
  );
  await click('[aria-label="AI 채팅 닫기"]');
  await click(".matrix-ai-room");
  await waitFor(
    () =>
      evaluate(
        "window.permissionCalls.some(c=>c.path.endsWith('/access'))&&!document.querySelector('[aria-label=\"AI 대상 페이지\"] option[value=requirement]').disabled",
      ),
    "open refreshes permissions",
  );
  await input("permission preflight retains draft");
  await waitFor(
    () => evaluate("!document.querySelector('.matrix-ai-generate').disabled"),
    "permission preflight ready",
  );
  await evaluate("window.permissionCalls=[];window.denyPermissionCheck=true");
  await click(".matrix-ai-generate");
  await waitFor(
    () =>
      evaluate(
        "[...document.querySelectorAll('[role=alert]')].some(e=>e.textContent.includes('권한이 없습니다'))",
      ),
    "denied execution preflight",
  );
  assert.equal(
    await evaluate(
      "window.permissionCalls.filter(c=>c.path.endsWith('/access')).length",
    ),
    1,
  );
  assert.equal(
    await evaluate(
      "window.permissionCalls.filter(c=>c.method==='POST').length",
    ),
    0,
    "denied access must not start generation",
  );
  assert.equal(
    await evaluate(
      "document.querySelector('textarea[aria-label=\"AI 요청 내용\"]').value",
    ),
    "permission preflight retains draft",
  );
  await evaluate(
    "window.denyPermissionCheck=false;[...document.querySelectorAll('button')].find(e=>e.textContent==='권한 다시 확인').click()",
  );
  await waitFor(
    () =>
      evaluate(
        "!document.querySelector('[aria-label=\"AI 대상 페이지\"] option[value=requirement]').disabled",
      ),
    "explicit access retry",
  );
  await evaluate("window.fetch=window.permissionOriginalFetch");
  await input("작성 중인 프롬프트 유지");
  await evaluate(
    `(async()=>{const c=document.createElement('canvas');c.width=4;c.height=4;c.getContext('2d').fillRect(0,0,4,4);const b=await new Promise(resolve=>c.toBlob(resolve,'image/png')),d=new DataTransfer();d.items.add(new File([b],'synthetic.png',{type:'image/png'}));document.querySelector('textarea[aria-label="AI 요청 내용"]').dispatchEvent(new ClipboardEvent('paste',{clipboardData:d,bubbles:true}))})()`,
  );
  await waitFor(
    () =>
      evaluate(
        "document.querySelectorAll('.matrix-ai-attachments figure').length===1",
      ),
    "attachment loaded",
  );
  await setTarget("requirement");
  assert.equal(await evaluate("location.pathname+location.search"), path);
  assert.ok(
    await evaluate(
      "document.querySelector('.matrix-ai-context').textContent.includes('DB 설계')",
    ),
  );
  assert.equal(
    await evaluate(
      "document.querySelector('textarea[aria-label=\"AI 요청 내용\"]').value",
    ),
    "작성 중인 프롬프트 유지",
  );
  assert.equal(
    await evaluate(
      "document.querySelectorAll('.matrix-ai-attachments figure').length",
    ),
    1,
  );
  const room = (
    await db.execute(
      "SELECT conv_id,target_page,target_version FROM ai_conversations WHERE user_id='nav-admin' ORDER BY rowid DESC LIMIT 1",
    )
  ).rows[0];
  assert.equal(room.target_page, "requirement");
  assert.equal(room.target_version, 2);
  await checkAiWindowBrowser({
    evaluate,
    click,
    resize,
    pause,
    screenshot,
    call,
  });
  await screenshot("target-cross-page-draft");
  await click(".matrix-ai-remove-image");
  await input("[UI] 요구사항을 분석해줘");
  await waitFor(
    () => evaluate("!document.querySelector('.matrix-ai-generate').disabled"),
    "generation ready",
  );
  await click(".matrix-ai-generate");
  await waitFor(
    () => evaluate("document.querySelectorAll('.matrix-ai-turn').length===1"),
    "target generation",
  );
  const chat = (
    await db.execute({
      sql: "SELECT pathname,tab,target_page,target_version,screen_title FROM ai_prompt_chats WHERE conv_id=?",
      args: [room.conv_id],
    })
  ).rows[0];
  assert.equal(chat.tab, "database");
  assert.equal(chat.target_page, "requirement");
  assert.ok(chat.screen_title.includes("요구사항"));
  await click('[aria-label="AI 채팅 좌우 분리"]');
  await click(".matrix-ai-message-actions button");
  assert.equal(
    await evaluate("!!document.querySelector('.matrix-ai-result[open]')"),
    true,
  );
  await call("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27,
  });
  await pause(150);
  assert.equal(
    await evaluate("!!document.querySelector('.matrix-ai-result[open]')"),
    false,
  );
  assert.equal(
    await evaluate(
      "document.querySelector('.workspace-content-layout').classList.contains('ai-is-open')",
    ),
    true,
  );
  await evaluate(
    "void(window.aiReopenPrompt=document.querySelector('textarea'))",
  );
  await click('[aria-label="AI 채팅 닫기"]');
  await click(".matrix-ai-room");
  await waitFor(
    () =>
      evaluate(`!document.querySelector(${JSON.stringify(selector)}).disabled`),
    "split room reopened",
  );
  assert.equal(
    await evaluate(
      "window.aiReopenPrompt===document.querySelector('textarea')&&document.querySelector('.workspace-content-layout').classList.contains('ai-is-split')",
    ),
    true,
  );
  await click('[aria-label="AI 채팅 상하 배치로 복원"]');
  await setTarget("screen");
  await navigate("nav-admin", path);
  await options();
  await click(".matrix-ai-room");
  await waitFor(
    () =>
      evaluate(
        `document.querySelector(${JSON.stringify(selector)})?.value==='screen'&&!document.querySelector(${JSON.stringify(selector)}).disabled`,
      ),
    "saved target after full reload",
  );
  assert.ok(
    await evaluate(
      "document.querySelector('.matrix-ai-assistant-message small').textContent.includes('요구사항')",
    ),
    "past message retains original target",
  );
  await evaluate(
    "[...document.querySelectorAll('.matrix-tabs button')].find(e=>e.textContent==='WBS 일정').click()",
  );
  await waitFor(
    () =>
      evaluate(
        "location.search==='?tab=wbs'&&document.querySelector('.matrix-ai-context').textContent.includes('WBS')",
      ),
    "actual page changes",
  );
  assert.equal(
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).value`),
    "screen",
  );
  await input("저장 실패 시에도 보존");
  await evaluate(
    `window.targetOriginalFetch=window.fetch;window.fetch=(url,options)=>String(url).startsWith('/api/ai/conversations/')&&options?.method==='PATCH'?Promise.resolve(Response.json({error:'Synthetic target save failure'},{status:500})):window.targetOriginalFetch(url,options)`,
  );
  await evaluate(
    `(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.value='program';e.dispatchEvent(new Event('change',{bubbles:true}))})()`,
  );
  await waitFor(
    () =>
      evaluate(
        "[...document.querySelectorAll('[role=alert]')].some(e=>e.textContent.includes('서버에서 요청을 처리하는 중 오류'))",
      ),
    "save error",
  );
  assert.equal(
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).value`),
    "screen",
  );
  assert.equal(
    await evaluate("document.querySelector('textarea').value"),
    "저장 실패 시에도 보존",
  );
  await evaluate("window.fetch=window.targetOriginalFetch");
  await setTarget("program");
  await evaluate(
    `window.fetch=(url,options)=>url==='/api/ai/chats'&&options?.method==='POST'?new Promise(resolve=>{window.finishTargetGenerate=()=>resolve(window.targetOriginalFetch(url,options))}):window.targetOriginalFetch(url,options)`,
  );
  await input("[UI] 프로그램을 분석해줘");
  await click(".matrix-ai-generate");
  assert.equal(
    await evaluate(
      `document.querySelector(${JSON.stringify(selector)}).disabled`,
    ),
    true,
  );
  await evaluate(
    "void(window.aiGeneratingPrompt=document.querySelector('textarea'))",
  );
  await click('[aria-label="AI 채팅 좌우 분리"]');
  assert.equal(
    await evaluate(
      "window.aiGeneratingPrompt===document.querySelector('textarea')&&document.querySelector('.matrix-ai-generate').getAttribute('aria-busy')==='true'",
    ),
    true,
  );
  await click('[aria-label="AI 채팅 팝업으로 전환"]');
  await click('[aria-label="AI 채팅 상하 배치로 복원"]');
  await click('[aria-label="AI 채팅 패널로 전환"]');
  assert.equal(
    await evaluate(
      `document.querySelector(${JSON.stringify(selector)}).disabled`,
    ),
    true,
  );
  await evaluate(
    "window.finishTargetGenerate();window.fetch=window.targetOriginalFetch",
  );
  await waitFor(
    () => evaluate("document.querySelectorAll('.matrix-ai-turn').length===2"),
    "generation settled",
  );
  await click('[aria-label="AI 채팅 팝업으로 전환"]');
  assert.equal(
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).value`),
    "program",
  );
  await screenshot("target-floating");
  await resize(390, 844);
  await evaluate("document.documentElement.dataset.theme='dark'");
  assert.ok(
    await evaluate(
      `(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return r.left>=0&&r.right<=innerWidth})()`,
    ),
  );
  await screenshot("target-mobile-dark");
  await resize(1440);
  await navigate("nav-admin", "/projects/nav-project?tab=documents");
  await options();
  await click(".matrix-ai-new-chat");
  await waitFor(
    () =>
      evaluate(
        `document.querySelector(${JSON.stringify(selector)})?.value==='documents'`,
      ),
    "unsupported current target retained",
  );
  await input("분석해줘");
  assert.equal(
    await evaluate("document.querySelector('.matrix-ai-generate').disabled"),
    true,
  );
  await setTarget("database");
  await waitFor(
    () => evaluate("!document.querySelector('.matrix-ai-generate').disabled"),
    "supported target enables generation",
  );
  await navigate("nav-user", "/projects/nav-free-project?tab=database");
  await options();
  await click(".matrix-ai-new-chat");
  await waitFor(
    () =>
      evaluate(
        `document.querySelector(${JSON.stringify(selector)})?.value==='database'&&!document.querySelector(${JSON.stringify(selector)}).disabled`,
      ),
    "temporary room default",
  );
  await setTarget("requirement");
  assert.equal(
    (
      await db.execute(
        "SELECT * FROM ai_conversations WHERE user_id='nav-user'",
      )
    ).rows.length,
    0,
  );
  await click('[aria-label="AI 채팅 닫기"]');
  // Temporary rooms have no list. Toggling the selected chat layout preserves its state.
  await evaluate(
    `(()=>{const e=document.querySelector('.matrix-ai-card');if(!e)throw Error('Persistent temporary panel missing')})()`,
  );
  assert.equal(
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).value`),
    "requirement",
  );
  console.log(
    "PASS browser targets: current-page default, selection without navigation, draft/image preservation, successful target generation, immediate persistence/reload, physical tab changes, save failure, busy state, floating/mobile/dark, documents and temporary room state.",
  );
}
