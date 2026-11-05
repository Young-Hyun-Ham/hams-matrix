import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

export async function checkPreviewCapture({
  evaluate,
  call,
  waitFor,
  screenshot,
  folder,
}) {
  await call(
    "Browser.setDownloadBehavior",
    { behavior: "allow", downloadPath: folder },
    false,
  );
  const files = () => readdir(folder);
  const download = async (action) => {
    const before = new Set(await files());
    await action();
    const file = await waitFor(
      async () =>
        (await files()).find(
          (name) =>
            !before.has(name) &&
            name.startsWith("planning-") &&
            /-(page|region)-\d+\.png$/.test(name),
        ),
      "PNG capture downloaded",
    );
    const buffer = await readFile(join(folder, file));
    assert.equal(buffer.subarray(1, 4).toString(), "PNG");
    await waitFor(
      () =>
        evaluate(
          "!document.querySelector('[aria-label=\"페이지 캡처\"]').disabled",
        ),
      "capture finishes",
    );
    return {
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
      file: join(folder, file),
    };
  };
  const dimensions = () =>
    evaluate(
      "(()=>{const page=document.querySelector('.preview-viewport .preview-page-canvas');const rect=page.getBoundingClientRect();return {width:page.offsetWidth,height:page.offsetHeight,left:rect.left,top:rect.top,displayWidth:rect.width,displayHeight:rect.height}})()",
    );
  const page = await dimensions();
  const full = await download(() =>
    evaluate("document.querySelector('[aria-label=\"페이지 캡처\"]').click()"),
  );
  assert.deepEqual(
    [full.width, full.height],
    [page.width, page.height],
    "capture contains only full page at original resolution",
  );
  const stats = await sharp(full.file).stats();
  assert.ok(
    stats.channels
      .slice(0, 3)
      .some((channel) => channel.max - channel.min > 32),
    "page PNG contains rendered content",
  );
  await evaluate(
    "document.querySelector('[aria-label=\"영역 선택 캡처\"]').click()",
  );
  await waitFor(
    () =>
      evaluate("!!document.querySelector('.preview-capture-overlay[open]')"),
    "region selection opens",
  );
  await call("Input.dispatchKeyEvent", {
    type: "rawKeyDown",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27,
  });
  await call("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27,
  });
  await waitFor(
    () =>
      evaluate(
        "!document.querySelector('.preview-capture-overlay') && location.pathname==='/planning-board/preview'",
      ),
    "Escape cancels selection without closing preview",
  );
  await call("Emulation.setDeviceMetricsOverride", {
    width: 1000,
    height: 650,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await waitFor(async () => {
    const value = await dimensions();
    return value.displayWidth < value.width * 0.95;
  }, "preview is scaled down");
  await evaluate(
    "new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))",
  );
  const scaled = await dimensions();
  const region = await download(async () => {
    await evaluate(
      "document.querySelector('[aria-label=\"영역 선택 캡처\"]').click()",
    );
    await waitFor(
      () =>
        evaluate("!!document.querySelector('.preview-capture-overlay[open]')"),
      "scaled selection opens",
    );
    const alignment = await evaluate(
      "(()=>{const page=document.querySelector('.preview-viewport .preview-page-canvas').getBoundingClientRect();const area=document.querySelector('.preview-capture-area').getBoundingClientRect();return {left:Math.abs(page.left-area.left),top:Math.abs(page.top-area.top),width:Math.abs(page.width-area.width),height:Math.abs(page.height-area.height)}})()",
    );
    assert.ok(
      Object.values(alignment).every((value) => value < 2),
      "selection overlay aligns with the scaled page",
    );
    const start = {
      x: scaled.left + scaled.displayWidth * 0.65,
      y: scaled.top + scaled.displayHeight * 0.65,
    };
    const end = {
      x: scaled.left + scaled.displayWidth * 0.25,
      y: scaled.top + scaled.displayHeight * 0.25,
    };
    await call("Input.dispatchMouseEvent", { type: "mouseMoved", ...start });
    await call("Input.dispatchMouseEvent", {
      type: "mousePressed",
      ...start,
      button: "left",
      buttons: 1,
      clickCount: 1,
    });
    await call("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      ...end,
      button: "left",
      buttons: 1,
    });
    await screenshot("planning-preview-capture-selection");
    await call("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      ...end,
      button: "left",
      buttons: 0,
      clickCount: 1,
    });
  });
  assert.ok(
    Math.abs(region.width - page.width * 0.4) <= 2,
    "region width accounts for preview scale and reverse drag",
  );
  assert.ok(
    Math.abs(region.height - page.height * 0.4) <= 2,
    "region height accounts for preview scale and reverse drag",
  );
  await evaluate(
    "Object.defineProperty(document.querySelector('.preview-viewport .preview-page-canvas'),'offsetWidth',{configurable:true,value:20000});document.querySelector('[aria-label=\"페이지 캡처\"]').click()",
  );
  await waitFor(
    () =>
      evaluate(
        "document.querySelector('.preview-capture-error')?.textContent.includes('페이지 크기') && !document.querySelector('[aria-label=\"페이지 캡처\"]').disabled",
      ),
    "capture error is visible and buttons recover",
  );
  await evaluate(
    "delete document.querySelector('.preview-viewport .preview-page-canvas').offsetWidth;document.querySelector('[aria-label=\"영역 선택 캡처\"]').click()",
  );
  await waitFor(
    () =>
      evaluate("!!document.querySelector('.preview-capture-overlay[open]')"),
    "selection available after error",
  );
  await evaluate(
    "document.querySelector('.preview-capture-instructions button').click()",
  );
  await call("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  console.log(
    `PASS preview capture: page-only PNG ${full.width}x${full.height}, scaled reverse crop ${region.width}x${region.height}, Escape/cancel, error recovery and image content`,
  );
}
