import "server-only";
import { db } from "@/lib/db";
import type { Row, Transaction } from "@libsql/client";
import type { User } from "@/lib/types";
import { requireWriter, userInWorkspace, HttpError } from "@/lib/auth";
import { workspacePlan } from "@/lib/plans";
import { assertBuilderAccess } from "@/app/(builder)/server/access";
import {
  validateGraph,
  first,
  next,
  condition,
  inputValues,
  interpolate,
  safeKey,
  pathValue,
} from "@/app/(builder)/server/chatbot-graph";
import type { Graph, Run } from "./types";
import {
  currentActor,
  fail,
  future,
  hash,
  now,
  number,
  object,
  ownerArgs,
  owned,
  requestKey,
  seal,
  text,
  transaction,
  unseal,
  uuid,
} from "./server";
import { activeGuardrailPolicy } from "@/lib/ai/guardrail-policy";
import { inspect, PolicyPaused, auditApproval } from "./policy";
import { callModel, models, type ModelResult } from "./providers";
import { connector, connectorURL, ConnectorHTTPError } from "./connector";
import { finishRequest } from "./generation";
import { reviewDTO } from "./repository";
type State = {
  nodeId: string | null;
  slots: Record<string, unknown>;
  visits: number;
  nodeAttempt: number;
};
export async function runAccess(
  u: User,
  id: string,
  tx = db() as Pick<Transaction, "execute">,
) {
  const r = await owned("chatbot_scenario_runs", u, id, tx);
  if (r.source === "builder-simulation")
    assertBuilderAccess(await currentActor(u, tx));
  else if (r.conversation_id)
    await owned("chatbot_conversations", u, String(r.conversation_id), tx);
  return r;
}
export async function listRuns(u: User, source: string, scenarioId = "") {
  if (!["builder-simulation", "chatbot"].includes(source))
    fail(400, "실행 출처를 확인해 주세요.");
  if (source === "builder-simulation") assertBuilderAccess(u);
  return {
    runs: (
      await db().execute({
        sql: "SELECT id,scenario_title AS title,status,version,created_at AS createdAt FROM chatbot_scenario_runs WHERE workspace_id=? AND user_id=? AND source=? AND (?='' OR scenario_id=?) ORDER BY created_at DESC,id DESC LIMIT 100",
        args: [...ownerArgs(u), source, scenarioId, scenarioId],
      })
    ).rows.map((r) => ({ ...r })),
  };
}
export async function availableScenarios(u: User) {
  return {
    scenarios: (
      await db().execute({
        sql: "SELECT id,name FROM builder_scenarios WHERE workspace_id=? AND deleted_at IS NULL AND deployed_version IS NOT NULL ORDER BY name LIMIT 100",
        args: [u.workspaceId],
      })
    ).rows.map((r) => ({ ...r })),
  };
}
export async function createRun(u: User, raw: unknown) {
  const b = object(raw),
    source = text(b.source, 30),
    key = requestKey(b.clientRequestId),
    payloadHash = hash(b);
  if (!["builder-simulation", "chatbot"].includes(source))
    fail(400, "실행 출처를 확인해 주세요.");
  if (source === "builder-simulation") assertBuilderAccess(u);
  let graph: Graph,
    scenarioId: string | null = null,
    title = String(b.title || "시나리오 미리보기").slice(0, 200),
    versionRef: string | null = null;
  if (b.scenarioId) {
    scenarioId = text(b.scenarioId, 150);
    const s = (
      await db().execute({
        sql: "SELECT * FROM builder_scenarios WHERE workspace_id=? AND id=? AND deleted_at IS NULL",
        args: [u.workspaceId, scenarioId],
      })
    ).rows[0];
    if (!s) fail(404, "시나리오를 찾을 수 없습니다.");
    title = String(s.name);
    if (source === "chatbot") {
      if (!s.deployed_version)
        fail(403, "배포된 시나리오만 실행할 수 있습니다.");
      const v = (
        await db().execute({
          sql: "SELECT snapshot_json FROM builder_scenario_versions WHERE workspace_id=? AND scenario_id=? AND version_number=?",
          args: [u.workspaceId, scenarioId, s.deployed_version],
        })
      ).rows[0];
      if (!v) fail(404, "배포 버전을 찾을 수 없습니다.");
      graph = validateGraph(JSON.parse(String(v.snapshot_json)));
      versionRef = String(s.deployed_version);
    } else
      graph = validateGraph(
        b.definition ?? JSON.parse(String(s.definition_json)),
      );
  } else {
    if (source !== "builder-simulation") fail(400, "시나리오를 선택해 주세요.");
    graph = validateGraph(b.definition);
  }
  const conversationId =
    source === "chatbot" ? text(b.conversationId, 150) : null;
  return transaction(async (tx) => {
    if (conversationId)
      await owned("chatbot_conversations", u, conversationId, tx);
    const existing = (
      await tx.execute({
        sql: "SELECT id,create_payload_hash FROM chatbot_scenario_runs WHERE workspace_id=? AND user_id=? AND create_request_id=?",
        args: [...ownerArgs(u), key],
      })
    ).rows[0];
    if (existing) {
      if (existing.create_payload_hash !== payloadHash)
        fail(409, "다른 요청에 사용된 실행 ID입니다.");
      return { id: String(existing.id) };
    }
    const id = uuid(),
      start = first(graph),
      state: State = {
        nodeId: start?.id ?? null,
        slots: {},
        visits: 0,
        nodeAttempt: 0,
      };
    await tx.execute({
      sql: "INSERT INTO chatbot_scenario_runs(id,workspace_id,user_id,source,conversation_id,scenario_id,scenario_title,create_request_id,create_payload_hash,definition_hash,snapshot_ciphertext,version_ref,status,current_node_id,checkpoint_ciphertext,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'queued',?,?,?,?)",
      args: [
        id,
        ...ownerArgs(u),
        source,
        conversationId,
        scenarioId,
        title,
        key,
        payloadHash,
        hash(graph),
        seal(u, `${id}:graph`, graph),
        versionRef,
        state.nodeId,
        seal(u, id, state),
        now(),
        now(),
      ],
    });
    await appendRunEvent(tx, u, id, "started", "", {
      text: "시나리오 실행을 시작합니다.",
    });
    return { id };
  });
}
export async function appendRunEvent(
  tx: Pick<Transaction, "execute">,
  u: User,
  id: string,
  type: string,
  nodeId: string,
  payload: unknown,
  attempt = 0,
) {
  const run = await owned("chatbot_scenario_runs", u, id, tx),
    eid = uuid();
  await tx.execute({
    sql: "INSERT INTO chatbot_scenario_run_events(id,workspace_id,user_id,run_id,seq,node_id,node_attempt,event_type,payload_ciphertext,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
    args: [
      eid,
      ...ownerArgs(u),
      id,
      run.next_seq,
      nodeId,
      attempt,
      type,
      seal(u, eid, payload),
      now(),
    ],
  });
  await tx.execute({
    sql: "UPDATE chatbot_scenario_runs SET next_seq=next_seq+1 WHERE id=?",
    args: [id],
  });
}
export async function getRun(u: User, id: string, after = 0): Promise<Run> {
  if (!Number.isSafeInteger(after) || after < 0)
    fail(400, "실행 이력 커서를 확인해 주세요.");
  const r = await runAccess(u, id),
    graph = unseal<Graph>(u, `${id}:graph`, r.snapshot_ciphertext),
    state = unseal<State>(u, id, r.checkpoint_ciphertext);
  const eventRows = (
    await db().execute({
      sql: "SELECT * FROM chatbot_scenario_run_events WHERE run_id=? AND seq>? ORDER BY seq LIMIT 501",
      args: [id, after],
    })
  ).rows;
  const events = eventRows.slice(0, 500).map((e) => ({
    seq: Number(e.seq),
    type: String(e.event_type),
    nodeId: String(e.node_id ?? ""),
    ...unseal<{ text?: string }>(u, String(e.id), e.payload_ciphertext),
  }));
  const req = (
    await db().execute({
      sql: "SELECT id FROM chatbot_requests WHERE run_id=? AND status IN ('waiting_review','waiting_policy_approval') ORDER BY created_at DESC LIMIT 1",
      args: [id],
    })
  ).rows[0];
  if (req) {
    const review = (
      await db().execute({
        sql: "SELECT * FROM chatbot_reviews WHERE request_id=? AND status='pending'",
        args: [req.id],
      })
    ).rows[0];
    const approval = (
      await db().execute({
        sql: "SELECT a.*,e.rule_codes_json FROM chatbot_policy_approvals a JOIN chatbot_policy_events e ON e.id=a.event_id WHERE a.request_id=? ORDER BY a.created_at DESC LIMIT 1",
        args: [req.id],
      })
    ).rows[0];
    events.push({
      seq: Number(r.next_seq),
      type: "approval",
      nodeId: state.nodeId ?? "",
      ...(review ? { review: reviewDTO(u, review) } : {}),
      ...(approval
        ? {
            approval: {
              id: String(approval.id),
              status: String(approval.status),
              version: Number(approval.version),
              requestId: String(req.id),
              rules: JSON.parse(String(approval.rule_codes_json)).map(
                (v: { rule: string }) => v.rule,
              ),
            },
          }
        : {}),
    });
  }
  return {
    id,
    title: String(r.scenario_title),
    status: String(r.status),
    version: Number(r.version),
    currentNode: (() => {
      const node = graph.nodes.find((n) => n.id === state.nodeId);
      return node
        ? {
            ...node,
            data: {
              ...node.data,
              resolvedUrl: interpolate(
                node.type === "link" ? node.data.content : node.data.url,
                state.slots,
              ),
            },
          }
        : null;
    })(),
    slots: state.slots,
    events,
    nextCursor: eventRows.length > 500 ? Number(eventRows[499].seq) : null,
    errorCode: r.error_code ? String(r.error_code) : undefined,
  };
}
export async function submitInput(u: User, id: string, raw: unknown) {
  const b = object(raw),
    key = requestKey(b.clientRequestId),
    payloadHash = hash({ id, ...b });
  await transaction(async (tx) => {
    const r = await runAccess(u, id, tx),
      existing = (
        await tx.execute({
          sql: "SELECT id,payload_hash FROM chatbot_requests WHERE workspace_id=? AND user_id=? AND operation='scenario-input' AND client_request_id=?",
          args: [...ownerArgs(u), key],
        })
      ).rows[0];
    if (existing) {
      if (existing.payload_hash !== payloadHash)
        fail(409, "입력 요청 ID가 충돌했습니다.");
      return;
    }
    if (
      r.status !== "waiting_input" ||
      Number(r.version) !== number(b.expectedRunVersion) ||
      r.current_node_id !== b.nodeId
    )
      fail(409, "현재 입력 단계가 변경되었습니다.");
    const g = unseal<Graph>(u, `${id}:graph`, r.snapshot_ciphertext),
      state = unseal<State>(u, id, r.checkpoint_ciphertext),
      node = g.nodes.find((n) => n.id === state.nodeId)!;
    let handle: string | undefined,
      display = "입력을 제출했습니다.";
    if (node.type === "form") {
      const values = inputValues(node, b.values, state.slots);
      Object.assign(state.slots, values);
      const group = String(node.data.slotKey || "");
      if (group && safeKey(group)) state.slots[group] = values;
    } else {
      const value = text(b.value, 12000, 0),
        replies = Array.isArray(node.data.replies)
          ? node.data.replies.map(object)
          : [];
      if (
        replies.length &&
        !replies.some((reply) => String(reply.value) === value)
      )
        fail(400, "현재 선택지에서 선택해 주세요.");
      handle = replies.length ? value : undefined;
      display =
        (replies.find((v) => String(v.value) === value)?.display as string) ||
        value;
      const slot = String(node.data.slot || "");
      if (slot) {
        if (!safeKey(slot)) fail(400, "slot 이름이 올바르지 않습니다.");
        state.slots[slot] = value;
      }
    }
    state.nodeId = next(g, node.id, handle)?.id ?? null;
    state.visits++;
    state.nodeAttempt++;
    const rid = uuid();
    await tx.execute({
      sql: "INSERT INTO chatbot_requests(id,workspace_id,user_id,run_id,logical_request_id,operation,client_request_id,payload_hash,mode,model_id,status,input_ciphertext,created_at) VALUES (?,?,?,?,?,'scenario-input',?,?,'scenario','','completed',?,?)",
      args: [
        rid,
        ...ownerArgs(u),
        id,
        rid,
        key,
        payloadHash,
        seal(u, rid, b),
        now(),
      ],
    });
    await appendRunEvent(
      tx,
      u,
      id,
      "user",
      node.id,
      { text: display },
      state.nodeAttempt,
    );
    await tx.execute({
      sql: "UPDATE chatbot_scenario_runs SET status='queued',current_node_id=?,checkpoint_ciphertext=?,version=version+1,updated_at=? WHERE id=?",
      args: [state.nodeId, seal(u, id, state), now(), id],
    });
  });
  return getRun(u, id);
}
export async function stopRun(u: User, id: string) {
  await runAccess(u, id);
  await transaction(async (tx) => {
    const r = await owned("chatbot_scenario_runs", u, id, tx);
    if (
      ["completed", "failed", "cancelled", "unknown", "interrupted"].includes(
        String(r.status),
      )
    )
      return;
    await tx.execute({
      sql: "UPDATE chatbot_scenario_runs SET status='cancelled',version=version+1,finished_at=?,lease_until=NULL WHERE id=?",
      args: [now(), id],
    });
    await tx.execute({
      sql: "UPDATE chatbot_requests SET stop_requested=1,status=CASE WHEN status='running' THEN status ELSE 'cancelled' END WHERE run_id=? AND status NOT IN ('completed','failed','cancelled','unknown')",
      args: [id],
    });
    for (const table of ["chatbot_reviews", "chatbot_policy_approvals"]) {
      const records = (
        await tx.execute({
          sql:
            "SELECT a.* FROM " +
            table +
            " a JOIN chatbot_requests r ON r.id=a.request_id WHERE r.run_id=? AND a.status IN ('pending','awaiting_choice','approved')",
          args: [id],
        })
      ).rows;
      for (const record of records) {
        await tx.execute({
          sql: "UPDATE " + table + " SET status=?,version=version+1 WHERE id=?",
          args: [
            table === "chatbot_reviews" ? "rejected" : "cancelled",
            record.id,
          ],
        });
        await auditApproval(
          tx,
          u,
          record,
          table === "chatbot_reviews" ? "review" : "policy_approval",
          "cancelled",
        );
      }
    }
    await appendRunEvent(tx, u, id, "cancelled", "", {
      text: "시나리오 실행을 중단했습니다.",
    });
  });
  return { stopped: true };
}
async function nodeRequest(
  u: User,
  run: Row,
  state: State,
  nodeId: string,
  input: unknown,
) {
  const key = `${run.id}:${state.visits}:${nodeId}`,
    current = (
      await db().execute({
        sql: "SELECT * FROM chatbot_requests WHERE run_id=? AND client_request_id=?",
        args: [run.id, key],
      })
    ).rows[0];
  if (current) return current;
  const id = uuid(),
    policy = await activeGuardrailPolicy(u.workspaceId);
  await db().execute({
    sql: "INSERT INTO chatbot_requests(id,workspace_id,user_id,run_id,logical_request_id,operation,client_request_id,payload_hash,mode,model_id,status,input_ciphertext,policy_version,created_at) VALUES (?,?,?,?,?,'scenario-node',?,?,'scenario','','running',?,?,?)",
    args: [
      id,
      ...ownerArgs(u),
      run.id,
      id,
      key,
      hash(input),
      seal(u, id, input),
      policy.version,
      now(),
    ],
  });
  return owned("chatbot_requests", u, id);
}
export async function executeRun(id: string) {
  const row = (
    await db().execute({
      sql: "SELECT * FROM chatbot_scenario_runs WHERE id=?",
      args: [id],
    })
  ).rows[0];
  if (!row) return;
  const u = await userInWorkspace(
    String(row.user_id),
    String(row.workspace_id),
  );
  if (!u) return;
  const signal = AbortSignal.timeout(240000);
  try {
    await runAccess(u, id);
    await workspacePlan(u.id, u.workspaceId);
    const graph = unseal<Graph>(u, `${id}:graph`, row.snapshot_ciphertext),
      state = unseal<State>(u, id, row.checkpoint_ciphertext);
    if (hash(graph) !== row.definition_hash)
      fail(409, "실행 정의가 변경되었습니다.");
    while (state.nodeId) {
      const current = await runAccess(u, id);
      if (current.status === "cancelled" || signal.aborted) return;
      if (
        state.visits >= 500 ||
        Date.now() - Date.parse(String(row.created_at)) > 3600000
      )
        fail(422, "시나리오 실행 한도를 초과했습니다.");
      const node = graph.nodes.find((n) => n.id === state.nodeId);
      if (!node) fail(400, "실행 노드가 없습니다.");
      const data = node.data;
      let handle: string | undefined;
      const wait =
        ["form", "slotfilling", "fixedmenu", "link", "iframe"].includes(
          node.type,
        ) ||
        (node.type === "branch" && data.evaluationType !== "CONDITION");
      if (wait) {
        if (node.type === "iframe")
          connectorURL(interpolate(data.url, state.slots));
        await transaction(async (tx) => {
          await appendRunEvent(
            tx,
            u,
            id,
            "message",
            node.id,
            {
              text: interpolate(
                data.content || data.title || "입력해 주세요.",
                state.slots,
              ),
            },
            state.nodeAttempt,
          );
          await tx.execute({
            sql: "UPDATE chatbot_scenario_runs SET status='waiting_input',current_node_id=?,checkpoint_ciphertext=?,lease_until=NULL,version=version+1 WHERE id=? AND status='running'",
            args: [node.id, seal(u, id, state), id],
          });
        });
        return;
      }
      if (["message", "toast"].includes(node.type))
        await transaction((tx) =>
          appendRunEvent(
            tx,
            u,
            id,
            "message",
            node.id,
            { text: interpolate(data.content, state.slots) },
            state.nodeAttempt,
          ),
        );
      if (node.type === "branch") handle = condition(node, state.slots);
      if (node.type === "end") state.nodeId = null;
      if (node.type === "setSlot")
        for (const rawAssignment of Array.isArray(data.assignments)
          ? data.assignments
          : []) {
          const a = object(rawAssignment),
            key = String(a.slot || a.key || "");
          if (!key || !safeKey(key)) fail(400, "slot 설정을 확인해 주세요.");
          state.slots[key] =
            a.from === "slot" || a.from === "form"
              ? state.slots[String(a.key)]
              : (a.value ?? "");
        }
      if (node.type === "delay") {
        const ms = Number(data.duration ?? 1000);
        if (!Number.isFinite(ms) || ms < 0 || ms > 30000)
          fail(400, "delay는 0~30000ms입니다.");
        await new Promise((resolve) => setTimeout(resolve, ms));
      }
      if (["api", "llm"].includes(node.type)) {
        const request = await nodeRequest(u, current, state, node.id, {
          node,
          slots: state.slots,
        });
        if (request.status === "cancelled" || request.stop_requested) return;
        await db().execute({
          sql: "UPDATE chatbot_requests SET status='running' WHERE id=?",
          args: [request.id],
        });
        const cached = request.result_ciphertext
          ? unseal<{ value: unknown; knownFailure?: boolean }>(
              u,
              String(request.id),
              request.result_ciphertext,
            )
          : undefined;
        let result = cached?.value,
          knownFailure = cached?.knownFailure === true;
        if (result === undefined) {
          if (node.type === "api") {
            requireWriter(await currentActor(u));
            const url = interpolate(data.url, state.slots),
              method = String(data.method || "GET").toUpperCase(),
              body = data.body
                ? interpolate(data.body, state.slots)
                : undefined;
            connectorURL(url);
            if (
              !["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"].includes(
                method,
              )
            )
              fail(400, "API 메서드를 확인해 주세요.");
            const approved = (
              await db().execute({
                sql: "SELECT * FROM chatbot_reviews WHERE request_id=? AND status='approved'",
                args: [request.id],
              })
            ).rows[0];
            if (!approved) {
              const reviewId = uuid(),
                payload = {
                  summary: `${method} ${new URL(url).origin}${new URL(url).pathname} 실행`,
                  url,
                  method,
                  body,
                  nodeId: node.id,
                  connectorHash: hash(
                    process.env.CHATBOT_CONNECTOR_HEADERS || "",
                  ),
                };
              await transaction(async (tx) => {
                const run = await owned("chatbot_scenario_runs", u, id, tx);
                await tx.execute({
                  sql: "INSERT INTO chatbot_reviews(id,workspace_id,user_id,request_id,kind,status,payload_ciphertext,payload_hash,source_hash,policy_version,expires_at,created_at) VALUES (?,?,?,?,'scenario-api','pending',?,?,?,?,?,?)",
                  args: [
                    reviewId,
                    ...ownerArgs(u),
                    request.id,
                    seal(u, reviewId, payload),
                    hash(payload),
                    hash(String(run.checkpoint_ciphertext)),
                    request.policy_version,
                    future(),
                    now(),
                  ],
                });
                await tx.execute({
                  sql: "UPDATE chatbot_requests SET status='waiting_review' WHERE id=?",
                  args: [request.id],
                });
                await tx.execute({
                  sql: "UPDATE chatbot_scenario_runs SET status='waiting_review',lease_until=NULL WHERE id=?",
                  args: [id],
                });
                await appendRunEvent(tx, u, id, "waiting_review", node.id, {
                  text: "API 실행 승인을 기다립니다.",
                });
              });
              return;
            }
            const approvedPayload = unseal<{ connectorHash: string }>(
              u,
              String(approved.id),
              approved.payload_ciphertext,
            );
            if (
              approvedPayload.connectorHash !==
              hash(process.env.CHATBOT_CONNECTOR_HEADERS || "")
            )
              fail(409, "서버 커넥터 인증 설정이 변경되었습니다.");
            await inspect(
              u,
              request,
              "tool",
              `${method} ${url}\n${body ?? ""}`,
              [],
              signal,
            );
            // An external side effect is never automatically retried after an uncertain failure.
            try {
              result = await connector(url, method, body, signal);
            } catch (e) {
              if (!(e instanceof ConnectorHTTPError)) throw e;
              knownFailure = true;
              result = { error: "API_HTTP_ERROR" };
            }
          } else {
            const modelId = String(
                data.model || (await models("chat")).defaultModel,
              ),
              prompt = interpolate(data.prompt || data.content, state.slots);
            await inspect(u, request, "input", prompt, [], signal);
            const generated = await callModel(
              u,
              String(request.id),
              { mode: "chat", modelId, prompt },
              signal,
              "scenario",
            );
            result = generated;
          }
          await db().execute({
            sql: "UPDATE chatbot_requests SET result_ciphertext=? WHERE id=?",
            args: [
              seal(u, String(request.id), { value: result, knownFailure }),
              request.id,
            ],
          });
        }
        await inspect(
          u,
          request,
          "tool-result",
          JSON.stringify(result),
          [],
          signal,
        );
        if (!knownFailure && node.type === "llm") {
          const response = result as ModelResult;
          await transaction((tx) =>
            appendRunEvent(
              tx,
              u,
              id,
              "message",
              node.id,
              { text: response.text },
              state.nodeAttempt,
            ),
          );
          if (data.slot && safeKey(String(data.slot)))
            state.slots[String(data.slot)] = response.text;
        } else if (!knownFailure)
          for (const rawMapping of Array.isArray(data.responseMapping)
            ? data.responseMapping
            : []) {
            const m = object(rawMapping),
              slot = String(m.slot ?? "");
            if (safeKey(slot) && slot)
              state.slots[slot] = pathValue(result, String(m.path || ""));
          }
        if (knownFailure)
          await transaction((tx) =>
            appendRunEvent(
              tx,
              u,
              id,
              "node_error",
              node.id,
              { text: "외부 API가 실패 응답을 반환했습니다." },
              state.nodeAttempt,
            ),
          );
        await finishRequest(u, request, knownFailure ? "failed" : "completed");
        await db().execute({
          sql: "UPDATE chatbot_reviews SET status=? WHERE request_id=? AND status='approved'",
          args: [knownFailure ? "invalidated" : "applied", request.id],
        });
        handle = knownFailure ? "onError" : "onSuccess";
        if (
          knownFailure &&
          !node.parentNode &&
          !graph.edges.some(
            (e) =>
              e.source === node.id &&
              ["onError", "onFail", "default"].includes(e.sourceHandle || ""),
          )
        )
          fail(502, "API 실패 분기가 없습니다.");
      }
      if (state.nodeId) state.nodeId = next(graph, node.id, handle)?.id ?? null;
      state.visits++;
      state.nodeAttempt++;
      await transaction(async (tx) => {
        const live = await owned("chatbot_scenario_runs", u, id, tx);
        if (live.status !== "running") fail(409, "실행이 중단되었습니다.");
        await appendRunEvent(
          tx,
          u,
          id,
          "node_completed",
          node.id,
          {},
          state.nodeAttempt,
        );
        await tx.execute({
          sql: "UPDATE chatbot_scenario_runs SET current_node_id=?,checkpoint_ciphertext=?,version=version+1,updated_at=? WHERE id=?",
          args: [state.nodeId, seal(u, id, state), now(), id],
        });
      });
    }
    await transaction(async (tx) => {
      await appendRunEvent(tx, u, id, "completed", "", {
        text: "시나리오 실행을 완료했습니다.",
      });
      await tx.execute({
        sql: "UPDATE chatbot_scenario_runs SET status='completed',lease_until=NULL,finished_at=?,version=version+1 WHERE id=? AND status='running'",
        args: [now(), id],
      });
    });
  } catch (e) {
    if (e instanceof PolicyPaused) return;
    const status = e instanceof HttpError ? "failed" : "unknown";
    await transaction(async (tx) => {
      const current = await owned("chatbot_scenario_runs", u, id, tx);
      if (current.status === "cancelled") return;
      await appendRunEvent(
        tx,
        u,
        id,
        status,
        String(current.current_node_id ?? ""),
        {
          text: "실행을 완료하지 못했습니다. 자동 재실행하지 않습니다.",
        },
      );
      await tx.execute({
        sql: "UPDATE chatbot_scenario_runs SET status=?,lease_until=NULL,error_code=?,finished_at=?,version=version+1 WHERE id=?",
        args: [
          status,
          e instanceof HttpError ? `HTTP_${e.status}` : "EXECUTION_UNKNOWN",
          now(),
          id,
        ],
      });
      await tx.execute({
        sql: "UPDATE chatbot_requests SET status=?,lease_until=NULL WHERE run_id=? AND status='running'",
        args: [status === "unknown" ? "unknown" : "failed", id],
      });
    });
  }
}
