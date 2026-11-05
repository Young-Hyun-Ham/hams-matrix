import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { Row } from "@libsql/client";
import type { User } from "@/lib/types";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/auth";
import { requireProjectPermission } from "@/lib/project-permissions";
import { getDocument, putDocument, removeDocument } from "@/lib/r2";
import { access, boardRow, type Scope, type Executor } from "./access";
import { validateDocument } from "./document-validation";
import { assetUrl, parseAssetUrl } from "../asset-url";
import { builtinTemplates } from "../../types/templates";
import {
  templateAssetId,
  templateAssetReference,
  validateTemplateDocument,
} from "./template-validation";

const MAX_TEMPLATES = 100;
const hash = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex");
const summary = (row: Row) => ({
  id: String(row.id),
  name: String(row.name),
  kind: "custom" as const,
  createdAt: String(row.created_at),
});
async function projectRead(
  user: User,
  projectId: string,
  executor: Executor = db(),
) {
  return requireProjectPermission(executor, user, projectId, "screen", "READ");
}
async function sourceAccess(
  user: User,
  scope: Scope,
  executor: Executor = db(),
) {
  const result = await access(user, scope, true, executor);
  if (result.permissions.projectRole !== "owner")
    throw new HttpError(403, "프로젝트 owner만 템플릿을 생성할 수 있습니다.");
  if ((await boardRow(user, scope, executor))?.status === "review")
    throw new HttpError(409, "검토 중에는 템플릿을 생성할 수 없습니다.");
}
async function targetAccess(
  user: User,
  scope: Scope,
  executor: Executor = db(),
) {
  await access(user, scope, true, executor);
  if ((await boardRow(user, scope, executor))?.status === "review")
    throw new HttpError(409, "검토 중에는 템플릿을 적용할 수 없습니다.");
}
async function templateRow(
  user: User,
  projectId: string,
  templateId: string,
  executor: Executor = db(),
) {
  const row = (
    await executor.execute({
      sql: "SELECT * FROM planning_project_templates WHERE id=? AND project_id=? AND workspace_id=? AND status='ready'",
      args: [templateId, projectId, user.workspaceId],
    })
  ).rows[0];
  if (!row) throw new HttpError(404, "프로젝트 템플릿을 찾을 수 없습니다.");
  return row;
}
async function cleanPendingTemplate(user: User, projectId: string, id: string) {
  const assets = (
    await db().execute({
      sql: "SELECT object_key FROM planning_project_template_assets WHERE template_id=? AND project_id=? AND workspace_id=?",
      args: [id, projectId, user.workspaceId],
    })
  ).rows;
  const removed = await Promise.allSettled(
    assets.map((asset) => removeDocument(String(asset.object_key))),
  );
  if (removed.some((item) => item.status === "rejected")) return;
  const tx = await db().transaction("write");
  try {
    const pending = (
      await tx.execute({
        sql: "SELECT id FROM planning_project_templates WHERE id=? AND project_id=? AND workspace_id=? AND status='pending'",
        args: [id, projectId, user.workspaceId],
      })
    ).rows[0];
    if (pending) {
      await tx.execute({
        sql: "DELETE FROM planning_project_template_assets WHERE template_id=? AND project_id=? AND workspace_id=?",
        args: [id, projectId, user.workspaceId],
      });
      await tx.execute({
        sql: "DELETE FROM planning_project_templates WHERE id=? AND project_id=? AND workspace_id=? AND status='pending'",
        args: [id, projectId, user.workspaceId],
      });
    }
    await tx.commit();
  } catch (error) {
    await tx.rollback();
    throw error;
  } finally {
    tx.close();
  }
}
export async function listProjectTemplates(user: User, projectId: string) {
  await projectRead(user, projectId);
  const rows = (
    await db().execute({
      sql: "SELECT id,name,created_at FROM planning_project_templates WHERE workspace_id=? AND project_id=? AND status='ready' ORDER BY created_at DESC,id",
      args: [user.workspaceId, projectId],
    })
  ).rows;
  return { templates: [...builtinTemplates, ...rows.map(summary)] };
}
export async function readProjectTemplate(
  user: User,
  projectId: string,
  templateId: string,
) {
  await projectRead(user, projectId);
  const row = await templateRow(user, projectId, templateId);
  return {
    ...summary(row),
    template: validateTemplateDocument(JSON.parse(String(row.document_json))),
  };
}
export async function createProjectTemplate(
  user: User,
  projectId: string,
  input: Record<string, unknown>,
) {
  if (
    typeof input.sourceScreenId !== "string" ||
    typeof input.name !== "string" ||
    typeof input.requestId !== "string" ||
    !input.requestId ||
    input.requestId.length > 128
  )
    throw new HttpError(400, "템플릿 이름과 원본 화면을 확인해 주세요.");
  const scope = { projectId, screenId: input.sourceScreenId };
  await sourceAccess(user, scope);
  const name = input.name.normalize("NFC").trim(),
    nameKey = name.toLowerCase();
  if (!name || name.length > 80)
    throw new HttpError(400, "템플릿 이름은 1~80자로 입력해 주세요.");
  const source = validateDocument(input.document, scope),
    inputHash = hash(
      JSON.stringify({
        name,
        sourceScreenId: scope.screenId,
        document: source,
      }),
    );
  const expired = (
    await db().execute({
      sql: "SELECT id FROM planning_project_templates WHERE workspace_id=? AND project_id=? AND status='pending' AND expires_at<=? LIMIT 5",
      args: [user.workspaceId, projectId, new Date().toISOString()],
    })
  ).rows;
  for (const row of expired)
    await cleanPendingTemplate(user, projectId, String(row.id));
  const id = randomUUID(),
    now = new Date().toISOString(),
    expires = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const copies: { source: Row; id: string; key: string }[] = [];
  const document = structuredClone(source);
  const tx = await db().transaction("write");
  try {
    await sourceAccess(user, scope, tx);
    const previous = (
      await tx.execute({
        sql: "SELECT * FROM planning_project_templates WHERE workspace_id=? AND project_id=? AND created_by=? AND request_id=?",
        args: [user.workspaceId, projectId, user.id, input.requestId],
      })
    ).rows[0];
    if (previous) {
      if (previous.input_hash !== inputHash)
        throw new HttpError(
          409,
          "같은 요청 번호에 다른 템플릿 내용이 있습니다.",
        );
      if (previous.status !== "ready")
        throw new HttpError(
          409,
          "템플릿 생성 중입니다. 잠시 후 다시 시도해 주세요.",
        );
      await tx.commit();
      return { template: summary(previous) };
    }
    if (
      (
        await tx.execute({
          sql: "SELECT id FROM planning_project_templates WHERE workspace_id=? AND project_id=? AND name_key=?",
          args: [user.workspaceId, projectId, nameKey],
        })
      ).rows.length
    )
      throw new HttpError(409, "같은 이름의 프로젝트 템플릿이 있습니다.");
    if (
      Number(
        (
          await tx.execute({
            sql: "SELECT count(*) n FROM planning_project_templates WHERE workspace_id=? AND project_id=?",
            args: [user.workspaceId, projectId],
          })
        ).rows[0].n,
      ) >= MAX_TEMPLATES
    )
      throw new HttpError(413, "프로젝트 템플릿은 최대 100개입니다.");
    const known = new Map<string, string>();
    for (const [layerId, url] of Object.entries(source.layerImages)) {
      const parsed = parseAssetUrl(url)!;
      let nextId = known.get(parsed.assetId);
      if (!nextId) {
        if (copies.length >= 50)
          throw new HttpError(413, "템플릿 이미지는 최대 50개입니다.");
        const asset = (
          await tx.execute({
            sql: "SELECT * FROM planning_board_assets WHERE id=? AND workspace_id=? AND project_id=? AND screen_artifact_id=?",
            args: [parsed.assetId, user.workspaceId, projectId, scope.screenId],
          })
        ).rows[0];
        if (
          !asset ||
          (asset.status === "pending" &&
            (asset.created_by !== user.id || String(asset.expires_at) <= now))
        )
          throw new HttpError(403, "원본 이미지 첨부 범위를 확인해 주세요.");
        nextId = randomUUID();
        known.set(parsed.assetId, nextId);
        copies.push({
          source: asset,
          id: nextId,
          key: `planning-templates/${user.workspaceId}/${projectId}/${id}/${nextId}`,
        });
      }
      document.layerImages[layerId] = templateAssetReference(nextId);
    }
    validateTemplateDocument(document);
    await tx.execute({
      sql: "INSERT INTO planning_project_templates(id,workspace_id,project_id,name,name_key,document_json,source_screen_id,created_by,created_at,status,expires_at,request_id,input_hash) VALUES (?,?,?,?,?,?,?,?,?,'pending',?,?,?)",
      args: [
        id,
        user.workspaceId,
        projectId,
        name,
        nameKey,
        JSON.stringify(document),
        scope.screenId,
        user.id,
        now,
        expires,
        input.requestId,
        inputHash,
      ],
    });
    for (const copy of copies)
      await tx.execute({
        sql: "INSERT INTO planning_project_template_assets(id,template_id,workspace_id,project_id,object_key,mime_type,byte_length,hash,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
        args: [
          copy.id,
          id,
          user.workspaceId,
          projectId,
          copy.key,
          copy.source.mime_type,
          copy.source.byte_length,
          copy.source.hash,
          now,
        ],
      });
    await tx.commit();
  } catch (error) {
    await tx.rollback();
    throw error;
  } finally {
    tx.close();
  }
  try {
    for (const copy of copies) {
      const bytes = await getDocument(String(copy.source.object_key));
      if (
        bytes.length !== Number(copy.source.byte_length) ||
        hash(bytes) !== copy.source.hash
      )
        throw new HttpError(400, "원본 이미지 무결성을 확인할 수 없습니다.");
      await putDocument(copy.key, Buffer.from(bytes));
    }
    const finish = await db().transaction("write");
    try {
      await sourceAccess(user, scope, finish);
      await finish.execute({
        sql: "UPDATE planning_project_templates SET status='ready',expires_at=NULL WHERE id=? AND project_id=? AND workspace_id=? AND status='pending'",
        args: [id, projectId, user.workspaceId],
      });
      await finish.commit();
    } catch (error) {
      await finish.rollback();
      throw error;
    } finally {
      finish.close();
    }
    return { template: { id, name, kind: "custom" as const, createdAt: now } };
  } catch (error) {
    await db()
      .execute({
        sql: "UPDATE planning_project_templates SET expires_at=? WHERE id=? AND workspace_id=? AND project_id=? AND status='pending'",
        args: [new Date().toISOString(), id, user.workspaceId, projectId],
      })
      .catch(() => {});
    await cleanPendingTemplate(user, projectId, id).catch(() => {});
    throw error instanceof HttpError
      ? error
      : new HttpError(
          503,
          "템플릿 이미지를 저장하지 못했습니다. 다시 시도해 주세요.",
        );
  }
}

export async function applyProjectTemplate(
  user: User,
  scope: Scope,
  templateId: string,
) {
  await targetAccess(user, scope);
  const row = await templateRow(user, scope.projectId, templateId),
    template = validateTemplateDocument(JSON.parse(String(row.document_json)));
  const assets = (
    await db().execute({
      sql: "SELECT * FROM planning_project_template_assets WHERE template_id=? AND project_id=? AND workspace_id=?",
      args: [templateId, scope.projectId, user.workspaceId],
    })
  ).rows;
  const byId = new Map(assets.map((asset) => [String(asset.id), asset]));
  const copies = [
    ...new Set(Object.values(template.layerImages).map(templateAssetId)),
  ].map((id) => {
    const source = byId.get(id);
    if (!source) throw new HttpError(400, "템플릿 이미지가 없습니다.");
    const nextId = randomUUID();
    return {
      source,
      id: nextId,
      key: `planning/${user.workspaceId}/${scope.projectId}/${scope.screenId}/${nextId}`,
    };
  });
  const now = new Date().toISOString(),
    expires = new Date(Date.now() + 86400000).toISOString();
  const reserve = await db().transaction("write");
  try {
    await targetAccess(user, scope, reserve);
    const count = Number(
      (
        await reserve.execute({
          sql: "SELECT count(*) n FROM planning_board_assets WHERE workspace_id=? AND project_id=? AND screen_artifact_id=? AND (status='attached' OR expires_at>?)",
          args: [user.workspaceId, scope.projectId, scope.screenId, now],
        })
      ).rows[0].n,
    );
    if (count + copies.length > 50)
      throw new HttpError(413, "화면당 이미지는 최대 50개입니다.");
    const board = await boardRow(user, scope, reserve);
    for (const copy of copies)
      await reserve.execute({
        sql: "INSERT INTO planning_board_assets(id,board_id,workspace_id,project_id,screen_artifact_id,draft_id,object_key,mime_type,byte_length,hash,created_by,status,expires_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,'pending',?,?)",
        args: [
          copy.id,
          board?.id ?? null,
          user.workspaceId,
          scope.projectId,
          scope.screenId,
          user.id,
          copy.key,
          copy.source.mime_type,
          copy.source.byte_length,
          copy.source.hash,
          user.id,
          expires,
          now,
        ],
      });
    await reserve.commit();
  } catch (error) {
    await reserve.rollback();
    throw error;
  } finally {
    reserve.close();
  }
  try {
    for (const copy of copies) {
      const bytes = await getDocument(String(copy.source.object_key));
      if (
        bytes.length !== Number(copy.source.byte_length) ||
        hash(bytes) !== copy.source.hash
      )
        throw new HttpError(400, "템플릿 이미지 무결성 오류입니다.");
      await putDocument(copy.key, Buffer.from(bytes));
    }
    await targetAccess(user, scope);
    const urls = new Map(
      copies.map((copy) => [String(copy.source.id), assetUrl(scope, copy.id)]),
    );
    const document = validateDocument(
      {
        ...template,
        layerImages: Object.fromEntries(
          Object.entries(template.layerImages).map(([layerId, value]) => [
            layerId,
            urls.get(templateAssetId(value))!,
          ]),
        ),
      },
      scope,
    );
    return { document };
  } catch (error) {
    for (const copy of copies) {
      try {
        await removeDocument(copy.key);
        await db().execute({
          sql: "DELETE FROM planning_board_assets WHERE id=? AND workspace_id=? AND project_id=? AND screen_artifact_id=? AND status='pending'",
          args: [copy.id, user.workspaceId, scope.projectId, scope.screenId],
        });
      } catch {
        /* Existing pending asset expiration retries cleanup. */
      }
    }
    throw error instanceof HttpError
      ? error
      : new HttpError(
          503,
          "템플릿 이미지를 불러오지 못했습니다. 다시 시도해 주세요.",
        );
  }
}
