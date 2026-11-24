"use client";

import { useTranslation } from "@/app/(builder)/hooks/useTranslation";
import { useState, useEffect, useCallback, useRef } from "react";
import { useBuilderStore } from "../../../store";
import { generateUniqueId } from "../../../utils/simulatorUtils";
// import * as scenarioCore from '@clt-chatbot/scenario-core';
import * as scenarioCore from "@/app/(builder)/core/scenario-core/src/index";

const { ChatbotEngine } = scenarioCore;

const GEMINI_API_KEY = "";

export const useChatFlow = (nodes, edges) => {
  const { t } = useTranslation();
  const [history, setHistory] = useState([]);
  const [currentId, setCurrentId] = useState(null);
  const [fixedMenu, setFixedMenu] = useState(null);
  const [isStarted, setIsStarted] = useState(false);
  const activeChainIdRef = useRef(null);
  const lastExecutedNodeRef = useRef(null);

  const engine = useRef(null);

  if (!engine.current) {
    const eng = new ChatbotEngine({ nodes, edges, version: "1.0" });
    const originalGetNextNode = eng.getNextNode.bind(eng);
    eng.getNextNode = (currentNodeId, sourceHandle = null, slots = {}) => {
      const sourceNode = eng.getNodeById(currentNodeId);
      let effectiveHandle = sourceHandle;
      if (
        sourceNode &&
        (sourceNode.type === "ynBranch" || sourceNode.data?.isSimpleYN) &&
        !effectiveHandle
      ) {
        const rawInput = sourceNode.data?.slotKey
          ? slots?.[sourceNode.data.slotKey]
          : (slots?.lastUserInput ??
            slots?.input ??
            slots?.user_input ??
            slots?.text ??
            "");
        const strInput = String(rawInput ?? "")
          .trim()
          .toUpperCase();
        const isN =
          strInput === "N" ||
          strInput === "NO" ||
          strInput === "ㄴ" ||
          strInput === "FALSE" ||
          strInput === "0";
        const replyYId = sourceNode.data?.replies?.[0]?.value || "Y";
        const replyNId = sourceNode.data?.replies?.[1]?.value || "N";
        effectiveHandle = isN ? replyNId : replyYId;
      }
      return originalGetNextNode(currentNodeId, effectiveHandle, slots);
    };
    engine.current = eng;
  }

  useEffect(() => {
    const eng = new ChatbotEngine({ nodes, edges, version: "1.0" });
    const originalGetNextNode = eng.getNextNode.bind(eng);
    eng.getNextNode = (currentNodeId, sourceHandle = null, slots = {}) => {
      const sourceNode = eng.getNodeById(currentNodeId);
      let effectiveHandle = sourceHandle;
      if (
        sourceNode &&
        (sourceNode.type === "ynBranch" || sourceNode.data?.isSimpleYN) &&
        !effectiveHandle
      ) {
        const rawInput = sourceNode.data?.slotKey
          ? slots?.[sourceNode.data.slotKey]
          : (slots?.lastUserInput ??
            slots?.input ??
            slots?.user_input ??
            slots?.text ??
            "");
        const strInput = String(rawInput ?? "")
          .trim()
          .toUpperCase();
        const isN =
          strInput === "N" ||
          strInput === "NO" ||
          strInput === "ㄴ" ||
          strInput === "FALSE" ||
          strInput === "0";
        const replyYId = sourceNode.data?.replies?.[0]?.value || "Y";
        const replyNId = sourceNode.data?.replies?.[1]?.value || "N";
        effectiveHandle = isN ? replyNId : replyYId;
      }
      return originalGetNextNode(currentNodeId, effectiveHandle, slots);
    };
    engine.current = eng;
  }, [nodes, edges]);

  const { setSlots, anchorNodeId, startNodeId } = useBuilderStore();
  const currentNode = nodes.find((n) => n.id === currentId);

  const getNodeById = useCallback(
    (nodeId) => {
      if (!nodeId) return null;
      return nodes.find((node) => node.id === nodeId) || null;
    },
    [nodes],
  );

  const findNextNodeByEdge = useCallback(
    (sourceNodeId, sourceHandle = null) => {
      let nextEdge = null;

      if (sourceHandle) {
        nextEdge = edges.find(
          (edge) =>
            edge.source === sourceNodeId && edge.sourceHandle === sourceHandle,
        );
      }

      if (!nextEdge) {
        nextEdge =
          edges.find(
            (edge) =>
              edge.source === sourceNodeId && edge.sourceHandle === "default",
          ) ||
          edges.find(
            (edge) =>
              edge.source === sourceNodeId &&
              (edge.sourceHandle == null || edge.sourceHandle === ""),
          );
      }

      return nextEdge ? getNodeById(nextEdge.target) : null;
    },
    [edges, getNodeById],
  );

  const findContainerExitNode = useCallback(
    (sourceNodeId) => {
      const sourceNode = getNodeById(sourceNodeId);
      let parentNodeId = sourceNode?.parentNode;

      while (parentNodeId) {
        const parentNode = getNodeById(parentNodeId);
        if (!parentNode) break;

        if (
          parentNode.type === "scenario" ||
          parentNode.type === "selectionGroup"
        ) {
          return findNextNodeByEdge(parentNode.id);
        }

        parentNodeId = parentNode.parentNode;
      }

      return null;
    },
    [findNextNodeByEdge, getNodeById],
  );

  const findGroupEntryNode = useCallback(
    (groupNode) => {
      if (
        groupNode?.type !== "scenario" &&
        groupNode?.type !== "selectionGroup"
      ) {
        return null;
      }

      const childNodes = nodes.filter(
        (node) => node.parentNode === groupNode.id,
      );
      if (!childNodes.length) return null;

      if (groupNode.type === "selectionGroup" && groupNode.data?.entryNodeId) {
        const explicitEntryNode = childNodes.find(
          (node) => node.id === groupNode.data.entryNodeId,
        );
        if (explicitEntryNode) return explicitEntryNode;
      }

      const childIds = new Set(childNodes.map((node) => node.id));

      return (
        childNodes.find(
          (node) =>
            !edges.some(
              (edge) => edge.target === node.id && childIds.has(edge.source),
            ),
        ) || childNodes[0]
      );
    },
    [edges, nodes],
  );

  const resolveExecutableNode = useCallback(
    (node) => {
      const entryNode = findGroupEntryNode(node);

      return entryNode || node || null;
    },
    [findGroupEntryNode],
  );

  const resolveRunTargetNodeId = useCallback(
    (targetNodeId) => {
      const targetNode = getNodeById(targetNodeId);
      const executableNode = resolveExecutableNode(targetNode);

      return executableNode?.id || targetNodeId;
    },
    [getNodeById, resolveExecutableNode],
  );

  const getNextNode = useCallback(
    (sourceNodeId, sourceHandle, updatedSlots) => {
      const sourceNode = getNodeById(sourceNodeId);
      let effectiveHandle = sourceHandle;

      if (
        sourceNode &&
        (sourceNode.type === "ynBranch" || sourceNode.data?.isSimpleYN) &&
        !effectiveHandle
      ) {
        const rawInput = sourceNode.data?.slotKey
          ? updatedSlots?.[sourceNode.data.slotKey]
          : (updatedSlots?.lastUserInput ??
            updatedSlots?.input ??
            updatedSlots?.user_input ??
            updatedSlots?.text ??
            "");
        const strInput = String(rawInput ?? "")
          .trim()
          .toUpperCase();
        const isN =
          strInput === "N" ||
          strInput === "NO" ||
          strInput === "ㄴ" ||
          strInput === "FALSE" ||
          strInput === "0";
        const replyYId = sourceNode.data?.replies?.[0]?.value || "Y";
        const replyNId = sourceNode.data?.replies?.[1]?.value || "N";
        effectiveHandle = isN ? replyNId : replyYId;
      }

      const nextNode = engine.current.getNextNode(
        sourceNodeId,
        effectiveHandle,
        updatedSlots,
        anchorNodeId,
      );

      return resolveExecutableNode(
        nextNode || findContainerExitNode(sourceNodeId),
      );
    },
    [anchorNodeId, findContainerExitNode, getNodeById, resolveExecutableNode],
  );

  const markExecutedNode = useCallback((node) => {
    if (node?.id) {
      lastExecutedNodeRef.current = node;
    }
  }, []);

  // =======================================================================
  // 20260318 - onMessage 로직을 헬퍼로 빼서 재사용
  const pushBotNode = useCallback(
    (node, updatedSlots) => {
      if (!node || node.type === "ynBranch" || node.data?.isSimpleYN) {
        return;
      }

      const interpolatedText = engine.current.interpolateMessage(
        node.data?.content || node.data?.title || "",
        updatedSlots,
      );

      const isInteractive = engine.current.isInteractiveNode(node);
      const isSystem = node.data?.isSystem === true;
      const isChaining =
        !isSystem && node.data?.chainNext === true && !isInteractive;

      const nodeDataPacket = {
        type: node.type,
        nodeId: node.id,
        data: { ...node.data, content: interpolatedText, isSystem },
      };

      if (activeChainIdRef.current && !isSystem) {
        setHistory((prev) =>
          prev.map((item) =>
            item.id === activeChainIdRef.current
              ? {
                  ...item,
                  nodeId: node.id,
                  combinedData: [...(item.combinedData || []), nodeDataPacket],
                  isChaining,
                  isCompleted: !isInteractive,
                }
              : item,
          ),
        );
      } else {
        const newId = generateUniqueId();
        setHistory((prev) => [
          ...prev,
          {
            type: "bot",
            id: newId,
            nodeId: node.id,
            combinedData: [nodeDataPacket],
            isChaining,
            isCompleted: !isInteractive,
            isSystem,
          },
        ]);

        if (isChaining) {
          activeChainIdRef.current = newId;
        }
      }

      if (!isChaining) {
        activeChainIdRef.current = null;
      }
    },
    [setHistory],
  );
  // =======================================================================

  // 시나리오 실행 코어 로직
  const runScenario = useCallback(
    async (targetNodeId, currentSlots) => {
      const resolvedTargetNodeId = resolveRunTargetNodeId(targetNodeId);
      lastExecutedNodeRef.current = null;
      // targetNodeId가 null이면 라이브러리의 종료 시퀀스가 실행됩니다.

      // 시뮬레이터 특화: 실행 전 로딩 상태가 있다면 제거
      setHistory((prev) => prev.filter((item) => item.type !== "loading"));

      const result = await engine.current.run(
        resolvedTargetNodeId,
        currentSlots,
        {
          onMessage: (node, updatedSlots) => {
            markExecutedNode(node);
            pushBotNode(node, updatedSlots);
          },
          onDelay: async (node) => {
            markExecutedNode(node);
            await new Promise((resolve) =>
              globalThis.setTimeout(resolve, node.data.duration || 1000),
            );
          },
          onApi: async (node, slots) => {
            markExecutedNode(node);
            const loadingId = generateUniqueId();
            setHistory((prev) => [...prev, { type: "loading", id: loadingId }]);

            try {
              const { isMulti, apis } = node.data;
              const processApiCall = async (apiCall) => {
                const url = engine.current.interpolateMessage(
                  apiCall.url,
                  slots,
                );
                const headers = JSON.parse(
                  engine.current.interpolateMessage(
                    apiCall.headers || "{}",
                    slots,
                  ),
                );
                const body = engine.current.interpolateMessage(
                  apiCall.body || "{}",
                  slots,
                );

                const res = await globalThis.fetch(url, {
                  method: apiCall.method,
                  headers: { "Content-Type": "application/json", ...headers },
                  body: apiCall.method !== "GET" ? body : undefined,
                });
                if (!res.ok) throw new Error(`Status ${res.status}`);
                const data = await res.json();
                return { data, mapping: apiCall.responseMapping };
              };

              const results = await Promise.all(
                isMulti
                  ? apis.map(processApiCall)
                  : [processApiCall(node.data)],
              );
              const newSlots = { ...slots };
              results.forEach((res) => {
                (res.mapping || []).forEach((m) => {
                  const val = engine.current.getDeepValue(res.data, m.path);
                  if (val !== undefined) newSlots[m.slot] = val;
                });
              });

              setSlots(newSlots);
              setHistory((prev) =>
                prev.filter((item) => item.id !== loadingId),
              );
              return { success: true, newSlots };
            } catch (error) {
              setHistory((prev) =>
                prev.filter((item) => item.id !== loadingId),
              );
              setHistory((prev) => [
                ...prev,
                {
                  type: "bot",
                  message: `API Error: ${error.message}`,
                  id: generateUniqueId(),
                },
              ]);
              return { success: false, newSlots: slots };
            }
          },
          onLlm: async (node, slots) => {
            markExecutedNode(node);
            if (!GEMINI_API_KEY) {
              setHistory((prev) => [
                ...prev,
                {
                  type: "bot",
                  message: t("LLM Error: API key not configured."),
                  id: generateUniqueId(),
                },
              ]);
              return { success: false, newSlots: slots };
            }
            const loadingId = generateUniqueId();
            setHistory((prev) => [...prev, { type: "loading", id: loadingId }]);
            let accumulatedContent = "";
            try {
              const interpolatedPrompt = engine.current.interpolateMessage(
                node.data.prompt,
                slots,
              );
              const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent?key=${GEMINI_API_KEY}&alt=sse`;
              const response = await globalThis.fetch(apiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  contents: [{ parts: [{ text: interpolatedPrompt }] }],
                }),
              });
              if (!response.ok) throw new Error(`LLM Error ${response.status}`);
              const reader = response.body
                .pipeThrough(new globalThis.TextDecoderStream())
                .getReader();
              let buffer = "";
              while (true) {
                const { value, done } = await reader.read();
                if (value) buffer += value;
                let boundaryIndex;
                while ((boundaryIndex = buffer.search(/\r?\n\r?\n/)) !== -1) {
                  const message = buffer.substring(0, boundaryIndex);
                  buffer = buffer.substring(boundaryIndex + 4);
                  if (message.startsWith("data: ")) {
                    const jsonString = message.substring(6).trim();
                    try {
                      const jsonData = JSON.parse(jsonString);
                      const chunk =
                        jsonData.candidates?.[0]?.content?.parts?.[0]?.text ||
                        "";
                      accumulatedContent += chunk;
                    } catch {
                      // ignore invalid SSE chunk
                    }
                  }
                }
                if (done) break;
              }
              const finalSlots = { ...slots };
              if (node.data.outputVar)
                finalSlots[node.data.outputVar] = accumulatedContent;
              setSlots(finalSlots);
              return { success: true, newSlots: finalSlots };
            } catch (error) {
              setHistory((prev) => [
                ...prev,
                {
                  type: "bot",
                  message: `${t("LLM Error")}: ${error.message}`,
                  id: generateUniqueId(),
                },
              ]);
              return { success: false, newSlots: slots };
            } finally {
              setHistory((prev) =>
                prev.filter((item) => item.id !== loadingId),
              );
            }
          },
          onToast: (node, slots) => {
            markExecutedNode(node);
            globalThis.alert(
              `[Toast] ${engine.current.interpolateMessage(node.data.message, slots)}`,
            );
          },
          onLink: (node, slots) => {
            markExecutedNode(node);
            const url = engine.current.interpolateMessage(
              node.data.content,
              slots,
            );
            if (url) globalThis.window?.open(url, "_blank");
          },
          onEnd: () => {
            // 종료 시 추가 로직이 필요하다면 여기에 작성 (이미 라이브러리에서 메시지를 보냅니다)
          },
        },
        { anchorNodeId: anchorNodeId },
      );

      // ================================================================
      // 20260318 - runScenario 종료 후 active 노드를 직접 렌더링 + 슬롯 동기화
      setSlots(result.slots);

      if (result.status !== "active") {
        const nextNode = lastExecutedNodeRef.current?.id
          ? getNextNode(lastExecutedNodeRef.current.id, null, result.slots)
          : null;

        if (nextNode) {
          runScenario(nextNode.id, result.slots);
          return;
        }
      }

      if (result.status === "active") {
        const node = engine.current.getNodeById(result.currentNodeId);
        const executableNode = resolveExecutableNode(node);

        if (executableNode && executableNode.id !== node?.id) {
          runScenario(executableNode.id, result.slots);
          return;
        }

        if (node?.type === "fixedmenu") {
          setFixedMenu({ nodeId: node.id, ...node.data });
          setHistory([]);
        } else if (node) {
          pushBotNode(node, result.slots);
          setFixedMenu(null);
        }

        setCurrentId(result.currentNodeId);
      } else {
        setCurrentId(null);
        setFixedMenu(null);
        activeChainIdRef.current = null;
      }
      // ================================================================

      if (result.status === "active") {
        const node = engine.current.getNodeById(result.currentNodeId);
        if (node?.type === "fixedmenu") {
          setFixedMenu({ nodeId: node.id, ...node.data });
          setHistory([]);
        }
        setCurrentId(result.currentNodeId);
      } else {
        setCurrentId(null);
      }
    },
    [
      setSlots,
      setHistory,
      setFixedMenu,
      pushBotNode,
      markExecutedNode,
      resolveRunTargetNodeId,
      resolveExecutableNode,
      getNextNode,
      nodes,
      edges,
      anchorNodeId,
    ],
  );

  const proceedToNextNode = useCallback(
    (sourceHandle, sourceNodeId, updatedSlots) => {
      if (sourceNodeId === anchorNodeId) {
        setCurrentId(null);
        return;
      }
      engine.current.interpolateMessage("");
      // console.log('before proceed', updatedSlots);
      const nextNode = getNextNode(sourceNodeId, sourceHandle, updatedSlots);
      // nextNode가 null이더라도 runScenario(null)을 호출하여 라이브러리의 종료 시퀀스를 트리거합니다.
      runScenario(nextNode?.id || null, updatedSlots);
      // console.log('nextNode', nextNode);
    },
    [runScenario, anchorNodeId, getNextNode],
  );

  const startSimulation = useCallback(() => {
    setIsStarted(true);
    let startId = startNodeId;
    if (!startId) {
      const startNode =
        nodes.find((n) => n.type === "start") ||
        nodes.find(
          (n) => !edges.some((e) => e.target === n.id) && !n.parentNode,
        );
      startId = startNode?.id;
    }
    if (startId) {
      setSlots({});
      setHistory([]);
      setFixedMenu(null);
      activeChainIdRef.current = null;
      lastExecutedNodeRef.current = null;
      runScenario(startId, {});
    } else {
      setIsStarted(false);
    }
  }, [nodes, edges, startNodeId, runScenario, setSlots]);

  useEffect(() => {
    setIsStarted(false);
    setHistory([]);
    setCurrentId(null);
    setFixedMenu(null);
  }, [nodes, edges]);

  return {
    history,
    setHistory,
    currentId,
    currentNode,
    fixedMenu,
    isStarted,
    startSimulation,
    proceedToNextNode,
  };
};
