"use client";

import { requestJson } from "./query/browser-fetch";
export const teamAccessDeniedEvent = "matrix:team-access-denied";

// Keep error handling in each form; ask the shell to re-read the current subscription.
export async function fetchTeam(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...init });
  if (response.status === 403)
    window.dispatchEvent(new Event(teamAccessDeniedEvent));
  return response;
}

export async function teamJsonRequest(url: string, init?: RequestInit) {
  return requestJson<Awaited<ReturnType<Response["json"]>>>(
    url,
    init,
    fetchTeam,
  );
}
