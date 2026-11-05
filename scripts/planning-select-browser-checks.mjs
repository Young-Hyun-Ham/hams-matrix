import assert from "node:assert/strict";

export async function checkSelectElement({
  evaluate,
  input,
  waitFor,
  call,
  screenshot,
}) {
  await evaluate(
    `document.querySelector('.layer-row').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:180,clientY:220}))`,
  );
  await waitFor(
    () =>
      evaluate(
        "[...document.querySelectorAll('.layer-add-submenu button')].some(button=>button.textContent.trim()==='Select')",
      ),
    "add select action",
  );
  await evaluate(
    "[...document.querySelectorAll('.layer-add-submenu button')].find(button=>button.textContent.trim()==='Select').click()",
  );
  await waitFor(
    () =>
      evaluate("!!document.querySelector('[aria-label=\"selectbox 종류\"]')"),
    "select component properties",
  );
  assert.equal(
    await evaluate(
      "document.querySelector('[aria-label=\"selectbox 종류\"]').value",
    ),
    "single",
  );
  assert.equal(
    await evaluate(
      "[...document.querySelectorAll('.right-panel .property')].find(p=>p.textContent.includes('컴포넌트 속성')).querySelectorAll('label.component-option').length",
    ),
    2,
  );
  await input('[aria-label="selectbox 아이템 라벨"]', "Option 1\n선택 2");
  await input('[aria-label="selectbox 종류"]', "multi", true);
  await waitFor(
    () =>
      evaluate(
        "document.querySelectorAll('.canvas-node-selected .planning-select-chip').length===2",
      ),
    "multi chips rendered",
  );
  await evaluate(
    `(()=>{const field=[...document.querySelectorAll('.right-panel label.field')].find(label=>label.querySelector('span')?.textContent==='W').querySelector('input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(field,'300');field.dispatchEvent(new Event('input',{bubbles:true}))})()`,
  );
  const rect = await evaluate(
    "(()=>{const rect=document.querySelector('.canvas-node-selected .planning-select-remove').getBoundingClientRect();return {x:rect.x+rect.width/2,y:rect.y+rect.height/2}})()",
  );
  await call("Input.dispatchMouseEvent", {
    type: "mousePressed",
    ...rect,
    button: "left",
    buttons: 1,
    clickCount: 1,
  });
  await call("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    ...rect,
    button: "left",
    buttons: 0,
    clickCount: 1,
  });
  await waitFor(
    () =>
      evaluate(
        "document.querySelectorAll('.canvas-node-selected .planning-select-chip').length===1",
      ),
    "chip remove updates document",
  );
  assert.equal(
    await evaluate(
      "document.querySelector('[aria-label=\"selectbox 아이템 라벨\"]').value",
    ),
    "선택 2",
  );
  await evaluate(
    "document.querySelector('[aria-label=\"실행 취소\"]').click()",
  );
  await waitFor(
    () =>
      evaluate(
        "document.querySelectorAll('.canvas-node-selected .planning-select-chip').length===2",
      ),
    "undo restores removed item",
  );
  await input('[aria-label="selectbox 종류"]', "single", true);
  assert.equal(
    await evaluate(
      "document.querySelector('.canvas-node-selected select').options.length",
    ),
    2,
  );
  await input('[aria-label="selectbox 종류"]', "multi", true);
  const theme = await evaluate("document.documentElement.dataset.theme");
  for (const value of ["light", "dark"]) {
    await evaluate(
      `document.documentElement.dataset.theme=${JSON.stringify(value)}`,
    );
    await screenshot(`planning-select-multi-${value}`);
  }
  await evaluate(
    `document.documentElement.dataset.theme=${JSON.stringify(theme)}`,
  );
  console.log(
    "PASS select UI: two properties, single/multi, multiline labels, real pointer chip removal and undo",
  );
}
