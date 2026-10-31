import { db } from "@/lib/db";
import { PreferencesRuntime } from "@/components/preferences-runtime";
import type { Preferences } from "@/stores/preferences";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { currentUser } from "@/lib/auth";
import { WorkspaceShell } from "@/components/workspace-shell";
import { WorkspaceLoading } from "@/components/workspace-loading";
import "@/styles/workspace.css";
export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<WorkspaceLoading />}>
      <AuthenticatedWorkspace>{children}</AuthenticatedWorkspace>
    </Suspense>
  );
}
async function AuthenticatedWorkspace({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.accountRole === "guest") redirect("/guest/dashboard");
  if (!user.onboardingComplete) redirect("/onboarding");
  const row = (
    await db().execute({
      sql: "SELECT toast_position,default_theme,toast_background_color,toast_font_color,accent_color,toast_close_button_color,toast_close_button_background_color,version FROM user_preferences WHERE user_id=?",
      args: [user.id],
    })
  ).rows[0];
  const initial: Preferences = {
    toastPosition: row?.toast_position === "top" ? "top" : "bottom",
    defaultTheme: row?.default_theme === "dark" ? "dark" : "light",
    toastBackgroundColor: String(row?.toast_background_color ?? "#ffffff"),
    toastFontColor: String(row?.toast_font_color ?? "#262138"),
    accentColor: row?.accent_color ? String(row.accent_color) : null,
    toastCloseButtonColor: row?.toast_close_button_color ? String(row.toast_close_button_color) : null,
    toastCloseButtonBackgroundColor: row?.toast_close_button_background_color ? String(row.toast_close_button_background_color) : null,
    version: Number(row?.version ?? 0),
  };
  return (
    <>
      <PreferencesRuntime userId={user.id} initial={initial} />
      <WorkspaceShell user={user}>{children}</WorkspaceShell>
    </>
  );
}
