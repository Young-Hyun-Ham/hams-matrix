import { Suspense } from "react";
import { DatabaseToolServer } from "@/components/pages/database/database-tool-server";
export const metadata = { title: "ERD · 테이블 관계" };
export default function Page({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  return (
    <Suspense fallback={<p role="status">ERD를 불러오는 중…</p>}>
      <DatabaseToolServer params={params} mode="erd" />
    </Suspense>
  );
}
