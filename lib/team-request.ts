"use client";

export const teamAccessDeniedEvent = "matrix:team-access-denied";

// Keep error handling in each form; ask the shell to re-read the current subscription.
export async function fetchTeam(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...init });
  if (response.status === 403)
    window.dispatchEvent(new Event(teamAccessDeniedEvent));
  return response;
}

export async function teamJsonRequest(url: string, init?: RequestInit) {
  const response = await fetchTeam(url, init);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "요청에 실패했습니다.");
  return result;
}
