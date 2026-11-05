"use client";
import { usePlanningAccess } from "../stores/editor-provider";
import { boardScope } from "../lib/client-api";
import { ProjectPermissionsDialog } from "@/components/pages/team/project-permissions-dialog";
export function ShareDialog({
  open,
  onClose,
}: {
  open: boolean;
  projectId: string;
  onClose: () => void;
}) {
  const members = usePlanningAccess((s) => s.members);
  if (!open) return null;
  return (
    <ProjectPermissionsDialog
      projectId={boardScope().projectId}
      projectName={`프로젝트 구성원 ${members.length}명`}
      onClose={onClose}
      onChanged={() => window.dispatchEvent(new Event("focus"))}
    />
  );
}
