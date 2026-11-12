import { isThemePreset } from "@/lib/theme-presets";
import { WorkspaceQueryBoundary } from "@/components/query/workspace-query-boundary";
import { WorkspacePlanGuard } from "@/components/workspace-plan-guard";
import { Suspense, type ReactNode } from "react";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { PreferencesRuntime } from "@/components/preferences-runtime";
import type { Preferences } from "@/stores/preferences";
import "@/styles/shared-ui.css";
import "@/styles/table.css";
import "@/styles/project-tabs.css";
import "@/styles/dialog.css";
import "@/styles/personal-theme.css";
import "@/styles/project-workbench.css";
import "@/styles/database-tools.css";
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<p role="status">로그인 확인 중…</p>}>
      <AuthenticatedDatabase>{children}</AuthenticatedDatabase>
    </Suspense>
  );
}
async function AuthenticatedDatabase({ children }: { children: ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.accountRole === "guest") redirect("/guest/dashboard");
  if (!user.onboardingComplete) redirect("/onboarding");
  const row = (
    await db().execute({
      sql: "SELECT * FROM user_preferences WHERE user_id=?",
      args: [user.id],
    })
  ).rows[0];
  const initial: Preferences = {
    toastPosition: row?.toast_position === "top" ? "top" : "bottom",
    defaultTheme: row?.default_theme === "dark" ? "dark" : "light",
    themePreset: isThemePreset(row?.theme_preset) ? row.theme_preset : "custom",
    toastBackgroundColor: String(row?.toast_background_color ?? "#ffffff"),
    toastFontColor: String(row?.toast_font_color ?? "#262138"),
    toastCloseButtonColor: row?.toast_close_button_color
      ? String(row.toast_close_button_color)
      : null,
    toastCloseButtonBackgroundColor: row?.toast_close_button_background_color
      ? String(row.toast_close_button_background_color)
      : null,
    accentColor: row?.accent_color ? String(row.accent_color) : null,
    version: Number(row?.version ?? 0),
  };
  return (
    <WorkspaceQueryBoundary user={user} preferences={initial}>
      <PreferencesRuntime userId={user.id} initial={initial} />
      <WorkspacePlanGuard user={user}>{children}</WorkspacePlanGuard>
    </WorkspaceQueryBoundary>
  );
}
