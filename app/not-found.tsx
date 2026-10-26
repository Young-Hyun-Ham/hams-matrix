import Link from "next/link";
export default function NotFound() {
  return (
    <main className="empty">
      <h1>페이지를 찾을 수 없어요.</h1>
      <p>주소를 확인하거나 워크스페이스로 돌아가 주세요.</p>
      <Link href="/dashboard" className="button primary">
        대시보드로 이동
      </Link>
    </main>
  );
}
