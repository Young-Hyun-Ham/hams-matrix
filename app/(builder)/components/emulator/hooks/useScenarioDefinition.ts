// app/(content-header)/chatbot/components/emulator/hooks/useScenarioDefinition.ts
"use client";

import { useEffect, useState } from "react";

import { useBuilderRuntime as useStore } from "@/app/(builder)/providers/runtime";
import * as backendService from "@/app/(builder)/services/backendService";

import type { AnyEdge, AnyNode } from "../types";

export type ScenarioDefinitionOverride = {
  nodes: AnyNode[];
  edges: AnyEdge[];
  startNodeId?: string | null;
  deployedVersionId?: string | null;
};

export function useScenarioDefinition(
  scenarioKey: string,
  pinnedVersionId?: string | null,
  definitionOverride?: ScenarioDefinitionOverride,
) {
  const backend = useStore((s: any) => s.backend);

  const [nodes, setNodes] = useState<AnyNode[]>([]);
  const [edges, setEdges] = useState<AnyEdge[]>([]);
  const [startNodeId, setStartNodeId] = useState<string | null>(null);
  const [deployedVersionId, setDeployedVersionId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (definitionOverride) {
      setNodes(definitionOverride.nodes);
      setEdges(definitionOverride.edges);
      setStartNodeId(definitionOverride.startNodeId ?? null);
      setDeployedVersionId(definitionOverride.deployedVersionId ?? null);
      return;
    }

    let mounted = true;

    const fetchScenarioData = async () => {
      try {
        let versionId = pinnedVersionId;
        if (!versionId) {
          const scenarios: any[] = await backendService.fetchScenarios(backend);
          const scenario = (Array.isArray(scenarios) ? scenarios : []).find(
            (item) => String(item?.id ?? item?.snro_id) === String(scenarioKey),
          );
          versionId = scenario?.depn_ver_id;
        }
        const hasDeployedVersion =
          versionId !== undefined &&
          versionId !== null &&
          String(versionId).trim() !== "" &&
          String(versionId) !== "0";

        if (!hasDeployedVersion) {
          if (!mounted) return;
          setNodes([]);
          setEdges([]);
          setStartNodeId(null);
          setDeployedVersionId(null);
          return;
        }

        const data: any = await backendService.getScenarioVersion(backend, {
          scenario_id: scenarioKey,
          version_id: versionId,
        });
        if (!mounted) return;
        setNodes(Array.isArray(data?.nodes) ? data.nodes : []);
        setEdges(Array.isArray(data?.edges) ? data.edges : []);
        setStartNodeId(data?.startNodeId ?? data?.start_node_id ?? null);
        setDeployedVersionId(String(versionId));
      } catch (error) {
        console.error("Failed to load deployed scenario version:", error);
        if (!mounted) return;
        setNodes([]);
        setEdges([]);
        setStartNodeId(null);
        setDeployedVersionId(null);
      }
    };

    fetchScenarioData();

    return () => {
      mounted = false;
    };
  }, [
    backend,
    scenarioKey,
    pinnedVersionId,
    definitionOverride?.nodes,
    definitionOverride?.edges,
    definitionOverride?.startNodeId,
    definitionOverride?.deployedVersionId,
  ]);

  return { nodes, edges, startNodeId, deployedVersionId };
}
