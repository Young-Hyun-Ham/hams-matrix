import { Suspense } from "react";
import { DatabaseToolServer } from "@/components/pages/database/database-tool-server";
export const metadata = { title: "도메인 메타 관리" };
export default function Page({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  return (
    <Suspense fallback={<p role="status">도메인 메타를 불러오는 중…</p>}>
      <DatabaseToolServer params={params} mode="domains" />
    </Suspense>
  );
}
