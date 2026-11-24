import { Suspense, type ReactNode } from "react";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import "./sample/sample-content.css";

export default function SampleLayout({ children }: { children: ReactNode }) {
  return (
    <div className="sample-screen">
      <style>{`
        body:has(.sample-screen) .tsqd-parent-container {
          display: none !important;
        }
      `}</style>
      <Suspense fallback={<p role="status">로그인 확인 중…</p>}>
        <AuthenticatedDatabase>{children}</AuthenticatedDatabase>
      </Suspense>
    </div>
  );
}
async function AuthenticatedDatabase({ children }: { children: ReactNode }) {
  const user = await currentUser();
  console.log("AuthenticatedDatabase user:", user);
  if (!user || user.accountRole !== "master") redirect("/login");
  return <>{children}</>;
}
