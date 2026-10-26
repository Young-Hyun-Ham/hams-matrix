"use client";
import { useState } from "react";
import type { Artifact, ArtifactKind } from "@/lib/artifact-types";
import { WbsFields } from "./pages/wbs/wbs-fields";
import {
  ArtifactFieldInputs,
  initialArtifactFields,
} from "./shared/artifact-field-inputs";
type Props = {
  kind: ArtifactKind;
  artifact: Artifact | null;
  isExisting: boolean;
};
function StandardFields({ kind, artifact, isExisting }: Props) {
  const [fields, setFields] = useState(() =>
    initialArtifactFields(kind, artifact),
  );
  return (
    <ArtifactFieldInputs
      kind={kind}
      isExisting={isExisting}
      fields={fields}
      change={(key, value) =>
        setFields((previous) => ({ ...previous, [key]: value }))
      }
    />
  );
}
export function ArtifactFields(props: Props) {
  return props.kind === "wbs" ? (
    <WbsFields artifact={props.artifact} isExisting={props.isExisting} />
  ) : (
    <StandardFields {...props} />
  );
}
