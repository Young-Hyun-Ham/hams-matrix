"use client";
import { useState } from "react";
import type { ArchitectureNode, ArchitectureTopology } from "@/lib/artifact-types";
import { architectureLayers, topologyFor } from "@/lib/architecture";
import type { StructureEditorProps } from "@/components/shared/artifact-structure-editor";

export function ArchitectureStructureEditor({ artifact }: StructureEditorProps) {
  const [topology, setTopology] = useState<ArchitectureTopology>(() =>
    artifact ? topologyFor(artifact) : { nodes: [], edges: [] });
  const updateNode = (id: string, patch: Partial<ArchitectureNode>) =>
    setTopology((current) => ({ ...current, nodes: current.nodes.map((node) => node.id === id ? { ...node, ...patch } : node) }));

  return (
    <fieldset className="matrix-structure">
      <legend>아키텍처 다이어그램</legend>
      <p>구성요소를 영역별로 자동 배치합니다. 연결의 출발·도착과 통신 방식을 지정하면 화살표로 표시됩니다.</p>
      <input type="hidden" name="topology" value={JSON.stringify(topology)} />
      {topology.nodes.map((node, index) => (
        <fieldset className="matrix-column" key={node.id}>
          <legend>구성요소 {index + 1}</legend>
          <div className="matrix-field-grid">
            <label>이름 *
              <input required maxLength={100} value={node.name} onChange={(e) => updateNode(node.id, { name: e.target.value })} placeholder="예: Backend API" />
            </label>
            <label>배치 영역
              <select value={node.layer} onChange={(e) => updateNode(node.id, { layer: e.target.value as ArchitectureNode["layer"] })}>
                {architectureLayers.map((layer) => <option key={layer.id} value={layer.id}>{layer.label}</option>)}
              </select>
            </label>
            <label>모양
              <select value={node.shape} onChange={(e) => updateNode(node.id, { shape: e.target.value as ArchitectureNode["shape"] })}>
                <option value="service">서버 / 서비스 박스</option>
                <option value="database">데이터베이스 원통</option>
              </select>
            </label>
          </div>
          <label>기술 / 버전 / 설명
            <textarea maxLength={3000} rows={2} value={node.technology} onChange={(e) => updateNode(node.id, { technology: e.target.value })} placeholder="예: Python 3.12 / FastAPI 0.115" />
          </label>
          <button type="button" className="button" onClick={() => setTopology((current) => ({
            nodes: current.nodes.filter((item) => item.id !== node.id),
            edges: current.edges.filter((edge) => edge.source !== node.id && edge.target !== node.id),
          }))}>구성요소 삭제 (관련 연결 포함)</button>
        </fieldset>
      ))}
      <button type="button" className="button" disabled={topology.nodes.length >= 30} onClick={() => setTopology((current) => ({
        ...current,
        nodes: [...current.nodes, { id: crypto.randomUUID(), name: "", technology: "", layer: "backend", shape: "service" }],
      }))}>구성요소 추가 ({topology.nodes.length}/30)</button>
      {topology.edges.map((edge, index) => (
        <fieldset className="matrix-column" key={edge.id}>
          <legend>연결 {index + 1}</legend>
          <div className="matrix-field-grid">
            {(["source", "target"] as const).map((endpoint) => (
              <label key={endpoint}>{endpoint === "source" ? "출발" : "도착"} *
                <select required value={edge[endpoint]} onChange={(e) => setTopology((current) => ({ ...current, edges: current.edges.map((item) => item.id === edge.id ? { ...item, [endpoint]: e.target.value } : item) }))}>
                  <option value="">선택하세요</option>
                  {topology.nodes.filter((node) => node.id !== edge[endpoint === "source" ? "target" : "source"]).map((node) => <option key={node.id} value={node.id}>{node.name || "이름 미입력"}</option>)}
                </select>
              </label>
            ))}
            <label>통신 방식 / 설명
              <input maxLength={80} value={edge.label} placeholder="예: HTTPS / REST API" onChange={(e) => setTopology((current) => ({ ...current, edges: current.edges.map((item) => item.id === edge.id ? { ...item, label: e.target.value } : item) }))} />
            </label>
          </div>
          <button type="button" className="button" onClick={() => setTopology((current) => ({ ...current, edges: current.edges.filter((item) => item.id !== edge.id) }))}>연결 삭제</button>
        </fieldset>
      ))}
      <button type="button" className="button" disabled={topology.nodes.length < 2 || topology.edges.length >= 60} onClick={() => setTopology((current) => ({
        ...current,
        edges: [...current.edges, { id: crypto.randomUUID(), source: current.nodes[0].id, target: current.nodes[1].id, label: "" }],
      }))}>연결 추가 ({topology.edges.length}/60)</button>
    </fieldset>
  );
}
