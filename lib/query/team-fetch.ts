"use client";
import { fetchTeam } from "@/lib/team-request";
import { requestJson } from "./browser-fetch";
export const teamRequestJson = <T>(url: string, init?: RequestInit) =>
  requestJson<T>(url, init, fetchTeam);
