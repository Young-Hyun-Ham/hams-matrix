import "server-only";
import { HttpError } from "../auth";
import { db } from "../db";
import { projectAccess } from "../artifacts";
import { projectPermissionAccess } from "../project-permissions";
import type { User } from "../types";
import { aiPages } from "./page-prompts";
import {
  aiTargetContext,
  isAiTargetPage,
  type AiTargetPage,
} from "../ai-target-pages";

export async function validateTarget(
  user: User,
  projectId: string,
  value: unknown,
  allowUnsupported = false,
) {
  if (
    !isAiTargetPage(value) ||
    !!projectId === (value === "dashboard" || value === "team")
  )
    throw new HttpError(400, "이 채팅방에서 사용할 수 없는 AI 대상입니다.");
  if (!projectId) {
    if (value === "team" && !user.teamSharingEnabled)
      throw new HttpError(403, "팀 공유를 사용할 수 있는 요금제가 필요합니다.");
    return {
      targetPage: value,
      context: aiTargetContext(value, "", ""),
      canWrite: false,
    };
  }
  const project = await projectAccess(db(), user, projectId);
  const access = await projectPermissionAccess(db(), user, projectId);
  const rights =
    access.permissionsByTab[
      value as Exclude<AiTargetPage, "dashboard" | "team">
    ];
  if (!rights?.READ)
    throw new HttpError(403, "선택한 AI 대상의 조회 권한이 없습니다.");
  if (value === "documents" && !allowUnsupported)
    throw new HttpError(
      400,
      "문서함은 AI 미지원 대상입니다. 다른 AI 대상을 선택해 주세요.",
    );
  return {
    targetPage: value,
    context: aiTargetContext(value, projectId, String(project.name)),
    canWrite: rights.CREATE || rights.UPDATE || rights.DELETE,
  };
}
export function targetAiPage(target: AiTargetPage) {
  if (target === "documents")
    throw new HttpError(400, "문서함은 AI 미지원 대상입니다.");
  return aiPages[target];
}
