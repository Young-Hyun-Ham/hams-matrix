import { test } from "node:test";
import assert from "node:assert/strict";
import { ChatbotEngine } from "./dist/engine/ChatbotEngine.js";

function engine(extraEdges = [], last = false) {
  return new ChatbotEngine({
    version: "1.0",
    nodes: [
      { id: "group", type: "selectionGroup", data: {} },
      { id: "api", type: "api", parentNode: "group", data: { groupOrder: 1 } },
      ...(!last
        ? [
            {
              id: "below",
              type: "message",
              parentNode: "group",
              data: { groupOrder: 2 },
            },
          ]
        : []),
      { id: "error", type: "message", data: {} },
      { id: "after", type: "message", data: {} },
    ],
    edges: [
      ...(!last
        ? [
            {
              id: "success",
              source: "api",
              sourceHandle: "onSuccess",
              target: "below",
            },
          ]
        : []),
      { id: "exit", source: "group", target: "after" },
      ...extraEdges,
    ],
  });
}

test("group API success continues below with an error edge connected", () => {
  assert.equal(
    engine([
      {
        id: "failure",
        source: "api",
        sourceHandle: "onError",
        target: "error",
      },
    ]).getNextNode("api", "onSuccess").id,
    "below",
  );
});
test("group API failure without an error edge continues below", () => {
  assert.equal(engine().getNextNode("api", "onError").id, "below");
});
test("group API failure follows its explicit error edge", () => {
  assert.equal(
    engine([
      {
        id: "failure",
        source: "api",
        sourceHandle: "onError",
        target: "error",
      },
    ]).getNextNode("api", "onError").id,
    "error",
  );
});
test("last group API exits the group for success and unconnected failure", () => {
  assert.equal(engine([], true).getNextNode("api", "onSuccess").id, "after");
  assert.equal(engine([], true).getNextNode("api", "onError").id, "after");
});
test("success never follows a lone error edge", () => {
  assert.equal(
    engine(
      [
        {
          id: "failure",
          source: "api",
          sourceHandle: "onError",
          target: "error",
        },
      ],
      true,
    ).getNextNode("api", "onSuccess").id,
    "after",
  );
});

test("failure can explicitly target another child in the same group", () => {
  const flow = engine([
    {
      id: "failure",
      source: "api",
      sourceHandle: "onError",
      target: "recovery",
    },
  ]);
  flow.scenario.nodes.push({
    id: "recovery",
    type: "message",
    parentNode: "group",
    data: { groupOrder: 3 },
  });
  assert.equal(flow.getNextNode("api", "onError").id, "recovery");
  assert.equal(flow.getNextNode("api", "onSuccess").id, "below");
});
test("last group API completes when the group has no continuation", () => {
  const flow = engine([], true);
  flow.scenario.edges = [];
  assert.equal(flow.getNextNode("api", "onError"), null);
  assert.equal(flow.getNextNode("api", "onSuccess"), null);
});
