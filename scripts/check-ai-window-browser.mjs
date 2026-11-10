import assert from "node:assert/strict";

// Called with a real, hydrated room containing an unsent prompt and image.
export async function checkAiWindowBrowser({ evaluate, click, resize, pause, screenshot, call }) {
  const split = '[aria-label="AI 채팅 좌우 분리"]';
  const stacked = '[aria-label="AI 채팅 상하 배치로 복원"]';
  const expand = '[aria-label="AI 채팅 확대"]';
  const shrink = '[aria-label="AI 채팅 축소"]';
  const popout = '[aria-label="AI 채팅 팝업으로 전환"]';
  const dock = '[aria-label="AI 채팅 패널로 전환"]';
  async function geometry() {
    return evaluate(`(()=>{
      const rect=s=>document.querySelector(s).getBoundingClientRect();
      const panel=rect('.matrix-ai-drawer'),layout=rect('.workspace-content-layout');
      const messages=rect('.matrix-ai-messages'),card=rect('.matrix-ai-card');
      const root=document.querySelector('.matrix-ai'),style=getComputedStyle(root);
      return {width:panel.width,ratio:panel.width/layout.width,left:panel.left,right:panel.right,
        split:card.left>messages.left+messages.width-1&&Math.abs(card.top-messages.top)<2,
        contentWidth:root.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight),
        sameHeight:Math.abs(card.height-messages.height)<2,
        overflow:document.documentElement.scrollWidth>innerWidth};
    })()`);
  }
  function near(actual, expected, label, tolerance = 2) {
    assert.ok(Math.abs(actual-expected)<=tolerance, `${label}: ${actual} vs ${expected}`);
  }
  async function preserved() {
    assert.deepEqual(await evaluate(`({
      sameNode:window.aiLayoutPrompt===document.querySelector('textarea[aria-label="AI 요청 내용"]'),
      prompt:window.aiLayoutPrompt.value,
      model:document.querySelector('[aria-label="AI 사용 모델"]').value,
      target:document.querySelector('[aria-label="AI 대상 페이지"]').value,
      images:document.querySelectorAll('.matrix-ai-attachments figure').length,
      requests:window.aiLayoutRequests
    })`), { sameNode:true, ...snapshot, requests:[] });
  }
  const snapshot = await evaluate(`(()=>{
    window.aiLayoutPrompt=document.querySelector('textarea[aria-label="AI 요청 내용"]');
    window.aiLayoutOriginalFetch=window.fetch;window.aiLayoutRequests=[];
    // Next.js may prefetch unrelated navigation links while panel width changes.
    window.fetch=(...args)=>{const url=String(args[0]?.url??args[0]);if(new URL(url,location.href).pathname.startsWith('/api/'))window.aiLayoutRequests.push(url);return window.aiLayoutOriginalFetch(...args)};
    return {prompt:window.aiLayoutPrompt.value,model:document.querySelector('[aria-label="AI 사용 모델"]').value,
      target:document.querySelector('[aria-label="AI 대상 페이지"]').value,
      images:document.querySelectorAll('.matrix-ai-attachments figure').length};
  })()`);
  try {
    assert.equal(snapshot.images, 1);
    assert.deepEqual(await evaluate("[...document.querySelector('.matrix-ai-window-actions').children].map(e=>e.getAttribute('aria-label'))"),
      ["AI 채팅 좌우 분리", "AI 채팅 팝업으로 전환", "AI 채팅 확대", "AI 채팅 닫기"]);
    near((await geometry()).ratio, .3, "initial panel", .002);
    // Exercise the actual keyboard activation path, preserving focus on the button.
    await evaluate(`document.querySelector(${JSON.stringify(split)}).focus()`);
    await call("Input.dispatchKeyEvent", {type:"keyDown",key:"Enter",code:"Enter",windowsVirtualKeyCode:13,text:"\r"});
    await call("Input.dispatchKeyEvent", {type:"keyUp",key:"Enter",code:"Enter",windowsVirtualKeyCode:13});
    await pause(400);
    let g = await geometry();
    near(g.ratio, .5, "split panel", .002);
    assert.ok(g.split && g.sameHeight && !g.overflow, JSON.stringify(g));
    assert.equal(await evaluate(`document.activeElement===document.querySelector(${JSON.stringify(stacked)})`), true);
    await preserved();
    await screenshot("chat-split-panel");
    await click(shrink);
    assert.equal((await geometry()).split, false);
    await click(stacked);
    near((await geometry()).ratio, .3, "restore original width", .002);
    await click(expand);
    await click(split);
    await click(shrink);
    await click(stacked);
    near((await geometry()).ratio, .5, "restore expanded stacked width", .002);
    await click(shrink);
    await click(popout);
    near((await geometry()).width, 460, "default popup");
    // Place the narrow popup at the right edge before expanding it via split.
    await evaluate("document.querySelector('.matrix-ai-drag-handle').focus()");
    for (let i=0;i<32;i++)
      await call("Input.dispatchKeyEvent", {type:"keyDown",key:"ArrowRight",code:"ArrowRight",windowsVirtualKeyCode:39,modifiers:8});
    await click(split);
    g = await geometry();
    near(g.width, 760, "split popup");
    assert.ok(g.left>=12 && g.right<=1440-12 && g.split, JSON.stringify(g));
    assert.ok((await evaluate(`document.querySelector(${JSON.stringify(shrink)}).title`)).includes("460px"));
    await preserved();
    // Exact container-query boundaries, independent of viewport or sidebar width.
    for (const width of [559,560,561]) {
      await evaluate(`Object.assign(document.querySelector('.matrix-ai').style,{boxSizing:'content-box',width:'${width}px'})`);
      await pause(100);
      g=await geometry();
      near(g.contentWidth,width,"container content width",.1);
      assert.equal(g.split,width>=560,`container threshold ${width}`);
    }
    await evaluate("document.querySelector('.matrix-ai').removeAttribute('style')");
    await screenshot("chat-split-popup");
    await click(dock);
    near((await geometry()).ratio,.5,"dock split popup",.002);
    await click(stacked);
    near((await geometry()).ratio,.3,"original stacked choice survives popup",.002);
    await click(split);
    for (const width of [961,960,701,700,390]) {
      await resize(width,844);
      g=await geometry();
      assert.equal(g.split,false,`narrow panel at ${width}`);
      assert.equal(g.overflow,false,`page overflow at ${width}`);
      assert.ok(await evaluate(`(()=>{const p=document.querySelector('.matrix-ai-drawer').getBoundingClientRect();return [...document.querySelectorAll('.matrix-ai-window-actions button,.matrix-ai-card select,.matrix-ai-card textarea')].every(e=>{const r=e.getBoundingClientRect();return r.left>=p.left&&r.right<=p.right+1})})()`),`controls fit at ${width}`);
      assert.equal(await evaluate(`document.querySelector(${JSON.stringify(stacked)}).getAttribute('aria-pressed')`),"true");
    }
    await evaluate("document.documentElement.dataset.theme='dark'");
    await screenshot("chat-split-mobile-fallback");
    await resize(1440,480);
    g=await geometry();
    assert.ok(g.split&&g.sameHeight);
    // A short viewport makes the input card scroll; the send button stays reachable.
    assert.ok(await evaluate(`(()=>{const card=document.querySelector('.matrix-ai-card'),messages=document.querySelector('.matrix-ai-messages');card.scrollTop=card.scrollHeight;const button=card.querySelector('.matrix-ai-generate');button.scrollIntoView({block:'nearest'});const c=card.getBoundingClientRect(),b=button.getBoundingClientRect();return getComputedStyle(card).overflowY==='auto'&&getComputedStyle(messages).overflowY==='auto'&&b.top>=c.top&&b.bottom<=c.bottom+1})()`));
    await preserved();
    await screenshot("chat-split-low-height-dark");
    await resize(1440);
    await evaluate("document.documentElement.dataset.theme='light'");
    // Finish in the original mode so the target regression flow stays independent.
    await click(stacked);
    await preserved();
    console.log("PASS chat layout: keyboard/header order, 30/50% panel, 460/760px popup and bounds, per-mode width restoration, DOM/draft/model/target/image preservation without API requests, 559/560/561px containers, responsive controls, independent scroll and dark/low-height.");
  } finally {
    await evaluate("window.fetch=window.aiLayoutOriginalFetch;delete window.aiLayoutPrompt;delete window.aiLayoutOriginalFetch;delete window.aiLayoutRequests");
  }
}
