import assert from "node:assert/strict";
import { projectScenarioCanvas } from "../app/(builder)/utils/scenarioCanvas.ts";

const parent = { id: "sub", type: "scenario", position: { x: 100, y: 100 }, data: {} };
const group = {
  id: "group", type: "selectionGroup", parentNode: "sub",
  position: { x: -10, y: 20 }, data: {}, style: { width: 640, height: 260 },
};
const branch = {
  id: "branch", type: "branch", parentNode: "group",
  position: { x: 60, y: 82 }, data: {}, width: 520, height: 400,
};
const message = { id: "message", position: { x: 1000, y: 50 }, data: {} };
const edges = [
  { id: "outside", source: "sub", target: "message" },
  { id: "inside", source: "branch", target: "message" },
];
const opened = projectScenarioCanvas([branch, group, parent, message], edges);
assert.deepEqual(opened.nodes.map(node => node.id), ["sub", "group", "branch", "message"]);
assert.deepEqual(opened.edges, edges);
assert.deepEqual(opened.nodes[1].position, { x: 24, y: 86 });
assert.deepEqual(group.position, { x: -10, y: 20 });
assert.ok(opened.nodes[0].style.width >= 24 + 640);
assert.ok(opened.nodes[0].style.height >= 86 + 82 + 400);
assert.ok(projectScenarioCanvas([parent, group, { ...branch, height: 600 }], []).nodes[0].style.height > opened.nodes[0].style.height);
const closed = projectScenarioCanvas([{ ...parent, data: { isCollapsed: true } }, group, branch, message], edges);
assert.deepEqual(closed.nodes.map(node => node.id), ["sub", "message"]);
assert.equal(closed.nodes[0].style.width, 450);
assert.deepEqual(closed.edges, [edges[0]]);
assert.equal(projectScenarioCanvas([parent], []).nodes[0].data.isCollapsed, true);
console.log("Scenario canvas projection: nested bounds, resize, legacy collapse and edge visibility passed.");
