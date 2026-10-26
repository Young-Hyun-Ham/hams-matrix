"use client";
import type { Artifact, ArtifactKind } from "@/lib/artifact-types";
import { WbsStructureEditor } from "@/components/pages/wbs/wbs-structure-editor";
import { DatabaseStructureEditor } from "@/components/pages/database/database-structure-editor";
import { ProgramStructureEditor } from "@/components/pages/specifications/program-structure-editor";
import { VerificationStructureEditor } from "@/components/pages/verification/verification-structure-editor";
import { ArchitectureStructureEditor } from "@/components/pages/architecture/architecture-structure-editor";
export type StructureEditorProps = {
  artifact: Artifact | null;
  artifacts: Artifact[];
};
export function StructureEditor({
  kind,
  ...props
}: StructureEditorProps & { kind: ArtifactKind }) {
  switch (kind) {
    case "architecture":
      return <ArchitectureStructureEditor {...props} />;
    case "wbs":
      return <WbsStructureEditor {...props} />;
    case "database":
      return <DatabaseStructureEditor {...props} />;
    case "program":
      return <ProgramStructureEditor {...props} />;
    case "test":
      return <VerificationStructureEditor />;
    default:
      return null;
  }
}
