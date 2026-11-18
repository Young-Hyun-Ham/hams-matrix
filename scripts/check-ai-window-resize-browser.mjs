import assert from "node:assert/strict";

// Runs inside the existing synthetic-room browser fixture, with an unsent image.
export async function checkAiWindowResizeBrowser({
  evaluate,
  call,
  click,
  resize,
  pause,
  screenshot,
  preserved,
}) {
  const left = ".matrix-ai-resize-left";
  const right = ".matrix-ai-resize-right";
  const dock = '[aria-label="AI 채팅 패널로 전환"]';
  const popout = '[aria-label="AI 채팅 팝업으로 전환"]';
  const split = '[aria-label="AI 채팅 좌우 분리"]';
  const stacked = '[aria-label="AI 채팅 상하 배치로 복원"]';
  const expand = '[aria-label="AI 채팅 확대"]';
  const shrink = '[aria-label="AI 채팅 축소"]';
  async function geometry() {
    return evaluate(`(()=>{
      const panel=document.querySelector('.matrix-ai-drawer'),r=panel.getBoundingClientRect();
      const root=document.querySelector('.matrix-ai'),s=getComputedStyle(root);
      const card=document.querySelector('.matrix-ai-card').getBoundingClientRect();
      const pane=document.querySelector('.matrix-ai-conversation-pane').getBoundingClientRect();
      return {left:r.left,right:r.right,top:r.top,width:r.width,height:r.height,bottom:r.bottom,
        cardWidth:card.width,paneWidth:pane.width,
        content:root.clientWidth-parseFloat(s.paddingLeft)-parseFloat(s.paddingRight),
        split:card.left>=pane.right-1&&Math.abs(card.top-pane.top)<2,
        resizing:document.querySelector('.workspace-content-layout').classList.contains('ai-is-resizing'),
        overflow:document.documentElement.scrollWidth>innerWidth,
        aligned:Math.abs(card.bottom-pane.bottom)<2};
    })()`);
  }
  function near(actual, expected, label) {
    assert.ok(
      Math.abs(actual - expected) < 2,
      `${label}: ${actual} vs ${expected}`,
    );
  }
  function fixedComposer(before, after) {
    assert.ok(
      after.split && after.aligned && !after.overflow,
      JSON.stringify(after),
    );
    near(after.cardWidth, 386, "fixed popup composer");
    assert.ok(after.paneWidth >= 239, "conversation minimum width");
    if (before.split) {
      near(
        after.cardWidth,
        before.cardWidth,
        "composer preserved while resizing",
      );
      near(
        after.paneWidth - before.paneWidth,
        after.width - before.width,
        "all resized width goes to conversation",
      );
    }
  }
  async function pointerStart(selector, button = "left") {
    const point =
      await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),r=e.getBoundingClientRect();
      e.addEventListener('pointerdown',event=>{window.aiResizePointerId=event.pointerId},{once:true});
      return {x:r.left+r.width/2,y:r.top+Math.min(30,r.height/2)}})()`);
    await call("Input.dispatchMouseEvent", { type: "mouseMoved", ...point });
    await call("Input.dispatchMouseEvent", {
      type: "mousePressed",
      ...point,
      button,
      buttons: button === "left" ? 1 : 2,
      clickCount: 1,
    });
    await pause(50);
    return point;
  }
  async function pointerEnd(point, button = "left") {
    await call("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      ...point,
      button,
      buttons: 0,
      clickCount: 1,
    });
    await pause(80);
  }
  async function drag(selector, dx, dy = 20) {
    const point = await pointerStart(selector);
    assert.ok(
      await evaluate(
        `document.querySelector(${JSON.stringify(selector)}).hasPointerCapture(window.aiResizePointerId)`,
      ),
    );
    const target = { x: point.x + dx, y: point.y + dy };
    await call("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      ...target,
      button: "left",
      buttons: 1,
    });
    await pause(80);
    await pointerEnd(target);
    assert.equal((await geometry()).resizing, false);
    return geometry();
  }
  async function key(selector, key, modifiers = 0) {
    await evaluate(
      `document.querySelector(${JSON.stringify(selector)}).focus()`,
    );
    const code = { ArrowLeft: 37, ArrowRight: 39, Home: 36, End: 35 }[key];
    await call("Input.dispatchKeyEvent", {
      type: "keyDown",
      key,
      code: key,
      windowsVirtualKeyCode: code,
      modifiers,
    });
    await call("Input.dispatchKeyEvent", {
      type: "keyUp",
      key,
      code: key,
      windowsVirtualKeyCode: code,
      modifiers,
    });
    await pause(80);
    return geometry();
  }
  async function widthTo(width) {
    return drag(right, width - (await geometry()).width);
  }
  async function touchResize(delta) {
    await call("Emulation.setTouchEmulationEnabled", { enabled: true });
    try {
      const touch = await evaluate(
        `(()=>{const r=document.querySelector('${right}').getBoundingClientRect();return {x:r.left+4,y:r.top+40}})()`,
      );
      await call("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ ...touch, id: 0 }],
      });
      await call("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: touch.x + delta, y: touch.y, id: 0 }],
      });
      await pause(100);
      await call("Input.dispatchTouchEvent", {
        type: "touchCancel",
        touchPoints: [],
      });
      await pause(100);
      const result = await geometry();
      assert.equal(result.resizing, false);
      return result;
    } finally {
      await call("Emulation.setTouchEmulationEnabled", { enabled: false });
    }
  }

  assert.equal(
    await evaluate(
      "document.querySelectorAll('.matrix-ai-resize-handle').length",
    ),
    2,
  );
  let before = await geometry();
  let after = await drag(right, 120);
  near(after.width, before.width + 120, "right expansion");
  near(after.left, before.left, "right handle fixed left");
  near(after.top, before.top, "resize preserves y");
  near(after.height, before.height, "resize preserves height");
  before = after;
  after = await drag(right, -80);
  near(after.width, before.width - 80, "right shrink");
  before = after;
  after = await drag(left, -80);
  near(after.width, before.width + 80, "left expansion");
  near(after.right, before.right, "left handle fixed right");
  before = after;
  after = await drag(left, 40);
  near(after.width, before.width - 40, "left shrink");
  near(after.right, before.right, "left shrink fixed right");

  const secondary = await pointerStart(right, "right");
  assert.equal((await geometry()).resizing, false);
  await pointerEnd(secondary, "right");
  near((await geometry()).width, after.width, "secondary button ignored");
  after = await widthTo(200);
  near(after.width, 360, "pointer minimum");
  near((await key(right, "ArrowRight")).width, 370, "keyboard 10px");
  near((await key(right, "ArrowRight", 8)).width, 410, "keyboard shift 40px");
  near((await key(right, "Home")).width, 360, "keyboard minimum");
  before = await geometry();
  after = await key(right, "End");
  near(after.left, before.left, "right maximum fixed left");
  near(after.right, 1428, "right viewport boundary");
  after = await key(left, "End");
  near(after.left, 12, "left viewport boundary");
  near(after.width, 1416, "both viewport margins");
  before = after;
  after = await key(left, "Home");
  near(after.width, 360, "left minimum");
  near(after.right, before.right, "left Home fixed right");
  await key(left, "End");
  await widthTo(600);
  before = await geometry();
  after = await drag(".matrix-ai-drag-handle", 100, 20);
  near(after.left, before.left + 100, "title movement after resize");
  near(after.top, before.top + 20, "title y movement");
  near(after.width, 600, "title preserves custom width");

  // Lifecycle cancellation uses native capture plus interruption events.
  for (const interruption of ["cancel", "capture", "blur", "viewport"]) {
    const point = await pointerStart(right);
    await call("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: point.x + 10,
      y: point.y + 20,
      button: "left",
      buttons: 1,
    });
    await pause(50);
    assert.ok((await geometry()).resizing, interruption);
    if (interruption === "viewport") await resize(1400, 900);
    else
      await evaluate(
        interruption === "blur"
          ? "window.dispatchEvent(new Event('blur'))"
          : interruption === "capture"
            ? `document.querySelector('${right}').releasePointerCapture(window.aiResizePointerId)`
            : `document.querySelector('${right}').dispatchEvent(new PointerEvent('pointercancel',{bubbles:true,pointerId:window.aiResizePointerId}))`,
      );
    // Native releasePointerCapture dispatches lostpointercapture on the next pointer event.
    await call("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: point.x + 11,
      y: point.y + 21,
      button: "left",
      buttons: 1,
    });
    await pause(80);
    assert.equal((await geometry()).resizing, false, interruption);
    assert.equal(
      await evaluate(
        `document.querySelector('${right}').hasPointerCapture(window.aiResizePointerId)`,
      ),
      false,
    );
    await pointerEnd({ x: point.x + 10, y: point.y + 20 });
    await resize(1440, 900);
  }
  await widthTo(1000);
  assert.ok((await geometry()).width > 860);
  assert.ok(
    (
      await evaluate(`document.querySelector(${JSON.stringify(expand)}).title`)
    ).includes("사용자 지정 너비"),
  );
  await preserved();
  await click(dock);
  assert.equal(
    await evaluate(
      "document.querySelectorAll('.matrix-ai-resize-handle').length",
    ),
    0,
  );
  await click(popout);
  near((await geometry()).width, 1000, "dock-popout custom restore");
  await resize(824, 900);
  after = await geometry();
  near(after.width, 800, "custom viewport cap");
  assert.ok(after.left >= 12 && after.right <= 812);
  await resize(1440, 900);
  near((await geometry()).width, 1000, "requested width restored");
  await resize(1440, 480);
  after = await geometry();
  assert.ok(
    after.top >= 12 && after.bottom <= 468,
    "height-only resize clamps y",
  );
  await resize(1440, 900);

  await click(split);
  near((await geometry()).width, 860, "split starts at preset");
  for (const width of [1000, 1100, 1000, 860, 700, 820]) {
    before = await geometry();
    after = await widthTo(width);
    near(after.width, width, "custom split width");
    fixedComposer(before, after);
  }
  before = after;
  after = await drag(left, -80);
  near(after.right, before.right, "split left handle fixed right");
  fixedComposer(before, after);
  before = after;
  after = await drag(left, 40);
  near(after.right, before.right, "split left shrink fixed right");
  fixedComposer(before, after);
  for (const [pressed, modifiers] of [
    ["ArrowRight", 0],
    ["ArrowLeft", 8],
  ]) {
    before = after;
    after = await key(right, pressed, modifiers);
    fixedComposer(before, after);
  }
  await resize(824, 900);
  after = await geometry();
  fixedComposer(after, after);
  await resize(1440, 900);
  before = await geometry();
  after = await touchResize(50);
  near(after.width, before.width + 50, "split touch resize");
  fixedComposer(before, after);
  const padding = after.width - after.content;
  for (const content of [559, 560, 561, 637, 638, 639]) {
    after = await widthTo(content + padding);
    near(after.content, content, "actual resized content width");
    assert.equal(
      after.split,
      content >= 638,
      "container threshold while resizing",
    );
    if (after.split) fixedComposer(after, after);
  }
  await widthTo(820);
  await click(stacked);
  near((await geometry()).width, 1000, "stacked custom slot restored");
  await click(split);
  near((await geometry()).width, 860, "split reentry resets custom slot");
  await click(stacked);
  await click(expand);
  near((await geometry()).width, 860, "expand clears custom slot");
  await click(shrink);
  near((await geometry()).width, 460, "shrink returns stacked preset");

  for (const width of [961, 960, 701, 700, 390, 350]) {
    await resize(width, 844);
    await key(left, "End");
    after = await geometry();
    assert.ok(
      after.left >= 12 && after.right <= width - 12 + 1 && !after.overflow,
    );
    if (width === 350)
      assert.equal(
        await evaluate(
          `document.querySelector('${right}').getAttribute('aria-disabled')`,
        ),
        "true",
      );
  }
  await evaluate("document.documentElement.dataset.theme='dark'");
  await screenshot("chat-resize-narrow-dark");
  await resize(1440, 900);
  await widthTo(600);
  near((await touchResize(50)).width, 650, "stacked touch resize");
  await call("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
  before = await geometry();
  after = await drag(right, 20);
  near(after.width, before.width + 20, "reduced-motion resize");
  await screenshot("chat-resize-custom-dark");
  await call("Emulation.setEmulatedMedia", { features: [] });
  await evaluate("document.documentElement.dataset.theme='light'");
  await preserved();

  // Explicit reopen may perform existing access/read queries; measure pure resize separately.
  const point = await pointerStart(right);
  await click('[aria-label="AI 채팅 닫기"]');
  assert.equal((await geometry()).resizing, false);
  await pointerEnd(point);
  await click(".matrix-ai-room.is-selected");
  await pause(400);
  near((await geometry()).width, 670, "close-reopen custom restore");
  await evaluate("window.aiLayoutRequests=[]");
  await preserved();
  await click(expand);
  await click(shrink);
  near((await geometry()).width, 460, "restore initial popup");
  await evaluate("delete window.aiResizePointerId");
  console.log(
    "PASS popup resizing: both mouse edges/capture, keyboard/touch, 360px minimum, viewport bounds, cancellation/blur/close, preset and mode slots, 386px fixed composer/conversation-only growth, 559/560/561 and 637/638/639px layout boundaries, custom restore and preserved draft/image/DOM without resize requests.",
  );
}
