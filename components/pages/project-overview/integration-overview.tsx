"use client";
import type { Artifact } from "@/lib/artifact-types";
import { acceptanceReport } from "@/lib/integration";
import TraceabilityNetworkPage from "./project-traceability";
export function IntegrationOverview({ artifacts }: { artifacts: Artifact[] }) {
  const report = acceptanceReport(artifacts);
  return (
    <section className="panel matrix-section">
      <TraceabilityNetworkPage />
    </section>
  );
}
