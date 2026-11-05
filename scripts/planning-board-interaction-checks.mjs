import assert from "node:assert/strict";

export async function checkCanvasInteractions({
  evaluate,
  call,
  input,
  waitFor,
  screenshot,
}) {
  const click = (selector) =>
    evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const field = async (name, value) => {
    await evaluate(
      `(()=>{const e=[...document.querySelectorAll('.right-panel label.field')].find(l=>l.querySelector('span')?.textContent.trim()===${JSON.stringify(name)})?.querySelector('input');if(!e)throw new Error('Missing field');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(String(value))});e.dispatchEvent(new Event('input',{bubbles:true}));})()`,
    );
  };
  const selected = () =>
    evaluate(
      "document.querySelector('.custom-canvas-layer.canvas-node-selected')?.dataset.layerId",
    );
  const geometry = (id) =>
    evaluate(
      `(()=>{const n=document.querySelector('[data-layer-id="'+${JSON.stringify(id)}+'"]');return {x:parseFloat(n.style.left),y:parseFloat(n.style.top),width:parseFloat(n.style.width),height:parseFloat(n.style.height)}})()`,
    );
  const rect = (selector) =>
    evaluate(
      `(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()`,
    );
  const drag = async (x, y, dx, dy) => {
    await call("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
    await call("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x,
      y,
      button: "left",
      buttons: 1,
      clickCount: 1,
    });
    for (let step = 1; step <= 5; step++)
      await call("Input.dispatchMouseEvent", {
        type: "mouseMoved",
        x: x + (dx * step) / 5,
        y: y + (dy * step) / 5,
        button: "left",
        buttons: 1,
      });
    await call("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: x + dx,
      y: y + dy,
      button: "left",
      buttons: 0,
      clickCount: 1,
    });
  };
  const arrow = async (key, code, repeat = false) => {
    await call("Input.dispatchKeyEvent", {
      type: "keyDown",
      key,
      code: key,
      windowsVirtualKeyCode: code,
      autoRepeat: repeat,
    });
    if (!repeat)
      await call("Input.dispatchKeyEvent", {
        type: "keyUp",
        key,
        code: key,
        windowsVirtualKeyCode: code,
      });
  };
  const addNumber = async (number) => {
    await click('[aria-label="이모티콘 추가"]');
    await waitFor(
      () => evaluate("!!document.querySelector('.emoji-panel')"),
      "emoji panel opens",
    );
    assert.equal(
      await evaluate("document.querySelectorAll('.emoji-grid button').length"),
      30,
    );
    await click(`[aria-label="번호 ${number}"]`);
    await waitFor(
      () =>
        evaluate(
          "!document.querySelector('.emoji-panel') && !!document.querySelector('.custom-canvas-layer.canvas-node-selected')",
        ),
      "number inserted",
    );
    return selected();
  };
  const first = await addNumber(12);
  assert.deepEqual(
    await evaluate(
      `(()=>{const n=document.querySelector('[data-layer-id="${first}"]');return [n.textContent,getComputedStyle(n).backgroundColor,getComputedStyle(n).color]})()`,
    ),
    ["12", "rgb(220, 38, 38)", "rgb(255, 255, 255)"],
  );
  await field("X", 100);
  await field("Y", 100);
  await field("W", 100);
  await field("H", 80);
  await evaluate("document.querySelector('.canvas').focus()");
  await arrow("ArrowRight", 39);
  assert.equal((await geometry(first)).x, 101);
  await click('[aria-label="실행 취소"]');
  assert.equal((await geometry(first)).x, 100, "one key gesture undoes once");
  await evaluate("document.querySelector('.canvas').focus()");
  await arrow("ArrowDown", 40, true);
  await arrow("ArrowDown", 40, true);
  await call("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "ArrowDown",
    code: "ArrowDown",
    windowsVirtualKeyCode: 40,
  });
  assert.equal((await geometry(first)).y, 102);
  await click('[aria-label="실행 취소"]');
  assert.equal(
    (await geometry(first)).y,
    100,
    "repeat nudge is one history item",
  );
  for (const zoom of [50, 200, 100]) {
    await click(".zoom-control .zoom");
    await evaluate(
      `[...document.querySelectorAll('.zoom-menu button')].find(b=>b.textContent.trim()==='${zoom}%').click()`,
    );
    await evaluate("document.querySelector('.canvas').focus()");
    const before = await geometry(first);
    await arrow("ArrowRight", 39);
    assert.equal(
      (await geometry(first)).x,
      before.x + 1,
      `${zoom}% zoom still nudges 1 document pixel`,
    );
  }
  for (const [edge, dx, dy] of [
    ["e", 12, 0],
    ["w", -10, 0],
    ["n", 0, -10],
    ["s", 0, 12],
  ]) {
    const before = await geometry(first),
      r = await rect(`.resize-edge.${edge}`);
    await drag(r.x + r.width / 2, r.y + r.height / 2, dx, dy);
    const after = await geometry(first);
    if (edge === "e" || edge === "w") {
      assert.equal(after.height, before.height);
      assert.equal(after.y, before.y);
      assert.ok(after.width > before.width);
    } else {
      assert.equal(after.width, before.width);
      assert.equal(after.x, before.x);
      assert.ok(after.height > before.height);
    }
    if (edge === "w")
      assert.equal(after.x + after.width, before.x + before.width);
    if (edge === "n")
      assert.equal(after.y + after.height, before.y + before.height);
  }
  const beforeMove = await geometry(first),
    r = await rect(`[data-layer-id="${first}"]`);
  assert.equal(
    await evaluate(
      `getComputedStyle(document.querySelector('[data-layer-id="${first}"]')).cursor`,
    ),
    "move",
  );
  await drag(r.x + r.width / 2, r.y + r.height / 2, 20, 15);
  assert.equal((await geometry(first)).x, beforeMove.x + 20);
  await click('[aria-label="실행 취소"]');
  assert.deepEqual(
    await geometry(first),
    beforeMove,
    "drag is a single undo step",
  );
  const second = await addNumber(30);
  await field("X", 240);
  await field("Y", 200);
  const page = await rect(".artboard");
  await drag(page.x + 60, page.y + 60, 260, 200);
  assert.equal(
    await evaluate(
      "document.querySelectorAll('.custom-canvas-layer.canvas-node-selected').length",
    ),
    2,
    "marquee selects both elements",
  );
  await evaluate(
    "document.querySelector('.layer-row[data-layer-row-id=\"page\"] .layer-toggle').click()",
  );
  assert.equal(
    await evaluate("document.querySelectorAll('.layer-row.selected').length"),
    2,
    "tree shares the selection",
  );
  const firstStart = await geometry(first),
    secondStart = await geometry(second);
  await evaluate("document.querySelector('.canvas').focus()");
  await arrow("ArrowDown", 40);
  assert.equal((await geometry(first)).y, firstStart.y + 1);
  assert.equal((await geometry(second)).y, secondStart.y + 1);
  assert.equal(
    await evaluate(
      "document.querySelectorAll('.right-panel .property,.right-panel .selection-title,.right-panel .inspector input').length",
    ),
    0,
    "multi selection hides every design option",
  );
  assert.equal(
    await evaluate(
      "document.querySelector('.multi-selection-note').textContent.trim()",
    ),
    "2개 선택 · 옵션은 대표 요소에 적용됩니다.",
  );
  // Right-click the other element and verify the menu stores that target, not the old representative.
  const target = await rect(`[data-layer-id="${first}"]`);
  await call("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: target.x + target.width / 2,
    y: target.y + target.height / 2,
    button: "right",
    buttons: 2,
    clickCount: 1,
  });
  await call("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: target.x + target.width / 2,
    y: target.y + target.height / 2,
    button: "right",
    buttons: 0,
    clickCount: 1,
  });
  await waitFor(
    () => evaluate("!!document.querySelector('.canvas-context-menu')"),
    "right click menu",
  );
  assert.equal(await selected(), first);
  assert.equal(
    await evaluate(
      "document.querySelector('.multi-selection-menu-title').textContent.trim()",
    ),
    "2개 요소 선택",
  );
  assert.equal(
    await evaluate(
      "document.querySelectorAll('.canvas-context-menu button').length",
    ),
    1,
  );
  await click(".canvas-context-menu .canvas-delete-button");
  assert.equal(
    await evaluate(
      `Boolean(document.querySelector('[data-layer-id="${first}"]'))`,
    ),
    false,
    "menu deletion uses hit-tested target",
  );
  assert.equal(
    await evaluate(
      `Boolean(document.querySelector('[data-layer-id="${second}"]'))`,
    ),
    false,
    "multi menu deletes the complete selection",
  );
  const selectBoth = async () => {
    await click(`[data-layer-id="${first}"]`);
    await evaluate(
      `document.querySelector('[data-layer-id="${second}"]').dispatchEvent(new MouseEvent('click',{bubbles:true,shiftKey:true}))`,
    );
  };
  await click('[aria-label="실행 취소"]');
  await selectBoth();
  await evaluate("document.querySelector('.canvas').focus()");
  await call("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Delete",
    windowsVirtualKeyCode: 46,
  });
  await call("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Delete",
    windowsVirtualKeyCode: 46,
    autoRepeat: true,
  });
  await call("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Delete",
    windowsVirtualKeyCode: 46,
  });
  assert.equal(
    await evaluate("document.querySelectorAll('.custom-canvas-layer').length"),
    0,
    "Delete key removes both once",
  );
  await click('[aria-label="실행 취소"]');
  await selectBoth();
  await evaluate("document.querySelector('.layer-tree').focus()");
  await call("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Delete",
    windowsVirtualKeyCode: 46,
  });
  await call("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Delete",
    windowsVirtualKeyCode: 46,
  });
  assert.equal(
    await evaluate("document.querySelectorAll('.custom-canvas-layer').length"),
    0,
    "tree Delete uses the same batch command",
  );
  await click('[aria-label="실행 취소"]');
  await click(`[data-layer-id="${first}"]`);
  await call("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Delete",
    windowsVirtualKeyCode: 46,
  });
  await call("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Delete",
    windowsVirtualKeyCode: 46,
  });
  // Remaining number becomes editable text with newline, alignment and background.
  await evaluate(
    `document.querySelector('[data-layer-id="${second}"]').click()`,
  );
  await field("W", 180);
  await field("H", 120);
  const text = "첫째 줄\n\n셋째 줄  😀";
  await input(".content-field", text);
  await click('[aria-label="텍스트 오른쪽 정렬"]');
  await click('[aria-label="텍스트 아래 정렬"]');
  assert.deepEqual(
    await evaluate(
      `(()=>{const n=document.querySelector('[data-layer-id="${second}"] .planning-text-content');return [n.textContent,getComputedStyle(n).textAlign,getComputedStyle(n).justifyContent,getComputedStyle(n.querySelector('span')).whiteSpace]})()`,
    ),
    [text, "right", "flex-end", "pre-wrap"],
  );
  await input('[aria-label="텍스트 배경색"]', "#123456");
  assert.equal(
    await evaluate(
      `getComputedStyle(document.querySelector('[data-layer-id="${second}"]')).backgroundColor`,
    ),
    "rgb(18, 52, 86)",
  );
  await click('[aria-label="텍스트 배경 투명"]');
  assert.equal(
    await evaluate(
      `document.querySelector('[data-layer-id="${second}"]').style.backgroundColor`,
    ),
    "transparent",
  );
  await evaluate("document.querySelector('.content-field').focus()");
  const textPosition = await geometry(second);
  await arrow("ArrowLeft", 37);
  assert.deepEqual(
    await geometry(second),
    textPosition,
    "text input arrow does not move a layer",
  );
  await click('[aria-label="이모티콘 추가"]');
  await click("#emoji-tab-faces");
  assert.equal(
    await evaluate(
      "document.querySelector('#emoji-tab-faces').getAttribute('aria-selected')",
    ),
    "true",
  );
  await click('[aria-label="웃는 얼굴"]');
  assert.equal(
    await evaluate(
      "document.querySelector('.custom-canvas-layer.canvas-node-selected .planning-text-block').textContent",
    ),
    "😀",
  );
  await screenshot("planning-canvas-interactions");
  await evaluate(
    "[...document.querySelectorAll('.inspector-tabs button')].find(b=>b.textContent==='코드').click()",
  );
  await evaluate(
    "document.querySelectorAll('.code-section-toggle').forEach(b=>b.click());true",
  );
  await waitFor(
    () =>
      evaluate(
        "document.querySelector('[aria-label=\"React 생성 코드\"]')?.value.includes('셋째')",
      ),
    "multiline export captured",
  );
  const exported = await evaluate(
    `(()=>{const read=label=>document.querySelector('[aria-label="'+label+' 생성 코드"]').value;const html=new DOMParser().parseFromString(read('HTML5'),'text/html');return {html:html.querySelector('[data-layer-id="${second}"]')?.textContent,react:read('React'),astro:read('Astro'),svelte:read('Svelte'),css:read('CSS')}})()`,
  );
  assert.equal(exported.html, text);
  for (const target of ["react", "astro", "svelte"])
    assert.ok(
      exported[target].includes("\\n\\n"),
      `${target} preserves explicit line breaks`,
    );
  assert.ok(exported.css.includes("pre-wrap"));
  await evaluate(
    "[...document.querySelectorAll('.inspector-tabs button')].find(b=>b.textContent==='디자인').click()",
  );
  console.log(
    "PASS canvas interactions: nudge, repeat undo, zoom, edge resize, center move, marquee, tree sync, right click, multiline alignment/background and emoji tabs",
  );
}

export async function addPersistenceText({ evaluate, input }) {
  await evaluate(
    "document.querySelector('[aria-label=\"이모티콘 추가\"]').click()",
  );
  await evaluate("document.querySelector('#emoji-tab-numbers').click()");
  await evaluate("document.querySelector('[aria-label=\"번호 30\"]').click()");
  await input(".content-field", "Browser multiline\n\nSaved 😀");
  for (const [name, value] of [
    ["W", 200],
    ["H", 120],
  ])
    await evaluate(
      `(()=>{const e=[...document.querySelectorAll('.right-panel label.field')].find(l=>l.querySelector('span')?.textContent.trim()===${JSON.stringify(name)}).querySelector('input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(String(value))});e.dispatchEvent(new Event('input',{bubbles:true}));})()`,
    );
  await evaluate(
    "document.querySelector('[aria-label=\"텍스트 오른쪽 정렬\"]').click();document.querySelector('[aria-label=\"텍스트 아래 정렬\"]').click();true",
  );
}
