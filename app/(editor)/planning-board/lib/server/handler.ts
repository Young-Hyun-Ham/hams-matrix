import "server-only";
import { requestBytes } from "./request-body";
import { normalizeDocumentImages } from "../asset-url";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { readProjectPolicy } from "@/lib/project-permissions";
import type { ProjectRole } from "@/lib/plan-types";
import { HttpError, requireUser, checkOrigin, errorResponse } from "@/lib/auth";
import { activeGuardrailPolicy } from "@/lib/ai/guardrail-policy";
import { projectHistoryEnabled } from "@/lib/plans";
import screenstemplate from "../../data/screens/screens-template.json";
import screenstemplate2 from "../../data/screens/screens-template2.json";
import { access, boardRow, scoped } from "./access";
import { readBoard, saveBoard } from "./board-service";
import { generateBoard } from "./ai-generation";
import { uploadAsset, readAsset } from "./assets";
import { review } from "./review";
import { formatCode } from "./format-code";
import {
  listProjectTemplates,
  createProjectTemplate,
  readProjectTemplate,
  applyProjectTemplate,
} from "./project-templates";
export async function handle(request: Request, segments: string[]) {
  try {
    const user = await requireUser();
    const method = request.method;
    if (method !== "GET") checkOrigin(request);
    if (
      segments[0] === "projects" &&
      segments[1] &&
      segments[2] === "templates"
    ) {
      if (segments.length === 3 && method === "GET")
        return json(await listProjectTemplates(user, segments[1]));
      if (segments.length === 3 && method === "POST")
        return json(
          await createProjectTemplate(
            user,
            segments[1],
            await readJson(request),
          ),
        );
      if (segments.length === 4 && method === "GET")
        return json(await readProjectTemplate(user, segments[1], segments[3]));
      throw new HttpError(404, "템플릿 경로를 확인해 주세요.");
    }
    if (segments[0] === "templates" && method === "GET") {
      if (user.accountRole === "guest" || !user.onboardingComplete)
        throw new HttpError(403, "템플릿 조회 권한이 없습니다.");
      const templates: Record<string, unknown> = {
        "screens-template": screenstemplate,
        "screens-template2": screenstemplate2,
      };
      const template = templates[segments[1]];
      if (!template) throw new HttpError(404, "템플릿을 찾을 수 없습니다.");
      return json({ template });
    }
    if (
      segments[0] !== "projects" ||
      segments[2] !== "screens" ||
      !segments[1] ||
      !segments[3]
    )
      throw new HttpError(404, "경로를 확인해 주세요.");
    const scope = { projectId: segments[1], screenId: segments[3] },
      resource = segments.slice(4).join("/");
    const a = await access(
      user,
      scope,
      method !== "GET" && resource !== "format-code",
    );
    const board = await boardRow(user, scope);
    if (resource === "access" && method === "GET") {
      const policy = await activeGuardrailPolicy(user.workspaceId);
      const memberPolicy = await readProjectPolicy(
        db(),
        user.workspaceId,
        scope.projectId,
      );
      const members = (
        await db().execute({
          sql: "SELECT u.id,u.name,m.role FROM project_members m JOIN users u ON u.id=m.user_id JOIN workspace_members w ON w.workspace_id=m.workspace_id AND w.user_id=m.user_id WHERE m.project_id=? AND m.workspace_id=? AND u.account_role!='guest' AND u.onboarding_complete=1 ORDER BY u.name,u.id",
          args: [scope.projectId, user.workspaceId],
        })
      ).rows.map((r) => ({
        id: String(r.id),
        name: String(r.name),
        canReview:
          memberPolicy.permissions[
            a.permissions.ownerId === r.id ? "owner" : (r.role as ProjectRole)
          ]?.screen.UPDATE === true,
      }));
      return json({
        user,
        aiEnabled: policy.policy.aiEnabled,
        canUpdate: a.permissions.permissionsByTab.screen.UPDATE,
        canCreateTemplate: a.permissions.projectRole === "owner",
        status: String(board?.status ?? "draft"),
        members,
      });
    }
    if (/^templates\/[^/]+\/apply$/.test(resource) && method === "POST")
      return json(await applyProjectTemplate(user, scope, segments[5]));
    if (resource === "board" && method === "GET")
      return json(await readBoard(user, scope));
    if (resource === "assets" && method === "POST")
      return json(await uploadAsset(request, user, scope));
    if (/^assets\/[^/]+\/content$/.test(resource) && method === "GET")
      return await readAsset(user, scope, segments[5]);
    if (resource === "documents" && method === "GET") {
      const rows = (
        await db().execute({
          sql: "SELECT a.id,a.title,a.updated_at,b.status FROM project_artifacts a LEFT JOIN planning_boards b ON b.screen_artifact_id=a.id AND b.project_id=a.project_id AND b.workspace_id=a.workspace_id WHERE a.workspace_id=? AND a.project_id=? AND a.kind='screen' AND a.deleted_at IS NULL ORDER BY a.updated_at DESC,a.id LIMIT 100",
          args: [user.workspaceId, scope.projectId],
        })
      ).rows;
      return json({
        projects: rows.map((r) => ({
          id: r.id,
          title: r.title,
          status: r.status ?? "draft",
          updatedAt: r.updated_at,
          access: a.permissions.permissionsByTab.screen.UPDATE
            ? a.permissions.ownerId === user.id
              ? "owner"
              : "edit"
            : "view",
          ownerEmail: "",
        })),
      });
    }
    if (resource === "ai/history" && method === "GET") {
      if (!(await projectHistoryEnabled(scope.projectId)))
        throw new HttpError(
          403,
          "현재 요금제에는 상세 이력이 포함되지 않습니다.",
        );
      const rows = (
        await db().execute({
          sql: "SELECT request_id,prompt,model,created_at,status FROM planning_board_ai_requests WHERE workspace_id=? AND project_id=? AND screen_artifact_id=? AND user_id=? ORDER BY created_at DESC,request_id DESC LIMIT 100",
          args: [...scoped(user, scope), user.id],
        })
      ).rows;
      return json({
        chats: rows.map((r) => ({
          id: r.request_id,
          prompt: r.prompt,
          model: r.model,
          createdAt: r.created_at,
          screenTitle: String(a.screen.title),
          status: r.status,
        })),
      });
    }
    if (/^ai\/generate\/[^/]+$/.test(resource) && method === "GET") {
      const row = (
        await db().execute({
          sql: "SELECT request_id,status,result_version,error_code,lease_until FROM planning_board_ai_requests WHERE request_id=? AND workspace_id=? AND project_id=? AND screen_artifact_id=? AND user_id=?",
          args: [segments[6], ...scoped(user, scope), user.id],
        })
      ).rows[0];
      if (!row) throw new HttpError(404, "생성 요청을 찾을 수 없습니다.");
      return json({
        requestId: row.request_id,
        status:
          row.status === "running" &&
          String(row.lease_until) < new Date().toISOString()
            ? "failed"
            : row.status,
        resultVersion: row.result_version,
        errorCode: row.error_code,
      });
    }
    const input = method === "GET" ? {} : await readJson(request);
    if (resource === "board" && (method === "POST" || method === "PUT"))
      return json(await saveBoard(request, user, scope, input));
    if (resource === "ai/generate" && method === "POST")
      return json(await generateBoard(request, user, scope, input));
    if (resource === "review" && method === "POST")
      return json(await review(user, scope, input));
    if (resource === "format-code" && method === "POST") {
      if (
        typeof input.markup !== "string" ||
        typeof input.css !== "string" ||
        typeof input.reactMarkup !== "string" ||
        (input.templateMarkup !== undefined &&
          typeof input.templateMarkup !== "string")
      )
        throw new HttpError(400, "코드 형식을 확인해 주세요.");
      return json(
        await formatCode({
          markup: input.markup,
          css: input.css,
          reactMarkup: input.reactMarkup,
          templateMarkup:
            typeof input.templateMarkup === "string"
              ? input.templateMarkup
              : undefined,
        }),
      );
    }
    if (
      ["comments", "memos", "review", "revisions"].includes(resource) &&
      method === "GET"
    ) {
      if (!board)
        return json({ [resource === "review" ? "history" : resource]: [] });
      if (
        resource === "revisions" &&
        !(await projectHistoryEnabled(scope.projectId))
      )
        throw new HttpError(
          403,
          "현재 요금제에는 상세 이력이 포함되지 않습니다.",
        );
      const table = {
        comments: "comments",
        memos: "memos",
        review: "review_history",
        revisions: "revisions",
      }[resource]!;
      const cursor = new URL(request.url).searchParams.get("cursor");
      let predicate = "";
      const args = [...scoped(user, scope), String(board.id)];
      if (cursor) {
        try {
          const [at, id] = JSON.parse(
            Buffer.from(cursor, "base64url").toString(),
          ) as string[];
          if (typeof at !== "string" || typeof id !== "string") throw Error();
          predicate = " AND (created_at<? OR (created_at=? AND id<?))";
          args.push(at, at, id);
        } catch {
          throw new HttpError(400, "목록 커서가 잘못되었습니다.");
        }
      }
      const rows = (
        await db().execute({
          sql: `SELECT * FROM planning_board_${table} WHERE workspace_id=? AND project_id=? AND screen_artifact_id=? AND board_id=?${predicate} ORDER BY created_at DESC,id DESC LIMIT 101`,
          args,
        })
      ).rows;
      const page = rows.slice(0, 100),
        last = page.at(-1);
      const items = page.map((r) =>
        resource === "memos"
          ? {
              ...JSON.parse(String(r.data_json)),
              id: r.id,
              version: Number(r.version),
              createdAt: r.created_at,
              updatedAt: r.updated_at,
            }
          : resource === "comments"
            ? {
                id: r.id,
                text: r.text,
                author: r.author_name,
                authorName: r.author_name,
                createdAt: r.created_at,
              }
            : resource === "revisions"
              ? {
                  id: r.id,
                  contentVersion: r.content_version,
                  document: normalizeDocumentImages(
                    JSON.parse(String(r.snapshot_json)),
                    scope,
                  ),
                  createdAt: r.created_at,
                }
              : {
                  id: r.id,
                  action: r.action,
                  fromStatus: r.from_status,
                  toStatus: r.to_status,
                  message: r.message,
                  actorId: r.actor_id,
                  createdAt: r.created_at,
                },
      );
      return json({
        [resource === "review" ? "history" : resource]: items,
        nextCursor:
          rows.length > 100 && last
            ? Buffer.from(JSON.stringify([last.created_at, last.id])).toString(
                "base64url",
              )
            : null,
      });
    }
    if (resource === "comments" && method === "POST") {
      const text = typeof input.text === "string" ? input.text.trim() : "";
      if (!text || text.length > 1000)
        throw new HttpError(400, "코멘트는 1~1,000자로 입력해 주세요.");
      const tx = await db().transaction("write");
      try {
        await access(user, scope, true, tx);
        const b = await boardRow(user, scope, tx);
        if (!b) throw new HttpError(409, "먼저 저장해 주세요.");
        await tx.execute({
          sql: "INSERT INTO planning_board_comments(id,board_id,workspace_id,project_id,screen_artifact_id,author_id,author_name,text,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
          args: [
            randomUUID(),
            b.id,
            ...scoped(user, scope),
            user.id,
            user.name,
            text,
            new Date().toISOString(),
          ],
        });
        await tx.commit();
      } catch (e) {
        await tx.rollback();
        throw e;
      } finally {
        tx.close();
      }
      return json({ saved: true });
    }
    if (
      (resource === "memos" || /^memos\/[^/]+$/.test(resource)) &&
      ["POST", "PATCH", "DELETE"].includes(method)
    ) {
      const tx = await db().transaction("write");
      try {
        await access(user, scope, true, tx);
        const b = await boardRow(user, scope, tx);
        if (!b) throw new HttpError(409, "먼저 저장해 주세요.");
        const id =
          resource.split("/")[1] ??
          (typeof input.id === "string" ? input.id : randomUUID());
        const old = (
          await tx.execute({
            sql: "SELECT * FROM planning_board_memos WHERE id=? AND workspace_id=? AND project_id=? AND screen_artifact_id=? AND board_id=?",
            args: [id, ...scoped(user, scope), b.id],
          })
        ).rows[0];
        if (method !== "POST" && !old)
          throw new HttpError(404, "메모를 찾을 수 없습니다.");
        if (old && input.version !== Number(old.version))
          throw new HttpError(
            409,
            "다른 사용자가 메모를 변경했습니다. 다시 불러와 주세요.",
          );
        if (method === "DELETE")
          await tx.execute({
            sql: "DELETE FROM planning_board_memos WHERE id=? AND workspace_id=? AND project_id=? AND screen_artifact_id=? AND board_id=?",
            args: [id, ...scoped(user, scope), b.id],
          });
        else {
          const data = {
            text: "",
            x: 0,
            y: 0,
            width: 220,
            height: 160,
            backgroundColor: "#fff7ad",
            opacity: 1,
            ...(old ? JSON.parse(String(old.data_json)) : {}),
            ...input,
          };
          if (
            typeof data.text !== "string" ||
            data.text.length > 2000 ||
            typeof data.backgroundColor !== "string" ||
            !/^#[0-9a-f]{6}$/i.test(data.backgroundColor)
          )
            throw new HttpError(400, "메모 내용을 확인해 주세요.");
          for (const key of ["x", "y", "width", "height", "opacity"])
            if (!Number.isFinite(data[key]))
              throw new HttpError(400, "메모 좌표를 확인해 주세요.");
          if (
            Math.abs(data.x) > 12000 ||
            Math.abs(data.y) > 12000 ||
            data.width < 140 ||
            data.width > 600 ||
            data.height < 100 ||
            data.height > 600 ||
            data.opacity < 0 ||
            data.opacity > 1
          )
            throw new HttpError(400, "메모 크기 또는 투명도를 확인해 주세요.");
          const now = new Date().toISOString();
          if (old)
            await tx.execute({
              sql: "UPDATE planning_board_memos SET data_json=?,version=version+1,updated_by=?,updated_at=? WHERE id=? AND workspace_id=? AND project_id=? AND screen_artifact_id=? AND board_id=?",
              args: [
                JSON.stringify(data),
                user.id,
                now,
                id,
                ...scoped(user, scope),
                b.id,
              ],
            });
          else
            await tx.execute({
              sql: "INSERT INTO planning_board_memos(id,board_id,workspace_id,project_id,screen_artifact_id,author_id,updated_by,data_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
              args: [
                id,
                b.id,
                ...scoped(user, scope),
                user.id,
                user.id,
                JSON.stringify(data),
                now,
                now,
              ],
            });
          await tx.commit();
          return json({
            saved: true,
            memo: {
              ...data,
              id,
              version: Number(old?.version ?? 0) + 1,
              createdAt: old?.created_at ?? now,
              updatedAt: now,
            },
          });
        }
        await tx.commit();
        return json({ saved: true, deleted: true });
      } catch (e) {
        await tx.rollback();
        throw e;
      } finally {
        tx.close();
      }
    }
    throw new HttpError(404, "지원하지 않는 플래닝보드 경로입니다.");
  } catch (e) {
    return errorResponse(e);
  }
}
function json(data: unknown) {
  return Response.json(data, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
async function readJson(request: Request): Promise<Record<string, unknown>> {
  const raw = (await requestBytes(request, 5 * 1024 * 1024)).toString("utf8");
  if (Buffer.byteLength(raw) > 5 * 1024 * 1024)
    throw new HttpError(413, "요청 크기는 최대 5MiB입니다.");
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw Error();
    return value;
  } catch {
    throw new HttpError(400, "올바른 JSON이 필요합니다.");
  }
}
