import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import "@/styles/themes.css";
import { THEME_INIT_SCRIPT } from "@/lib/theme";

export const metadata: Metadata = {
  title: {
    default: "HAMS Matrix · 프로젝트의 모든 연결",
    template: "%s | HAMS Matrix",
  },
  description:
    "요구사항부터 산출물까지, 팀과 AI가 함께하는 프로젝트 워크스페이스",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <Suspense
          fallback={
            <div className="empty" role="status">
              워크스페이스를 불러오고 있습니다…
            </div>
          }
        >
          {children}
        </Suspense>
      </body>
    </html>
  );
}
