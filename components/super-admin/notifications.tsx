"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
type Notice = {
  id: string;
  requestId: string;
  company_name: string;
  read_at: string | null;
};
export function SuperNotifications() {
  const [items, setItems] = useState<Notice[]>([]),
    [unread, setUnread] = useState(0),
    [open, setOpen] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    // 컴포넌트 생명주기 전체를 관리하는 메인 AbortController
    const globalController = new AbortController();

    async function load(signal: AbortSignal) {
      try {
        const r = await fetch("/api/super-admin/notifications", {
          cache: "no-store",
          signal, // 매번 전달받은 시그널을 사용합니다.
        });
        const d = await r.json();
        
        if (r.ok && !signal.aborted) {
          setItems(d.notifications);
          setUnread(d.unread);
          setError("");
        }
      } catch (error: any) {
        if (error.name === 'AbortError') {
          console.log('요청이 취소되었습니다.');
        } else {
          // 네트워크 오류 등 예외 처리가 필요하다면 이곳에 작성합니다.
        }
      }
    }

    // 1. 최초 마운트 시 실행 (메인 시그널 전달)
    void load(globalController.signal);

    // 2. 15초마다 실행 (실행될 때마다 해당 요청 전용 Controller를 만듭니다)
    const timer = window.setInterval(() => {
      // 이미 언마운트되었다면 실행하지 않음
      if (globalController.signal.aborted) return;
      
      // 폴링 루프 안에서 개별 요청용 컨트롤러 생성
      const pollController = new AbortController();
      
      // 컴포넌트가 언마운트될 때 이 개별 요청도 같이 취소되도록 연결
      const abortHandler = () => pollController.abort();
      globalController.signal.addEventListener('abort', abortHandler);

      load(pollController.signal).finally(() => {
        globalController.signal.removeEventListener('abort', abortHandler);
      });
    }, 15000);

    // 3. 포커스 및 커스텀 이벤트 핸들러
    const handleFocus = () => {
      if (globalController.signal.aborted) return;
      const focusController = new AbortController();
      load(focusController.signal);
    };

    window.addEventListener("focus", handleFocus);
    window.addEventListener("business-notifications-refresh", handleFocus);

    // 4. Cleanup (언마운트 시 모든 진행 중인 요청 중단 및 타이머 정리)
    return () => {
      globalController.abort(); // 전체 컨트롤러를 취소하여 모든 파생 요청 중단
      window.clearInterval(timer);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("business-notifications-refresh", handleFocus);
    };
  }, []);
  
  return (
    <div className="notification-wrap">
      <button
        className="button"
        aria-label="Business 계약 알림"
        aria-expanded={open}
        onClick={() => {
          if (!open)
            window.dispatchEvent(new Event("business-notifications-refresh"));
          setOpen((v) => !v);
        }}
      >
        계약 알림{unread > 0 && ` ${unread}`}
      </button>
      {open && (
        <div className="notification-popover">
          <strong>Business 계약 신청</strong>
          {error && <p role="alert">{error}</p>}
          {!items.length && <p>알림이 없습니다.</p>}
          {items.map((n) => (
            <p key={n.id}>
              <Link
                href={`/super-admin/settings?tab=business#request-${n.requestId}`}
                onClick={async () => {
                  const r = await fetch(
                    `/api/super-admin/notifications/${n.id}`,
                    {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: "{}",
                    },
                  );
                  if (r.ok) {
                    if (!n.read_at) setUnread((v) => Math.max(0, v - 1));
                    setItems((xs) =>
                      xs.map((x) =>
                        x.id === n.id
                          ? { ...x, read_at: new Date().toISOString() }
                          : x,
                      ),
                    );
                    setOpen(false);
                  } else setError("알림 읽음 처리를 완료하지 못했습니다.");
                }}
              >
                {n.read_at ? "" : "[미확인] "}
                {n.company_name}
              </Link>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
