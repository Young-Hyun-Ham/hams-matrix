export const projectAccessEvent = 'matrix-project-access-changed';
export function notifyProjectAccessChange(projectId: string) {
  window.dispatchEvent(new CustomEvent(projectAccessEvent, { detail: { projectId } }));
  try { localStorage.setItem(projectAccessEvent, JSON.stringify({ projectId, time: Date.now() })); } catch {}
}
