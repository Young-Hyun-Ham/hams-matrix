import "server-only";
import type { Client } from "@libsql/client";
import { db } from "../db";
import { HttpError } from "../auth";
import { projectPermissionAccess } from "../project-permissions";
import type { User } from "../types";
export async function ragAccess(
  user: User,
  projectId: string,
  manage = false,
  executor: Pick<Client, "execute"> = db(),
) {
  const access = await projectPermissionAccess(executor, user, projectId);
  const canManage = ["owner", "admin"].includes(access.projectRole);
  if (manage && !canManage)
    throw new HttpError(
      403,
      "프로젝트 owner/admin만 벡터화를 관리할 수 있습니다.",
    );
  return { ...access, canManage };
}
