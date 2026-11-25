"use client";
import { useState } from "react";
import { errorMessage, useChatbotClient, useChatbotQuery } from "./runtime";
export function ChatbotApprovals({ close }: { close: () => void }) {
  const api = useChatbotClient(),
    [project, setProject] = useState(""),
    [selected, setSelected] = useState(""),
    [comment, setComment] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const entry = useChatbotQuery<{ projects: { id: string; name: string }[] }>(
    "admin/entry-projects",
    true,
  );
  const queue = useChatbotQuery<{
    approvals: {
      id: string;
      status: string;
      version: number;
      created_at: string;
    }[];
  }>(
    `admin/policy-approvals?entryProjectId=${encodeURIComponent(project)}`,
    !!project,
  );
  const detail = useChatbotQuery<{
    id: string;
    status: string;
    version: number;
    expiresAt: string;
    rules: string[];
    stage: string;
  }>(
    `admin/policy-approvals/${selected}?entryProjectId=${encodeURIComponent(project)}`,
    !!selected && !!project,
  );
  async function decide(decision: string) {
    if (!detail.data) return;
    setBusy(true);
    setError("");
    try {
      await api.send(
        `admin/policy-approvals/${selected}/decision?entryProjectId=${encodeURIComponent(project)}`,
        "POST",
        { decision, expectedVersion: detail.data.version, comment },
      );
      setComment("");
      await api.refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="chatbot-run-history chatbot-sub-layer"
      role="dialog"
      aria-label="챗봇 정책 승인 관리"
    >
      <header>
        <h3>챗봇 정책 승인 관리</h3>
        <button onClick={close} aria-label="승인 관리 닫기">
          ×
        </button>
      </header>
      <label>
        진입 확인 프로젝트
        <select
          value={project}
          onChange={(e) => {
            setProject(e.target.value);
            setSelected("");
          }}
        >
          <option value="">owner 프로젝트 선택</option>
          {entry.data?.projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      {entry.data?.projects.length === 0 && (
        <p>현재 owner로 참여하는 프로젝트가 없습니다.</p>
      )}
      {(error || entry.error || queue.error || detail.error) && (
        <p role="alert">
          {error || errorMessage(entry.error || queue.error || detail.error)}
        </p>
      )}
      <button onClick={() => void api.refresh()}>상태 새로고침</button>
      {queue.data?.approvals.map((a) => (
        <button
          key={a.id}
          onClick={() => {
            setSelected(a.id);
            setComment("");
          }}
        >
          {a.status} · {a.id.slice(0, 8)} ·{" "}
          {new Date(a.created_at).toLocaleString("ko-KR", {
            timeZone: "Asia/Seoul",
          })}
        </button>
      ))}
      {detail.data && (
        <div className="chatbot-review">
          <strong>
            {detail.data.status} · {detail.data.stage}
          </strong>
          <p>{detail.data.rules.join(", ")}</p>
          <p>
            승인은 해당 요청의 검사에만 적용됩니다. 승인 후 요청자가 직접
            재개합니다.
          </p>
          {detail.data.status === "pending" && (
            <>
              <label>
                필수 검토 의견
                <textarea
                  maxLength={1000}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
              </label>
              <div className="chatbot-actions">
                <button
                  disabled={busy || !comment.trim()}
                  onClick={() => void decide("approve")}
                >
                  승인
                </button>
                <button
                  disabled={busy || !comment.trim()}
                  onClick={() => void decide("reject")}
                >
                  반려
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
