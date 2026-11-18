import assert from "node:assert/strict";
import { checkAiWindowResizeBrowser } from "./check-ai-window-resize-browser.mjs";

// Called with a real, hydrated room containing an unsent prompt and image.
export async function checkAiWindowBrowser({
  evaluate,
  click,
  resize,
  pause,
  screenshot,
  call,
}) {
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
      const pane=rect('.matrix-ai-conversation-pane'),footer=rect('.matrix-ai-conversation-footer');
      const root=document.querySelector('.matrix-ai'),style=getComputedStyle(root);
      return {width:panel.width,layoutWidth:layout.width,ratio:panel.width/layout.width,left:panel.left,right:panel.right,
        messagesWidth:messages.width,cardWidth:card.width,
        floating:document.querySelector('.workspace-content-layout').classList.contains('ai-is-floating'),
        split:card.left>messages.left+messages.width-1&&Math.abs(card.top-messages.top)<2,
        contentWidth:root.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight),
        sameHeight:Math.abs(card.bottom-pane.bottom)<2&&Math.abs(card.top-pane.top)<2,
        footerVisible:footer.top>=messages.bottom-1&&footer.bottom<=pane.bottom+1&&pane.bottom<=panel.bottom,
        overflow:document.documentElement.scrollWidth>innerWidth};
    })()`);
  }
  function near(actual, expected, label, tolerance = 2) {
    assert.ok(
      Math.abs(actual - expected) <= tolerance,
      `${label}: ${actual} vs ${expected}`,
    );
  }
  async function growthAllocation(expectedGrowth = 100) {
    const before = await geometry();
    await evaluate(
      `(()=>{const layout=document.querySelector('.workspace-content-layout');window.aiSavedGrowth=layout.style.getPropertyValue('--ai-window-growth');layout.style.setProperty('--ai-window-growth','0px')})()`,
    );
    await pause(400);
    const baseline = await geometry();
    await evaluate(
      `document.querySelector('.workspace-content-layout').style.setProperty('--ai-window-growth',window.aiSavedGrowth)`,
    );
    await pause(400);
    const after = await geometry();
    near(after.width - baseline.width, expectedGrowth, "actual outer growth");
    near(after.width, before.width, "restored growth");
    if (baseline.split && after.split) {
      if (after.floating) {
        near(after.cardWidth, 386, "popup fixed composer");
        near(after.cardWidth, baseline.cardWidth, "popup composer preserved");
        near(
          after.messagesWidth - baseline.messagesWidth,
          expectedGrowth,
          "all popup growth goes to conversation",
        );
      } else {
        near(
          after.messagesWidth,
          baseline.messagesWidth,
          "panel conversation preserved",
        );
        near(
          after.cardWidth - baseline.cardWidth,
          expectedGrowth,
          "all panel growth goes to input",
        );
      }
    }
    assert.ok(after.footerVisible, JSON.stringify(after));
  }
  async function preserved() {
    assert.deepEqual(
      await evaluate(`({
      sameNode:window.aiLayoutPrompt===document.querySelector('textarea[aria-label="AI 요청 내용"]'),
      prompt:window.aiLayoutPrompt.value,
      model:document.querySelector('[aria-label="AI 사용 모델"]').value,
      target:document.querySelector('[aria-label="AI 대상 페이지"]').value,
      images:document.querySelectorAll('.matrix-ai-attachments figure').length,
      requests:window.aiLayoutRequests
    })`),
      { sameNode: true, ...snapshot, requests: [] },
    );
  }
  const snapshot = await evaluate(`(()=>{
    window.aiLayoutPrompt=document.querySelector('textarea[aria-label="AI 요청 내용"]');
    window.aiLayoutOriginalFetch=window.fetch;window.aiLayoutRequests=[];
    // Track AI and permission calls; unrelated header counter polling continues.
    window.fetch=(...args)=>{const url=String(args[0]?.url??args[0]);const path=new URL(url,location.href).pathname;if(path.startsWith('/api/ai/')||(path.startsWith('/api/projects/')&&path.endsWith('/access')))window.aiLayoutRequests.push(url);return window.aiLayoutOriginalFetch(...args)};
    return {prompt:window.aiLayoutPrompt.value,model:document.querySelector('[aria-label="AI 사용 모델"]').value,
      target:document.querySelector('[aria-label="AI 대상 페이지"]').value,
      images:document.querySelectorAll('.matrix-ai-attachments figure').length};
  })()`);
  try {
    assert.equal(snapshot.images, 1);
    assert.deepEqual(
      await evaluate(
        "[...document.querySelector('.matrix-ai-window-actions').children].map(e=>e.getAttribute('aria-label'))",
      ),
      [
        "AI 채팅 팝업으로 전환",
        "AI 채팅 좌우 분리",
        "AI 채팅 확대",
        "AI 채팅 닫기",
      ],
    );
    near((await geometry()).ratio, 0.3, "initial panel", 0.002);
    // Exercise the actual keyboard activation path, preserving focus on the button.
    await evaluate(`document.querySelector(${JSON.stringify(split)}).focus()`);
    await call("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: "Enter",
      code: "Enter",
      windowsVirtualKeyCode: 13,
      text: "\r",
    });
    await call("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "Enter",
      code: "Enter",
      windowsVirtualKeyCode: 13,
    });
    await pause(400);
    let g = await geometry();
    near(g.width, g.layoutWidth * 0.5 + 100, "split panel");
    assert.ok(
      g.split && g.sameHeight && g.footerVisible && !g.overflow,
      JSON.stringify(g),
    );
    await growthAllocation();
    assert.equal(
      await evaluate(
        `document.activeElement===document.querySelector(${JSON.stringify(stacked)})`,
      ),
      true,
    );
    await preserved();
    await screenshot("chat-split-panel");
    await click(shrink);
    g = await geometry();
    near(g.width, g.layoutWidth * 0.3 + 100, "split manual shrink");
    await click(stacked);
    near((await geometry()).ratio, 0.3, "restore original width", 0.002);
    await click(expand);
    await click(split);
    await click(shrink);
    await click(stacked);
    g = await geometry();
    near(g.width, g.layoutWidth * 0.5 + 100, "restore expanded stacked width");
    await click(shrink);
    await click(popout);
    near((await geometry()).width, 460, "default popup");
    await checkAiWindowResizeBrowser({
      evaluate,
      call,
      click,
      resize,
      pause,
      screenshot,
      preserved,
    });
    // Place the narrow popup at the right edge before expanding it via split.
    await evaluate("document.querySelector('.matrix-ai-drag-handle').focus()");
    for (let i = 0; i < 32; i++)
      await call("Input.dispatchKeyEvent", {
        type: "keyDown",
        key: "ArrowRight",
        code: "ArrowRight",
        windowsVirtualKeyCode: 39,
        modifiers: 8,
      });
    await click(split);
    g = await geometry();
    near(g.width, 860, "split popup");
    assert.ok(
      g.left >= 12 && g.right <= 1440 - 12 && g.split,
      JSON.stringify(g),
    );
    assert.ok(
      (
        await evaluate(
          `document.querySelector(${JSON.stringify(shrink)}).title`,
        )
      ).includes("560px"),
    );
    await growthAllocation();
    await click(shrink);
    near((await geometry()).width, 560, "split popup manual shrink");
    await click(expand);
    // Exercise partial and zero growth at the viewport limit, not a fixed 100px deduction.
    for (const [viewportWidth, growth] of [
      [824, 40],
      [760, 0],
    ]) {
      await resize(viewportWidth, 900);
      near((await geometry()).width, viewportWidth - 24, "capped popup");
      await growthAllocation(growth);
      g = await geometry();
      assert.ok(
        g.left >= 12 && g.right <= viewportWidth - 12 + 1 && g.sameHeight,
      );
    }
    await resize(1440);
    await preserved();
    // Exact container-query boundaries, independent of viewport or sidebar width.
    for (const width of [559, 560, 561, 637, 638, 639]) {
      await evaluate(
        `Object.assign(document.querySelector('.matrix-ai').style,{boxSizing:'content-box',width:'${width}px'})`,
      );
      await pause(100);
      g = await geometry();
      near(g.contentWidth, width, "container content width", 0.1);
      assert.equal(g.split, width >= 638, `popup container threshold ${width}`);
      if (g.split) near(g.cardWidth, 386, "fixed composer at popup threshold");
    }
    await evaluate(
      "document.querySelector('.matrix-ai').removeAttribute('style')",
    );
    await screenshot("chat-split-popup");
    await click(dock);
    g = await geometry();
    near(g.width, g.layoutWidth * 0.5 + 100, "dock split popup");
    // The panel retains its original threshold and input-first growth policy.
    for (const width of [559, 560, 561]) {
      await evaluate(
        `Object.assign(document.querySelector('.matrix-ai').style,{boxSizing:'content-box',width:'${width}px'})`,
      );
      await pause(100);
      g = await geometry();
      near(g.contentWidth, width, "panel container content width", 0.1);
      assert.equal(g.split, width >= 560, `panel container threshold ${width}`);
    }
    await evaluate(
      "document.querySelector('.matrix-ai').removeAttribute('style')",
    );
    await click(stacked);
    near(
      (await geometry()).ratio,
      0.3,
      "original stacked choice survives popup",
      0.002,
    );
    await click(split);
    for (const width of [961, 960, 701, 700, 390]) {
      await resize(width, 844);
      g = await geometry();
      assert.equal(g.split, false, `narrow panel at ${width}`);
      assert.equal(g.overflow, false, `page overflow at ${width}`);
      assert.ok(
        await evaluate(
          `(()=>{const p=document.querySelector('.matrix-ai-drawer').getBoundingClientRect();return [...document.querySelectorAll('.matrix-ai-window-actions button,.matrix-ai-card select,.matrix-ai-card textarea')].every(e=>{const r=e.getBoundingClientRect();return r.left>=p.left&&r.right<=p.right+1})})()`,
        ),
        `controls fit at ${width}`,
      );
      assert.equal(
        await evaluate(
          `document.querySelector(${JSON.stringify(stacked)}).getAttribute('aria-pressed')`,
        ),
        "true",
      );
    }
    await evaluate("document.documentElement.dataset.theme='dark'");
    await screenshot("chat-split-mobile-fallback");
    await resize(1440, 480);
    g = await geometry();
    assert.ok(g.split && g.sameHeight && g.footerVisible, JSON.stringify(g));
    // A short viewport makes the input card scroll; the send button stays reachable.
    assert.ok(
      await evaluate(
        `(()=>{const card=document.querySelector('.matrix-ai-card'),messages=document.querySelector('.matrix-ai-messages');card.scrollTop=card.scrollHeight;const button=card.querySelector('.matrix-ai-generate');button.scrollIntoView({block:'nearest'});const c=card.getBoundingClientRect(),b=button.getBoundingClientRect();return getComputedStyle(card).overflowY==='auto'&&getComputedStyle(messages).overflowY==='auto'&&b.top>=c.top&&b.bottom<=c.bottom+1})()`,
      ),
    );
    await preserved();
    await screenshot("chat-split-low-height-dark");
    await resize(1440);
    await evaluate("document.documentElement.dataset.theme='light'");
    // Finish in the original mode so the target regression flow stays independent.
    await click(stacked);
    await preserved();
    console.log(
      "PASS chat layout: panel input-first growth/560px threshold; popup 386px composer, conversation-only 100/40/0px growth/638px threshold; 460/560/860px presets, footer alignment, bounds, mode restoration, DOM/draft/model/target/image preservation without API requests, responsive controls, independent scroll and dark/low-height.",
    );
  } finally {
    await evaluate(
      "window.fetch=window.aiLayoutOriginalFetch;delete window.aiLayoutPrompt;delete window.aiLayoutOriginalFetch;delete window.aiLayoutRequests",
    );
  }
}
