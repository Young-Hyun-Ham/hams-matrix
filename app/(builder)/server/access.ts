import "server-only";
import { HttpError, requireUser } from "@/lib/auth";
import type { User } from "@/lib/types";

export function assertBuilderAccess(user: User) {
  if (
    !user.onboardingComplete ||
    !["master", "admin", "biz_admin", "team_admin"].includes(
      user.accountRole,
    ) ||
    !["owner", "admin"].includes(user.role)
  )
    throw new HttpError(
      403,
      "빌더는 현재 워크스페이스의 관리자만 사용할 수 있습니다.",
    );
}
export async function builderUser() {
  const user = await requireUser();
  assertBuilderAccess(user);
  return user;
}
