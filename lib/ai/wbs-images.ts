import "server-only";
import { randomUUID } from "node:crypto";
import type { Client } from "@libsql/client";
import type { User } from "../types";
import type { GeneratedImageInfo } from "../generated-image-types";
import { HttpError } from "../auth";
import { db } from "../db";
import { projectAccess, toArtifact } from "../artifacts";
import { wbsImagePrompt, wbsSourceHash } from "./wbs-image-prompt";
import { encryptImage, decryptImage, imageEncryptionKey } from "./image-crypto";
import { createTokenTracker } from "./token-usage";
import { reserveQuota, settleQuota, releaseQuota } from "@/lib/quotas";
import { generateAiPng, imageModels } from "./image-generation";

type Executor = Pick<Client, "execute">;
const metadataColumns =
  "project_id,workspace_id,id,source_hash,model,prompt,created_at,created_by,mime_type,byte_length,width,height";

export async function wbsFor(
  executor: Executor,
  user: User,
  projectId: string,
  write = false,
) {
  const project = await projectAccess(executor, user, projectId, write);
  const result = await executor.execute({
    sql: "SELECT * FROM project_artifacts WHERE project_id=? AND workspace_id=? AND kind='wbs' AND deleted_at IS NULL ORDER BY id",
    args: [projectId, user.workspaceId],
  });
  const tasks = result.rows.map((row) => toArtifact(row));
  return {
    tasks,
    projectName: String(project.name),
    sourceHash: wbsSourceHash(String(project.name), tasks),
  };
}

function imageInfo(row: Record<string, unknown>): GeneratedImageInfo {
  return {
    id: String(row.id),
    sourceHash: String(row.source_hash),
    model: String(row.model),
    prompt: String(row.prompt),
    createdAt: String(row.created_at),
    width: Number(row.width),
    height: Number(row.height),
    byteLength: Number(row.byte_length),
    url: `/api/projects/${encodeURIComponent(String(row.project_id))}/wbs/image/content?imageId=${encodeURIComponent(String(row.id))}`,
  };
}

export async function savedWbsImage(
  executor: Executor,
  workspaceId: string,
  projectId: string,
) {
  const result = await executor.execute({
    sql: `SELECT ${metadataColumns} FROM wbs_images WHERE project_id=? AND workspace_id=?`,
    args: [projectId, workspaceId],
  });
  return result.rows[0] ? imageInfo(result.rows[0]) : null;
}

function associatedData(row: Record<string, unknown>) {
  return Buffer.from(
    JSON.stringify([
      "wbs-image",
      1,
      row.workspace_id,
      row.project_id,
      row.id,
      row.source_hash,
      row.model,
      row.prompt,
      row.created_at,
      row.created_by,
      row.mime_type,
      Number(row.byte_length),
      Number(row.width),
      Number(row.height),
    ]),
  );
}

export async function readWbsImage(
  user: User,
  projectId: string,
  imageId: string | null,
) {
  await projectAccess(db(), user, projectId);
  const result = await db().execute({
    sql: "SELECT * FROM wbs_images WHERE project_id=? AND workspace_id=? AND id=?",
    args: [projectId, user.workspaceId, imageId ?? ""],
  });
  const row = result.rows[0];
  if (!row)
    throw new HttpError(
      404,
      "이미지를 찾을 수 없습니다. 최신 이미지를 다시 불러와 주세요.",
    );
  const bytes = decryptImage(
    {
      key_id: row.key_id,
      encryption_version: row.encryption_version,
      iv_base64: row.iv_base64,
      tag_base64: row.tag_base64,
      ciphertext_base64: row.ciphertext_base64,
    },
    associatedData(row),
  );
  return { bytes, info: imageInfo(row) };
}

export async function createWbsImage(
  user: User,
  projectId: string,
  input: Record<string, unknown>,
) {
  const source = await wbsFor(db(), user, projectId, true);
  const current = await savedWbsImage(db(), user.workspaceId, projectId);
  if (input.regenerate !== undefined && typeof input.regenerate !== "boolean")
    throw new HttpError(400, "이미지 생성 요청을 확인해 주세요.");
  if (current && input.regenerate !== true)
    return { image: current, sourceHash: source.sourceHash, reused: true };
  if (
    input.regenerate === true &&
    (!current || input.expectedImageId !== current.id)
  )
    throw new HttpError(
      409,
      "다른 사용자가 이미지를 변경했습니다. 최신 이미지를 다시 불러와 주세요.",
    );
  if (!source.tasks.length)
    throw new HttpError(400, "WBS 작업을 먼저 등록해 주세요.");
  if (input.sourceHash !== source.sourceHash)
    throw new HttpError(
      409,
      "WBS가 변경되었습니다. 창을 다시 열고 최신 데이터로 생성해 주세요.",
    );
  if (
    typeof input.model !== "string" ||
    typeof input.prompt !== "string" ||
    input.prompt.length > 1000
  )
    throw new HttpError(
      400,
      "이미지 모델과 추가 요청을 확인해 주세요. (추가 요청 최대 1,000자)",
    );
  imageEncryptionKey();
  const { models } = await imageModels();
  if (!models.includes(input.model))
    throw new HttpError(400, "사용 가능한 이미지 모델을 선택해 주세요.");
  let prompt: string;
  try {
    prompt = wbsImagePrompt(
      source.projectName,
      source.tasks,
      input.prompt.trim(),
    );
  } catch (error) {
    throw new HttpError(
      413,
      error instanceof Error ? error.message : "WBS 데이터를 확인해 주세요.",
    );
  }
  const token = randomUUID(),
    now = Date.now();
  const acquired = await db().execute({
    sql: `INSERT INTO wbs_image_generations(project_id,workspace_id,token,expires_at) VALUES (?,?,?,?)
      ON CONFLICT(project_id) DO UPDATE SET token=excluded.token,expires_at=excluded.expires_at WHERE wbs_image_generations.expires_at < ? RETURNING token`,
    args: [projectId, user.workspaceId, token, now + 300000, now],
  });
  if (!acquired.rows.length)
    throw new HttpError(
      409,
      "이 프로젝트의 WBS 이미지를 생성하고 있습니다. 잠시 후 다시 확인해 주세요.",
    );
  try {
    const latest = await savedWbsImage(db(), user.workspaceId, projectId);
    if (latest && input.regenerate !== true)
      return { image: latest, sourceHash: source.sourceHash, reused: true };
    if (input.regenerate === true && latest?.id !== input.expectedImageId)
      throw new HttpError(
        409,
        "저장 이미지가 변경되었습니다. 최신 이미지를 다시 불러와 주세요.",
      );
    const quotaId = `image:${token}`;
    await reserveQuota(user.id, quotaId, "images", 1);
    const track = createTokenTracker({
      workspaceId: user.workspaceId,
      userId: user.id,
      projectId,
      projectName: "",
      convId: "image-generation",
      conversationTitle: "이미지 생성",
      chatId: token,
      requestId: `image:${token}`,
      model: input.model,
      prompt,
    });
    let generated;
    let providerStarted = false;
    try {
      await track({ turn: 0, status: "started", reservedTokens: 65536 });
      providerStarted = true;
      generated = await generateAiPng(input.model, prompt, true);
    } catch (error) {
      // Explicit provider rejection is safe to release; transport uncertainty keeps the reservation.
      if (
        !providerStarted ||
        (error instanceof HttpError && [403, 429, 503].includes(error.status))
      )
        await releaseQuota(quotaId);
      await track({
        turn: 0,
        status: "failed",
        httpStatus: error instanceof HttpError ? error.status : undefined,
      });
      throw error;
    }
    await settleQuota(quotaId, 1);
    await track({ turn: 0, status: "completed", usage: generated.usage });
    const row = {
      project_id: projectId,
      workspace_id: user.workspaceId,
      id: randomUUID(),
      source_hash: source.sourceHash,
      model: input.model,
      prompt: input.prompt.trim(),
      created_at: new Date().toISOString(),
      created_by: user.id,
      mime_type: "image/png",
      byte_length: generated.bytes.length,
      width: generated.width,
      height: generated.height,
    };
    const encrypted = encryptImage(generated.bytes, associatedData(row));
    const tx = await db().transaction("write");
    try {
      const checked = await wbsFor(tx, user, projectId, true);
      if (checked.sourceHash !== source.sourceHash)
        throw new HttpError(
          409,
          "생성 중 WBS가 변경되었습니다. 최신 데이터로 다시 생성해 주세요.",
        );
      const lock = await tx.execute({
        sql: "SELECT token FROM wbs_image_generations WHERE project_id=?",
        args: [projectId],
      });
      if (lock.rows[0]?.token !== token)
        throw new HttpError(
          409,
          "생성 요청이 만료되었습니다. 최신 이미지를 확인해 주세요.",
        );
      await tx.execute({
        sql: `INSERT INTO wbs_images(${metadataColumns},encryption_version,key_id,iv_base64,tag_base64,ciphertext_base64)
          VALUES (${Array(17).fill("?").join(",")}) ON CONFLICT(project_id) DO UPDATE SET
          id=excluded.id,source_hash=excluded.source_hash,model=excluded.model,prompt=excluded.prompt,
          created_at=excluded.created_at,created_by=excluded.created_by,mime_type=excluded.mime_type,
          byte_length=excluded.byte_length,width=excluded.width,height=excluded.height,
          encryption_version=excluded.encryption_version,key_id=excluded.key_id,iv_base64=excluded.iv_base64,
          tag_base64=excluded.tag_base64,ciphertext_base64=excluded.ciphertext_base64`,
        args: [
          row.project_id,
          row.workspace_id,
          row.id,
          row.source_hash,
          row.model,
          row.prompt,
          row.created_at,
          row.created_by,
          row.mime_type,
          row.byte_length,
          row.width,
          row.height,
          encrypted.encryption_version,
          encrypted.key_id,
          encrypted.iv_base64,
          encrypted.tag_base64,
          encrypted.ciphertext_base64,
        ],
      });
      await tx.commit();
    } finally {
      tx.close();
    }
    return {
      image: imageInfo(row),
      sourceHash: source.sourceHash,
      reused: false,
    };
  } finally {
    await db().execute({
      sql: "DELETE FROM wbs_image_generations WHERE project_id=? AND token=?",
      args: [projectId, token],
    });
  }
}
