import "server-only";
import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import type { Client, Row } from "@libsql/client";
import { HttpError } from "./auth";
import { projectAccess } from "./artifacts";
import { audit } from "./audit";
import { db } from "./db";
import { getDocument, putDocument, removeDocument } from "./r2";
import { readDocumentUpload } from "./documents";
import type { User } from "./types";
import type { OnlyofficeConfiguration } from "./onlyoffice-types";

type Executor = Pick<Client, "execute">;
type Scope = { projectId: string; fileId: string; workspaceId: string; userId: string; key: string; purpose: string; exp: number };
const noStore = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
export { noStore as onlyofficeHeaders };

export function onlyofficeSettings() {
  const server = process.env.ONLYOFFICE_DOCUMENT_SERVER_URL;
  const secret = process.env.ONLYOFFICE_JWT_SECRET;
  if (!server || !secret) throw new HttpError(503, "ONLYOFFICE 서버 연결이 필요합니다. 서버 관리자가 ONLYOFFICE_DOCUMENT_SERVER_URL과 ONLYOFFICE_JWT_SECRET을 설정한 뒤 다시 열어 주세요.");
  const serverUrl = httpUrl(server);
  const appUrl = process.env.ONLYOFFICE_PUBLIC_APP_URL || process.env.APP_URL;
  if (!appUrl) throw new HttpError(503, "문서 서버가 접근할 수 있는 앱 주소를 설정해 주세요.");
  return { serverUrl: serverUrl.href.replace(/\/$/, ""), appUrl: httpUrl(appUrl).origin, secret };
}
function httpUrl(value: string) {
  let url: URL;
  try { url = new URL(value); } catch { throw new HttpError(400, "올바른 문서 서버 URL이 아닙니다."); }
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password)
    throw new HttpError(400, "올바른 문서 서버 URL이 아닙니다.");
  return url;
}
function capabilitySecret() {
  return createHmac("sha256", onlyofficeSettings().secret).update("hams-onlyoffice-capability-v1").digest("base64url");
}
export function signOnlyofficeJwt(payload: Record<string, unknown>, secret: string) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const content = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(`${header}.${content}`).digest("base64url");
  return `${header}.${content}.${signature}`;
}
export function verifyOnlyofficeJwt(token: string, secret: string): Record<string, unknown> {
  try {
    if (token.length > 40000 || !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(token)) throw new Error();
    const [header, payload, signature] = token.split(".");
    if (JSON.parse(Buffer.from(header, "base64url").toString()).alg !== "HS256") throw new Error();
    const expected = createHmac("sha256", secret).update(`${header}.${payload}`).digest();
    const actual = Buffer.from(signature, "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(expected, actual)) throw new Error();
    const result = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error();
    const now = Date.now() / 1000;
    if (result.exp !== undefined && (typeof result.exp !== "number" || result.exp <= now)) throw new Error();
    if (result.nbf !== undefined && (typeof result.nbf !== "number" || result.nbf > now)) throw new Error();
    return result;
  } catch { throw new HttpError(403, "문서 서버 서명을 확인할 수 없습니다."); }
}
export function onlyofficeFileType(name: string) {
  const fileType = name.split(".").at(-1)?.toLowerCase();
  if (fileType !== "docx" && fileType !== "xlsx" && fileType !== "pptx")
    throw new HttpError(415, "현재 DOCX, XLSX, PPTX 파일을 편집할 수 있습니다. 다른 파일은 문서함에서 다운로드해 주세요.");
  const documentType = fileType === "docx" ? "word" : fileType === "xlsx" ? "cell" : "slide";
  return { fileType, documentType } as const;
}
export function onlyofficeKey(row: Row) { return `${row.id}-v${row.editor_version}`; }
async function fileFor(executor: Executor, projectId: string, workspaceId: string, fileId: string) {
  const row = (await executor.execute({ sql: "SELECT * FROM project_files WHERE id=? AND project_id=? AND workspace_id=?", args: [fileId, projectId, workspaceId] })).rows[0];
  if (!row) throw new HttpError(404, "파일을 찾을 수 없습니다. 삭제되었거나 접근 권한이 없습니다.");
  return row;
}
function writer(user: User) {
  return user.onboardingComplete && ["owner", "admin", "member"].includes(user.role);
}
export async function onlyofficeConfiguration(user: User, projectId: string, fileId: string): Promise<OnlyofficeConfiguration> {
  const access = await projectAccess(db(), user, projectId);
  const row = await fileFor(db(), projectId, user.workspaceId, fileId);
  const { fileType, documentType } = onlyofficeFileType(String(row.name));
  const { serverUrl, appUrl, secret } = onlyofficeSettings();
  const key = onlyofficeKey(row), canEdit = writer({ ...user, role: String(access.role) });
  const scope = { projectId, fileId, workspaceId: user.workspaceId, userId: user.id, key };
  const now = Math.floor(Date.now() / 1000);
  const path = `/api/projects/${encodeURIComponent(projectId)}/documents/files/${encodeURIComponent(fileId)}/editor`;
  const sourceToken = signOnlyofficeJwt({ ...scope, purpose: "content", exp: now + 86400 }, capabilitySecret());
  const callbackToken = canEdit ? signOnlyofficeJwt({ ...scope, purpose: "callback", exp: now + 7 * 86400 }, capabilitySecret()) : "";
  const config: OnlyofficeConfiguration["config"] = {
    document: { title: String(row.name), fileType, key, url: `${appUrl}${path}/content?token=${sourceToken}`, permissions: { edit: canEdit, download: true, print: true } },
    documentType, height: "100%", width: "100%",
    editorConfig: {
      mode: canEdit ? "edit" : "view", lang: "ko", user: { id: user.id, name: user.name },
      ...(canEdit ? { callbackUrl: `${appUrl}${path}/callback?token=${callbackToken}` } : {}),
      customization: { forcesave: true, autosave: true },
    },
  };
  config.token = signOnlyofficeJwt({ ...config, exp: now + 86400 }, secret);
  return { name: String(row.name), canEdit, documentServerUrl: serverUrl, config };
}
export function onlyofficeScope(request: Request, projectId: string, fileId: string, purpose: "content" | "callback"): Scope {
  const token = new URL(request.url).searchParams.get("token") || "";
  const payload = verifyOnlyofficeJwt(token, capabilitySecret());
  if (payload.projectId !== projectId || payload.fileId !== fileId || payload.purpose !== purpose || typeof payload.exp !== "number" ||
      ![payload.workspaceId, payload.userId, payload.key].every(value => typeof value === "string" && value.length > 0))
    throw new HttpError(403, "문서 접근 범위가 올바르지 않습니다.");
  return payload as Scope;
}
async function scopedUser(executor: Executor, scope: Scope, write: boolean) {
  const row = (await executor.execute({
    sql: "SELECT u.id,u.name,u.account_role,u.onboarding_complete,m.role FROM users u JOIN workspace_members m ON m.user_id=u.id WHERE u.id=? AND m.workspace_id=?",
    args: [scope.userId, scope.workspaceId],
  })).rows[0];
  if (!row || Number(row.onboarding_complete) !== 1) throw new HttpError(403, "문서 접근 권한이 만료되었습니다.");
  const user: User = { id: String(row.id), name: String(row.name), email: null, workspaceId: scope.workspaceId, workspaceName: "", role: String(row.role), plan: "", accountRole: row.account_role === "owner" ? "owner" : "user", onboardingComplete: true };
  const access = await projectAccess(executor, user, scope.projectId, write);
  return { ...user, role: String(access.role) };
}
export async function onlyofficeContent(scope: Scope) {
  await scopedUser(db(), scope, false);
  const row = await fileFor(db(), scope.projectId, scope.workspaceId, scope.fileId);
  if (onlyofficeKey(row) !== scope.key) throw new HttpError(409, "문서 버전이 변경되었습니다. 문서함에서 다시 열어 주세요.");
  return getDocument(String(row.object_key));
}
export function onlyofficeCallbackPayload(request: Request, input: Record<string, unknown>) {
  const header = request.headers.get(process.env.ONLYOFFICE_JWT_HEADER || "Authorization");
  const token = typeof input.token === "string" ? input.token : header?.replace(/^Bearer\s+/i, "") || "";
  const decoded = verifyOnlyofficeJwt(token, onlyofficeSettings().secret);
  if (decoded.operation !== undefined && decoded.operation !== "callback") throw new HttpError(403, "문서 콜백 서명이 아닙니다.");
  const payload = (decoded.payload ?? decoded) as Record<string, unknown>;
  // Use signed fields exclusively, never the unverified body alongside a valid token.
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || typeof payload.key !== "string" || !Number.isInteger(payload.status))
    throw new HttpError(400, "올바른 문서 저장 요청이 아닙니다.");
  return payload;
}
async function editedBytes(value: unknown) {
  if (typeof value !== "string") throw new HttpError(400, "저장할 문서 URL이 없습니다.");
  const url = httpUrl(value), server = new URL(onlyofficeSettings().serverUrl);
  if (url.origin !== server.origin) throw new HttpError(403, "허용되지 않은 문서 저장 주소입니다.");
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new HttpError(502, "편집한 문서를 문서 서버에서 가져오지 못했습니다.");
  return readDocumentUpload(new Request(url, { method: "POST", body: response.body, headers: { "Content-Length": response.headers.get("Content-Length") || "0" }, duplex: "half" } as RequestInit));
}
export async function saveOnlyoffice(request: Request, scope: Scope, payload: Record<string, unknown>) {
  if (payload.key !== scope.key) throw new HttpError(403, "다른 문서의 저장 요청입니다.");
  const status = Number(payload.status);
  if (![1, 2, 3, 4, 6, 7].includes(status)) throw new HttpError(400, "알 수 없는 문서 상태입니다.");
  if (status === 3 || status === 7) throw new HttpError(502, "ONLYOFFICE에서 문서 저장 오류를 보고했습니다.");
  const tx = await db().transaction("write");
  let uploadedKey: string | undefined, oldKey: string | undefined;
  let committed = false;
  try {
    const user = await scopedUser(tx, scope, true);
    const row = await fileFor(tx, scope.projectId, scope.workspaceId, scope.fileId);
    if (onlyofficeKey(row) !== scope.key) {
      if (row.previous_editor_key === scope.key && [2, 4, 6].includes(status)) { await tx.commit(); return; }
      throw new HttpError(409, "이미 종료된 문서 버전의 저장 요청입니다.");
    }
    if (status === 2 || status === 6) {
      const { fileType } = onlyofficeFileType(String(row.name));
      if (payload.filetype !== undefined && payload.filetype !== fileType) throw new HttpError(409, "파일 형식이 변경되어 저장할 수 없습니다.");
      const bytes = await editedBytes(payload.url);
      uploadedKey = `workspaces/${scope.workspaceId}/projects/${scope.projectId}/documents/${scope.fileId}/saved-${randomUUID()}`;
      await putDocument(uploadedKey, bytes);
      oldKey = String(row.object_key);
      await tx.execute({ sql: "UPDATE project_files SET object_key=?,byte_length=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND project_id=? AND workspace_id=?", args: [uploadedKey, bytes.length, scope.fileId, scope.projectId, scope.workspaceId] });
      await audit(request, { user, action: "UPDATE", resource: "project_file", resourceId: scope.fileId, before: { name: String(row.name), version: Number(row.editor_version) }, after: { name: String(row.name), version: Number(row.editor_version) + (status === 2 ? 1 : 0) }, metadata: { projectId: scope.projectId, onlyoffice: true, status, byteLength: bytes.length } }, tx);
    }
    // Keep the key for force saves so all open editors stay in the same co-editing session.
    if (status === 2 || status === 4)
      await tx.execute({ sql: "UPDATE project_files SET editor_version=editor_version+1,previous_editor_key=? WHERE id=? AND project_id=? AND workspace_id=?", args: [scope.key, scope.fileId, scope.projectId, scope.workspaceId] });
    await tx.commit(); committed = true;
  } catch (error) { await tx.rollback(); throw error; }
  finally {
    tx.close();
    const cleanup = committed ? oldKey : uploadedKey;
    if (cleanup) try { await removeDocument(cleanup); } catch { console.error("ONLYOFFICE object cleanup failed", scope.fileId); }
  }
}
