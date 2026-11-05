import assert from "node:assert/strict";

export async function checkScreenListPreview({
  evaluate,
  call,
  waitFor,
  screenshot,
  getSession,
  setSession,
}) {
  const row =
    "document.querySelector('a[href=\"/planning-board?projectId=p&screenId=screen\"]').closest('tr')";
  assert.equal(
    await evaluate(
      `${row}.querySelector('.screen-planning-actions button').disabled`,
    ),
    true,
    "draft preview is disabled",
  );
  const result = await evaluate(`(async()=>{
    const base='/api/planning/projects/p/screens/screen';
    const read=await (await fetch(base+'/board')).json();
    const response=await fetch(base+'/review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'complete',message:'Completed screen list preview',expectedVersion:read.version,expectedScreenVersion:read.screenVersion})});
    if(!response.ok)throw new Error(await response.text());
    const channel=new BroadcastChannel('matrix-planning:p');channel.postMessage({type:'saved'});channel.close();
    return (await response.json()).status;
  })()`);
  assert.equal(result, "complete");
  const link = `${row}.querySelector('a[href^="/planning-board/preview?"]')`;
  await waitFor(
    () => evaluate(`!!${link}`),
    "completed screen preview enabled through list refresh",
  );
  assert.deepEqual(
    await evaluate(
      `(()=>{const link=${link};return {href:link.getAttribute('href'),target:link.target,noopener:link.rel.includes('noopener')}})()`,
    ),
    {
      href: "/planning-board/preview?projectId=p&screenId=screen",
      target: "_blank",
      noopener: true,
    },
  );
  assert.equal(
    await evaluate(
      "[...document.querySelectorAll('.screen-planning-actions')].filter(actions=>!actions.querySelector('a[href^=\"/planning-board/preview?\"]')).every(actions=>actions.querySelector('button')?.disabled)",
    ),
    true,
    "unfinished screens remain disabled",
  );
  await screenshot("planning-screen-list-completed");
  const original = getSession();
  const previous = new Set(
    (await call("Target.getTargets", {}, false)).targetInfos.map(
      (target) => target.targetId,
    ),
  );
  await call("Runtime.evaluate", {
    expression: `${link}.click()`,
    userGesture: true,
    awaitPromise: true,
  });
  const target = await waitFor(
    async () =>
      (await call("Target.getTargets", {}, false)).targetInfos.find(
        (target) =>
          !previous.has(target.targetId) &&
          target.type === "page" &&
          target.url.includes("/planning-board/preview?"),
      ),
    "screen list opens preview window",
  );
  const { sessionId } = await call(
    "Target.attachToTarget",
    { targetId: target.targetId, flatten: true },
    false,
  );
  setSession(sessionId);
  try {
    await waitFor(
      () =>
        evaluate(
          "!!document.querySelector('.preview-viewport .planning-select-multi')",
        ),
      "same planning board preview renders completed saved document",
    );
    assert.equal(
      await evaluate(
        "window.opener===null && !new URLSearchParams(location.search).has('previewNonce')",
      ),
      true,
      "completed list preview uses saved data without an editor handshake",
    );
    assert.equal(
      await evaluate(
        "!!document.querySelector('[aria-label=\"페이지 캡처\"]') && !!document.querySelector('[aria-label=\"영역 선택 캡처\"]')",
      ),
      true,
      "same preview includes capture features",
    );
    await screenshot("planning-screen-list-completed-preview");
  } finally {
    await call("Target.closeTarget", { targetId: target.targetId }, false);
    setSession(original);
  }
  console.log(
    "PASS completed screen list preview: draft disabled, actual completion refresh, scoped secure popup and shared preview/capture UI",
  );
}
