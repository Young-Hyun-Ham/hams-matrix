import { ChatbotHost } from "@/components/chatbot/chatbot-host";
// app/(siderbar-header)/admin/builder/layout.tsx

import type { ReactNode } from "react";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isThemePreset } from "@/lib/theme-presets";
import type { Preferences } from "@/stores/preferences";
const defaults: Preferences = {
  toastPosition: "bottom",
  defaultTheme: "light",
  themePreset: "custom",
  toastBackgroundColor: "#ffffff",
  toastFontColor: "#262138",
  toastCloseButtonColor: null,
  toastCloseButtonBackgroundColor: null,
  accentColor: null,
  version: 0,
};
import { WorkspaceQueryBoundary } from "@/components/query/workspace-query-boundary";
import { PreferencesRuntime } from "@/components/preferences-runtime";
import { assertBuilderAccess } from "./server/access";
import BuilderRuntime from "./providers/runtime";
import "./styles/builder.css";

export const metadata = {
  title: "BUILDER",
  description: "builder 화면",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<p role="status">로그인 확인 중…</p>}>
      <AuthenticatedBuilder>{children}</AuthenticatedBuilder>
    </Suspense>
  );
}
async function AuthenticatedBuilder({ children }: { children: ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.accountRole === "guest") redirect("/guest/dashboard");
  if (!user.onboardingComplete) redirect("/onboarding");
  try {
    assertBuilderAccess(user);
  } catch {
    return (
      <p role="alert">
        빌더는 현재 워크스페이스의 관리자만 사용할 수 있습니다.
      </p>
    );
  }
  const row = (
    await db().execute({
      sql: "SELECT * FROM user_preferences WHERE user_id=?",
      args: [user.id],
    })
  ).rows[0];
  const initial: Preferences = {
    ...defaults,
    defaultTheme: row?.default_theme === "dark" ? "dark" : "light",
    themePreset: isThemePreset(row?.theme_preset) ? row.theme_preset : "custom",
    accentColor: row?.accent_color ? String(row.accent_color) : null,
    toastPosition: row?.toast_position === "top" ? "top" : "bottom",
    toastBackgroundColor: String(
      row?.toast_background_color ?? defaults.toastBackgroundColor,
    ),
    toastFontColor: String(row?.toast_font_color ?? defaults.toastFontColor),
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
      <ChatbotHost user={user}>
        <BuilderRuntime key={`${user.id}:${user.workspaceId}`} user={user}>
          {children}
        </BuilderRuntime>
      </ChatbotHost>
    </WorkspaceQueryBoundary>
  );
}
