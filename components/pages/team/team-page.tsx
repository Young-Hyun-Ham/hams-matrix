"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { User } from "@/lib/types";
import type { Project, TeamMember } from "@/lib/project-types";
import { TeamMembership } from "./team-membership";
import { TeamMemberAddDialog } from "./team-member-add-dialog";
import { Icon } from "@/components/icon";
import "./team-page.css";
type Post = { id: string; title: string; body: string; category: string; author: string; jobTitle: string; createdAt: string; projectId: string | null; projectName: string | null; comments: number };
type Comment = { id: string; body: string; author: string; jobTitle: string; createdAt: string };
const writable = (role: string) => ["owner", "admin", "member"].includes(role);
const date = (value: string) => new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
export function TeamPage({ user }: { user: User }) {
  const [projectId, setProjectId] = useState(""), [projects, setProjects] = useState<Project[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]), [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true), [version, setVersion] = useState(0), [error, setError] = useState("");
  const [composing, setComposing] = useState(false), [busy, setBusy] = useState(false);
  const [addingMember, setAddingMember] = useState(false), [canManageMembers, setCanManageMembers] = useState(false);
  const [loadedProjectId, setLoadedProjectId] = useState("");
  const projectPicker = useRef<HTMLSelectElement>(null);
  const [comments, setComments] = useState<Record<string, Comment[]>>({}), [commentText, setCommentText] = useState<Record<string, string>>({}), [commentsBusy, setCommentsBusy] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const selected = projects.find(project => project.id === projectId);
  const selectedRole = loadedProjectId === projectId ? members.find(member => member.id === user.id)?.role : "";
  const canWrite = (id: string | null) => id ? writable(projects.find(project => project.id === id)?.members.find(member => member.id === user.id)?.role ?? "viewer") : writable(user.role);
  useEffect(() => { if (composing) dialog.current?.showModal(); else dialog.current?.close(); }, [composing]);
  useEffect(() => {
    const controller = new AbortController();
    const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : "";
    async function load() {
      setLoading(true); setError(""); setPosts([]); setMembers([]); setCanManageMembers(false); setComments({});
      try {
        const responses = await Promise.all([fetch("/api/projects", { cache: "no-store", signal: controller.signal }), ...(projectId ? [fetch(`/api/team/posts${query}`, { cache: "no-store", signal: controller.signal }), fetch(`/api/team/members${query}`, { cache: "no-store", signal: controller.signal })] : [])]);
        const data = await Promise.all(responses.map(response => response.json()));
        for (let i = 0; i < responses.length; i++) if (!responses[i].ok) throw new Error(data[i].error);
        if (!controller.signal.aborted) { setProjects(data[0].projects); if (projectId) { setPosts(data[1].posts); setMembers(data[2].members); setCanManageMembers(data[2].canAdd); } setLoadedProjectId(projectId); }
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "팀 공유 정보를 불러오지 못했습니다."); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load(); return () => controller.abort();
  }, [user.workspaceId, projectId, version]);
  async function writePost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy || !projectId || selectedRole !== "member") return;
    const values = new FormData(event.currentTarget);
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/team/posts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId, title: values.get("title"), body: values.get("body"), category: values.get("category") }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      setComposing(false); setVersion(value => value + 1);
    } catch (e) { setError(e instanceof Error ? e.message : "게시글을 저장하지 못했습니다."); }
    finally { setBusy(false); }
  }
  async function loadComments(id: string) {
    setCommentsBusy(id); setError("");
    try {
      const response = await fetch(`/api/team/posts/${id}/comments`, { cache: "no-store" });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      setComments(current => ({ ...current, [id]: data.comments }));
    } catch (e) { setError(e instanceof Error ? e.message : "댓글을 불러오지 못했습니다."); }
    finally { setCommentsBusy(""); }
  }
  async function addComment(event: FormEvent, id: string) {
    event.preventDefault(); if (commentsBusy) return;
    setCommentsBusy(id); setError("");
    try {
      const response = await fetch(`/api/team/posts/${id}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: commentText[id] }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      setCommentText(current => ({ ...current, [id]: "" })); setPosts(current => current.map(post => post.id === id ? { ...post, comments: post.comments + 1 } : post));
      await loadComments(id);
    } catch (e) { setError(e instanceof Error ? e.message : "댓글을 저장하지 못했습니다."); }
    finally { setCommentsBusy(""); }
  }
  return <>
    <div className="page-heading"><div><h1>팀 공유</h1><p>프로젝트를 선택하고 팀의 소식과 의견을 나누세요.</p></div><div className="page-heading-actions"><label className="project-filter"><select ref={projectPicker} value={projectId} aria-label="팀 공유 프로젝트 선택" disabled={busy} onChange={event => { setProjectId(event.target.value); setComposing(false); setAddingMember(false); }}><option value="">프로젝트 선택</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>{projectId && selectedRole === "member" && <button className="button primary" disabled={loading} onClick={() => { setError(""); setComposing(true); }}>공유 글 작성</button>}</div></div>
    {!projectId ? <section className="team-project-guide" aria-labelledby="team-project-guide-title"><div className="team-guide-art" aria-hidden="true"><span className="team-guide-orbit" /><span className="team-guide-folder"><Icon name="folder" size={44} /></span><span className="team-guide-person person-one"><Icon name="team" size={22} /></span><span className="team-guide-person person-two"><Icon name="message" size={20} /></span></div><span className="team-guide-label">TEAM WORKSPACE</span><h2 id="team-project-guide-title">어떤 프로젝트의 팀과 함께할까요?</h2><p>상단에서 프로젝트를 선택하면<br />해당 프로젝트의 구성원과 팀 이야기를 확인할 수 있습니다.</p><button className="button primary" disabled={loading || !projects.length} onClick={() => projectPicker.current?.focus()}>프로젝트 선택하기</button>{!loading && !projects.length && <small>참여 중인 프로젝트가 없습니다. 프로젝트를 만들거나 소유자에게 참여를 요청해 주세요.</small>}<div className="team-guide-features"><span><Icon name="team" size={17} />프로젝트 구성원</span><span><Icon name="message" size={17} />팀 이야기</span><span><Icon name="shield" size={17} />역할별 협업</span></div></section> : <>
    {selectedRole === "owner" && <TeamMembership key={`${user.workspaceId}:${projectId}`} user={user} projectId={projectId} refreshVersion={version} onChanged={() => setVersion(value => value + 1)} />}
    {error && <p className="error-message" role="alert">{error}</p>}
    <div className="team-layout"><section className="panel"><div className="panel-heading"><h2>팀 이야기 <span>{posts.length}</span></h2><span className="badge gray">{selected?.name ?? user.workspaceName}</span></div>
      {loading ? <p className="team-empty" role="status">팀 이야기를 불러오고 있습니다.</p> : posts.length ? posts.map(post => <article className="team-post" key={post.id}><div><span className="activity-avatar purple">{post.author.charAt(0)}</span><span><strong>{post.author}</strong><small>{post.jobTitle || "담당 역할 미등록"} · {date(post.createdAt)}</small></span><span className="badge purple">{post.category}</span></div><h3>{post.title}</h3>{post.projectName && <small>{post.projectName}</small>}<p className="team-post-body">{post.body}</p><button className="post-comments" disabled={!!commentsBusy} onClick={() => { if (comments[post.id]) setComments(current => { const next = { ...current }; delete next[post.id]; return next; }); else void loadComments(post.id); }}>의견 {post.comments}개 {comments[post.id] ? "접기" : "보기"}</button>
      {comments[post.id] && <div className="team-comments">{comments[post.id].length ? comments[post.id].map(comment => <div key={comment.id}><strong>{comment.author}</strong><small>{date(comment.createdAt)}</small><p>{comment.body}</p></div>) : <p>아직 댓글이 없습니다.</p>}{canWrite(post.projectId) && <form onSubmit={event => void addComment(event, post.id)}><label>댓글<textarea required maxLength={2000} value={commentText[post.id] ?? ""} disabled={!!commentsBusy} onChange={event => setCommentText(current => ({ ...current, [post.id]: event.target.value }))} /></label><button className="button" disabled={!!commentsBusy || !commentText[post.id]?.trim()}>댓글 등록</button></form>}</div>}</article>) : <p className="team-empty">아직 공유된 이야기가 없습니다.</p>}
    </section><aside className="panel team-members-panel"><div className="panel-heading"><h2>함께하는 사람들</h2><span className="badge purple">{members.length}명</span></div><div className="team-member-list">{members.map(member => <div key={member.id}><span className="activity-avatar purple">{member.name.charAt(0)}</span><span><strong>{member.name}</strong><small>{member.jobTitle || "담당 역할 미등록"}</small></span><span className="badge gray">{member.role}</span></div>)}</div>{canManageMembers && loadedProjectId === projectId && <button className="button invite-button" disabled={loading} onClick={() => setAddingMember(true)}>멤버 추가</button>}</aside></div>
    {addingMember && canManageMembers && loadedProjectId === projectId && <TeamMemberAddDialog key={`${user.workspaceId}:${projectId}`} projectId={projectId} projectName={selected?.name} onClose={() => setAddingMember(false)} onAdded={() => { setVersion(value => value + 1); }} />}
    <dialog ref={dialog} className="team-compose-dialog" onCancel={event => { event.preventDefault(); if (!busy) setComposing(false); }}><form onSubmit={event => void writePost(event)}><h2>공유 글 작성</h2><p>{selected?.name}에 공유합니다.</p><label>분류<select name="category" disabled={busy}>{["공유", "공지", "질문", "진행 상황"].map(category => <option key={category}>{category}</option>)}</select></label><label>제목<input name="title" required maxLength={160} disabled={busy} /></label><label>내용<textarea name="body" required maxLength={10000} rows={8} disabled={busy} /></label>{error && <p role="alert" className="error-message">{error}</p>}<div><button type="button" className="button" disabled={busy} onClick={() => setComposing(false)}>닫기</button><button className="button primary" disabled={busy}>{busy ? "저장 중…" : "공유하기"}</button></div></form></dialog>
    </>}
    {!projectId && error && <p className="error-message" role="alert">{error}</p>}
  </>;
}
