import { isThemePreset } from "@/lib/theme-presets";
import { WorkspaceQueryBoundary } from "@/components/query/workspace-query-boundary";
import { WorkspacePlanGuard } from "@/components/workspace-plan-guard";
import type { ReactNode } from "react";
import { EditorProvider } from "./stores/editor-provider";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { PreferencesRuntime } from "@/components/preferences-runtime";
import type { Preferences } from "@/stores/preferences";
import "@/styles/themes.css";
import "@/styles/shared-ui.css";
import "@/styles/project-tabs.css";
import "@/styles/dialog.css";
import "@/styles/personal-theme.css";
import "./styles/editor.css";
import "./styles/dark-theme.css";
import "./styles/select-element.css";
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="planning-root">
      <Suspense fallback={<p role="status">로그인 확인 중...</p>}>
        <AuthenticatedEditor>{children}</AuthenticatedEditor>
      </Suspense>
    </div>
  );
}

async function AuthenticatedEditor({ children }: { children: ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.accountRole === "guest") redirect("/guest/dashboard");
  if (!user.onboardingComplete) redirect("/onboarding");
  const row = (
    await db().execute({
      sql: "SELECT theme_preset,toast_position,default_theme,toast_background_color,toast_font_color,accent_color,toast_close_button_color,toast_close_button_background_color,version FROM user_preferences WHERE user_id=?",
      args: [user.id],
    })
  ).rows[0];
  const initial: Preferences = {
    toastPosition: row?.toast_position === "top" ? "top" : "bottom",
    defaultTheme: row?.default_theme === "dark" ? "dark" : "light",
    themePreset: isThemePreset(row?.theme_preset) ? row.theme_preset : "custom",
    toastBackgroundColor: String(row?.toast_background_color ?? "#ffffff"),
    toastFontColor: String(row?.toast_font_color ?? "#262138"),
    accentColor: row?.accent_color ? String(row.accent_color) : null,
    toastCloseButtonColor: row?.toast_close_button_color
      ? String(row.toast_close_button_color)
      : null,
    toastCloseButtonBackgroundColor: row?.toast_close_button_background_color
      ? String(row.toast_close_button_background_color)
      : null,
    version: Number(row?.version ?? 0),
  };
  return (
    <WorkspaceQueryBoundary user={user} preferences={initial}>
      <PreferencesRuntime userId={user.id} initial={initial} />
      <WorkspacePlanGuard user={user}>
        <EditorProvider initialUser={user}>{children}</EditorProvider>
      </WorkspacePlanGuard>
    </WorkspaceQueryBoundary>
  );
}
