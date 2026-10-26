"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Icon } from "@/components/icon";
import type { Project, TeamMember } from "@/lib/project-types";
import type { User } from "@/lib/types";
import "./create-project-dialog.css";

export function CreateProjectDialog({
  user,
  onClose,
  onCreated,
}: {
  user: User;
  onClose: () => void;
  onCreated: (project: Project) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const submitting = useRef(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [selected, setSelected] = useState<string[]>([user.id]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setLoadError("");
      try {
        const response = await fetch("/api/team/members", {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setMembers(data.members);
      } catch (error) {
        if (!controller.signal.aborted)
          setLoadError(
            error instanceof Error
              ? error.message
              : "팀원을 불러오지 못했습니다.",
          );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [attempt]);
  function close() {
    if (!submitting.current) onClose();
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || loading || loadError) return;
    submitting.current = true;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, memberIds: selected }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      onCreated(data.project);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "프로젝트를 생성하지 못했습니다.",
      );
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }
  const filtered = members.filter((member) =>
    member.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  return (
    <dialog
      ref={dialog}
      className="workspace-dialog create-project-dialog"
      aria-labelledby="create-project-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div className="dialog-header">
        <h2 id="create-project-title">새 프로젝트 만들기</h2>
        <button
          type="button"
          className="icon-button"
          onClick={close}
          disabled={saving}
          aria-label="닫기"
        >
          <Icon name="close" />
        </button>
      </div>
      <form
        className="create-project-form"
        onSubmit={submit}
        aria-busy={saving}
      >
        <label htmlFor="project-name">
          프로젝트 이름 <span>필수</span>
        </label>
        <input
          id="project-name"
          name="name"
          autoFocus
          required
          maxLength={100}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="프로젝트 이름을 입력하세요"
          disabled={saving}
        />
        <label htmlFor="project-description">설명</label>
        <textarea
          id="project-description"
          name="description"
          maxLength={2000}
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="프로젝트의 목표와 내용을 적어 주세요"
          disabled={saving}
        />
        <fieldset disabled={saving}>
          <legend>
            팀원 <span>{selected.length}명 선택</span>
          </legend>
          <p className="project-form-hint">
            {user.workspaceName}의 팀원을 선택하세요. 생성자는 자동으로
            포함됩니다.
          </p>
          <label
            className="project-member-search"
            htmlFor="project-member-search"
          >
            팀원 검색
            <input
              id="project-member-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="이름으로 검색"
            />
          </label>
          {loading ? (
            <p role="status">팀원을 불러오는 중입니다.</p>
          ) : loadError ? (
            <div role="alert">
              <p>{loadError}</p>
              <button
                type="button"
                className="button"
                onClick={() => setAttempt((value) => value + 1)}
              >
                다시 불러오기
              </button>
            </div>
          ) : (
            <div className="project-member-options">
              {filtered.length ? (
                filtered.map((member) => (
                  <label key={member.id} className="project-member-option">
                    <input
                      type="checkbox"
                      checked={selected.includes(member.id)}
                      disabled={
                        member.id === user.id ||
                        (!selected.includes(member.id) &&
                          selected.length >= 100)
                      }
                      onChange={(e) =>
                        setSelected((ids) =>
                          e.target.checked
                            ? [...ids, member.id]
                            : ids.filter((id) => id !== member.id),
                        )
                      }
                    />
                    <span>
                      {member.name}
                      {member.id === user.id && (
                        <small> (나 · 자동 포함)</small>
                      )}
                    </span>
                    <small>
                      {(
                        {
                          owner: "소유자",
                          admin: "관리자",
                          member: "팀원",
                          viewer: "뷰어",
                        } as Record<string, string>
                      )[member.role] ?? member.role}
                    </small>
                  </label>
                ))
              ) : (
                <p>검색 결과가 없습니다.</p>
              )}
            </div>
          )}
        </fieldset>
        {error && (
          <p className="project-form-error" role="alert">
            {error}
          </p>
        )}
        <div className="project-form-actions">
          <button
            className="button"
            type="button"
            onClick={close}
            disabled={saving}
          >
            취소
          </button>
          <button
            className="button primary"
            type="submit"
            disabled={saving || loading || !!loadError || !name.trim()}
          >
            {saving ? "생성 중…" : "프로젝트 생성"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
