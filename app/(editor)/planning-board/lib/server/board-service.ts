import "server-only";
import { randomUUID } from "node:crypto";
import { normalizeDocumentImages, parseAssetUrl } from "../asset-url";
import type { Transaction, Row } from "@libsql/client";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/auth";
import type { User } from "@/lib/types";
import {
  persistArtifactRow,
  recordArtifactChange,
  toArtifact,
} from "@/lib/artifacts";
import { projectHistoryEnabled } from "@/lib/plans";
import { access, boardRow, scoped, type Scope } from "./access";
import { validateDocument } from "./document-validation";
export function boardDto(row: Row) {
  const document = normalizeDocumentImages(
    JSON.parse(String(row.document_json)),
    {
      projectId: String(row.project_id),
      screenId: String(row.screen_artifact_id),
    },
  );
  return {
    ...document,
    id: row.id,
    selected: document.activePageId,
    status: row.status,
    version: Number(row.version),
    contentVersion: Number(row.content_version),
  };
}
export async function readBoard(user: User, scope: Scope) {
  const a = await access(user, scope),
    row = await boardRow(user, scope);
  const level = a.permissions.permissionsByTab.screen.UPDATE
    ? a.permissions.ownerId === user.id
      ? "owner"
      : "edit"
    : "view";
  const document = row
    ? boardDto(row)
    : {
        id: scope.screenId,
        title: String(a.screen.title),
        schemaVersion: 1,
        layers: [{ id: "page", name: "Page", kind: "page", children: [] }],
        sizes: {},
        positions: {},
        layerText: {},
        layerImages: {},
        layerStyles: {},
        selected: "page",
        status: "draft",
      };
  const lastReview = row
    ? (
        await db().execute({
          sql: "SELECT message FROM planning_board_review_history WHERE workspace_id=? AND project_id=? AND screen_artifact_id=? AND board_id=? AND action IN ('reject','complete') ORDER BY created_at DESC,id DESC LIMIT 1",
          args: [...scoped(user, scope), row.id],
        })
      ).rows[0]
    : null;
  return {
    board: row ? document : null,
    project: {
      ...document,
      review: lastReview ? { message: String(lastReview.message) } : null,
      isReviewer: row?.status === "review" && row?.reviewer_user_id === user.id,
    },
    access: level,
    version: Number(row?.version ?? 0),
    screenVersion: Number(a.screen.version),
  };
}
export async function saveBoard(
  request: Request,
  user: User,
  scope: Scope,
  input: Record<string, unknown>,
  transaction?: Transaction,
  requestId?: string,
) {
  const document = validateDocument(input.document ?? input, scope),
    tx = transaction ?? (await db().transaction("write"));
  try {
    const a = await access(user, scope, true, tx),
      before = await boardRow(user, scope, tx);
    if (
      !Number.isInteger(input.expectedVersion) ||
      input.expectedVersion !== Number(before?.version ?? 0) ||
      input.expectedScreenVersion !== Number(a.screen.version)
    )
      throw new HttpError(
        409,
        "다른 창에서 문서가 변경되었습니다. 편집 내용을 보관한 후 새로 불러와 주세요.",
      );
    if (before?.status === "review")
      throw new HttpError(409, "검토 중에는 본문을 변경할 수 없습니다.");
    const id = String(before?.id ?? randomUUID()),
      now = new Date().toISOString(),
      version = Number(before?.version ?? 0) + 1,
      contentVersion = Number(before?.content_version ?? 0) + 1;
    const assetIds = new Set<string>();
    for (const url of Object.values(document.layerImages)) {
      const parsed = parseAssetUrl(url);
      if (
        !parsed ||
        parsed.projectId !== scope.projectId ||
        parsed.screenId !== scope.screenId
      )
        throw new HttpError(400, "다른 화면의 이미지입니다.");
      const assetId = parsed.assetId;
      const asset = (
        await tx.execute({
          sql: "SELECT * FROM planning_board_assets WHERE id=? AND workspace_id=? AND project_id=? AND screen_artifact_id=?",
          args: [assetId, ...scoped(user, scope)],
        })
      ).rows[0];
      if (
        !asset ||
        (asset.board_id !== null && asset.board_id !== id) ||
        (asset.status === "pending" &&
          (asset.created_by !== user.id || String(asset.expires_at) <= now))
      )
        throw new HttpError(403, "이미지 첨부 범위를 확인해 주세요.");
      assetIds.add(assetId);
    }
    if (before)
      await tx.execute({
        sql: "UPDATE planning_boards SET document_json=?,version=?,content_version=?,status='draft',reviewer_user_id=NULL,review_content_version=NULL,updated_by=?,updated_at=? WHERE id=? AND workspace_id=? AND project_id=? AND screen_artifact_id=?",
        args: [
          JSON.stringify(document),
          version,
          contentVersion,
          user.id,
          now,
          id,
          ...scoped(user, scope),
        ],
      });
    else
      await tx.execute({
        sql: "INSERT INTO planning_boards(id,workspace_id,project_id,screen_artifact_id,document_json,created_by,updated_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
        args: [
          id,
          ...scoped(user, scope),
          JSON.stringify(document),
          user.id,
          user.id,
          now,
          now,
        ],
      });
    for (const assetId of assetIds)
      await tx.execute({
        sql: "UPDATE planning_board_assets SET board_id=?,status='attached',expires_at=NULL WHERE id=? AND workspace_id=? AND project_id=? AND screen_artifact_id=?",
        args: [id, assetId, ...scoped(user, scope)],
      });
    if (await projectHistoryEnabled(scope.projectId, tx))
      await tx.execute({
        sql: "INSERT INTO planning_board_revisions(id,board_id,workspace_id,project_id,screen_artifact_id,content_version,snapshot_json,actor_id,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
        args: [
          randomUUID(),
          id,
          ...scoped(user, scope),
          contentVersion,
          JSON.stringify(document),
          user.id,
          now,
        ],
      });
    const edges = (
      await tx.execute({
        sql: "SELECT target_id FROM artifact_links WHERE source_id=? AND project_id=? AND workspace_id=? AND relation='reference'",
        args: [scope.screenId, scope.projectId, user.workspaceId],
      })
    ).rows;
    const screenBefore = toArtifact(
      a.screen,
      edges.map((e) => String(e.target_id)),
    );
    const screenAfter = {
      ...screenBefore,
      structure: {
        ...screenBefore.structure,
        planningBoard: { id, contentVersion },
      },
      version: screenBefore.version + 1,
      updatedAt: now,
    };
    await persistArtifactRow(tx, user, screenAfter, screenBefore, "UPDATE");
    await recordArtifactChange(
      tx,
      request,
      user,
      screenAfter,
      screenBefore,
      "UPDATE",
    );
    await tx.execute({
      sql: "INSERT INTO planning_board_review_history(id,board_id,workspace_id,project_id,screen_artifact_id,action,from_status,to_status,actor_id,actor_role,content_version,message,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
      args: [
        randomUUID(),
        id,
        ...scoped(user, scope),
        "save",
        String(before?.status ?? "draft"),
        "draft",
        user.id,
        a.permissions.projectRole,
        contentVersion,
        "",
        now,
      ],
    });
    const result = {
      id,
      saved: true,
      access: a.permissions.ownerId === user.id ? "owner" : "edit",
      version,
      screenVersion: screenAfter.version,
      contentVersion,
    };
    if (requestId)
      await tx.execute({
        sql: "UPDATE planning_board_ai_requests SET status='completed',board_id=?,result_version=?,result_json=?,finished_at=? WHERE request_id=? AND user_id=? AND workspace_id=? AND project_id=? AND screen_artifact_id=? AND status='running'",
        args: [
          id,
          version,
          JSON.stringify(result),
          now,
          requestId,
          user.id,
          ...scoped(user, scope),
        ],
      });
    if (!transaction) await tx.commit();
    return result;
  } catch (e) {
    if (!transaction) await tx.rollback();
    throw e;
  } finally {
    if (!transaction) tx.close();
  }
}
