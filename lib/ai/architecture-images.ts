import "server-only";
import { randomUUID } from "node:crypto";
import type { Client } from "@libsql/client";
import type { User } from "../types";
import type { ArchitectureImageInfo } from "../architecture-image-types";
import { HttpError } from "../auth";
import { db } from "../db";
import { projectAccess, toArtifact } from "../artifacts";
import { architectureImagePrompt } from "./architecture-image-prompt";
import { encryptImage, decryptImage, imageEncryptionKey } from "./image-crypto";
import { generateAiPng, imageModels } from "./image-generation";

type Executor = Pick<Client, "execute">;
const metadataColumns = "artifact_id,project_id,workspace_id,id,artifact_version,model,prompt,created_at,created_by,mime_type,byte_length,width,height";

export async function architectureFor(executor: Executor, user: User, projectId: string, artifactId: string, write = false) {
  await projectAccess(executor, user, projectId, write);
  const result = await executor.execute({
    sql: "SELECT * FROM project_artifacts WHERE id=? AND project_id=? AND workspace_id=? AND kind='architecture' AND deleted_at IS NULL",
    args: [artifactId, projectId, user.workspaceId],
  });
  if (!result.rows[0]) throw new HttpError(404, "아키텍처를 찾을 수 없습니다.");
  return toArtifact(result.rows[0]);
}

export function architectureImageInfo(row: Record<string, unknown>): ArchitectureImageInfo {
  return {
    id: String(row.id), artifactId: String(row.artifact_id), artifactVersion: Number(row.artifact_version),
    model: String(row.model), prompt: String(row.prompt), createdAt: String(row.created_at),
    width: Number(row.width), height: Number(row.height), byteLength: Number(row.byte_length),
    url: `/api/projects/${encodeURIComponent(String(row.project_id))}/artifacts/${encodeURIComponent(String(row.artifact_id))}/image/content?imageId=${encodeURIComponent(String(row.id))}`,
  };
}

export async function savedArchitectureImage(executor: Executor, workspaceId: string, projectId: string, artifactId: string) {
  const result = await executor.execute({
    sql: `SELECT ${metadataColumns} FROM architecture_images WHERE artifact_id=? AND project_id=? AND workspace_id=?`,
    args: [artifactId, projectId, workspaceId],
  });
  return result.rows[0] ? architectureImageInfo(result.rows[0]) : null;
}

function associatedData(row: Record<string, unknown>) {
  return Buffer.from(JSON.stringify([
    "architecture-image", 1, row.workspace_id, row.project_id, row.artifact_id, row.id,
    Number(row.artifact_version), row.model, row.prompt, row.created_at, row.created_by,
    row.mime_type, Number(row.byte_length), Number(row.width), Number(row.height),
  ]));
}

export async function readArchitectureImage(user: User, projectId: string, artifactId: string, imageId: string | null) {
  await architectureFor(db(), user, projectId, artifactId);
  const result = await db().execute({
    sql: "SELECT * FROM architecture_images WHERE artifact_id=? AND project_id=? AND workspace_id=? AND id=?",
    args: [artifactId, projectId, user.workspaceId, imageId ?? ""],
  });
  const row = result.rows[0];
  if (!row) throw new HttpError(404, "이미지를 찾을 수 없습니다. 최신 이미지를 다시 불러와 주세요.");
  const bytes = decryptImage({
    key_id: row.key_id, encryption_version: row.encryption_version,
    iv_base64: row.iv_base64, tag_base64: row.tag_base64, ciphertext_base64: row.ciphertext_base64,
  }, associatedData(row));
  return { bytes, info: architectureImageInfo(row) };
}

export async function createArchitectureImage(user: User, projectId: string, artifactId: string, input: Record<string, unknown>) {
  const artifact = await architectureFor(db(), user, projectId, artifactId, true);
  const current = await savedArchitectureImage(db(), user.workspaceId, projectId, artifactId);
  if (input.regenerate !== undefined && typeof input.regenerate !== "boolean") throw new HttpError(400, "이미지 생성 요청을 확인해 주세요.");
  if (current && input.regenerate !== true) return { image: current, reused: true };
  if (input.regenerate === true && (!current || input.expectedImageId !== current.id))
    throw new HttpError(409, "다른 사용자가 이미지를 변경했습니다. 최신 이미지를 다시 불러와 주세요.");
  if (input.artifactVersion !== artifact.version) throw new HttpError(409, "아키텍처가 변경되었습니다. 최신 내용을 불러온 뒤 다시 생성해 주세요.");
  if (typeof input.model !== "string" || typeof input.prompt !== "string" || input.prompt.length > 1000)
    throw new HttpError(400, "이미지 모델과 추가 요청을 확인해 주세요. (추가 요청 최대 1,000자)");
  imageEncryptionKey(); // Fail before a paid request if encryption is unavailable.
  const { models } = await imageModels();
  if (!models.includes(input.model)) throw new HttpError(400, "사용 가능한 이미지 모델을 선택해 주세요.");
  const prompt = architectureImagePrompt(artifact, input.prompt.trim());
  const token = randomUUID(), now = Date.now();
  const acquired = await db().execute({
    sql: `INSERT INTO architecture_image_generations(artifact_id,project_id,workspace_id,token,expires_at) VALUES (?,?,?,?,?)
      ON CONFLICT(artifact_id) DO UPDATE SET token=excluded.token,expires_at=excluded.expires_at WHERE architecture_image_generations.expires_at < ? RETURNING token`,
    args: [artifactId, projectId, user.workspaceId, token, now + 300000, now],
  });
  if (!acquired.rows.length) throw new HttpError(409, "이 아키텍처의 이미지를 생성하고 있습니다. 잠시 후 다시 확인해 주세요.");
  try {
    // A preceding request may have committed between our first lookup and lock acquisition.
    const latest = await savedArchitectureImage(db(), user.workspaceId, projectId, artifactId);
    if (latest && input.regenerate !== true) return { image: latest, reused: true };
    if (input.regenerate === true && latest?.id !== input.expectedImageId)
      throw new HttpError(409, "저장 이미지가 변경되었습니다. 최신 이미지를 다시 불러와 주세요.");
    const generated = await generateAiPng(input.model, prompt);
    const row = {
      artifact_id: artifactId, project_id: projectId, workspace_id: user.workspaceId, id: randomUUID(),
      artifact_version: artifact.version, model: input.model, prompt: input.prompt.trim(),
      created_at: new Date().toISOString(), created_by: user.id, mime_type: "image/png",
      byte_length: generated.bytes.length, width: generated.width, height: generated.height,
    };
    const encrypted = encryptImage(generated.bytes, associatedData(row));
    const tx = await db().transaction("write");
    try {
      // Recheck access, version and lock ownership after the potentially long provider call.
      const checked = await architectureFor(tx, user, projectId, artifactId, true);
      if (checked.version !== artifact.version) throw new HttpError(409, "생성 중 아키텍처가 변경되었습니다. 최신 데이터로 다시 생성해 주세요.");
      const lock = await tx.execute({ sql: "SELECT token FROM architecture_image_generations WHERE artifact_id=?", args: [artifactId] });
      if (lock.rows[0]?.token !== token) throw new HttpError(409, "생성 요청이 만료되었습니다. 최신 이미지를 확인해 주세요.");
      await tx.execute({
        sql: `INSERT INTO architecture_images(${metadataColumns},encryption_version,key_id,iv_base64,tag_base64,ciphertext_base64)
          VALUES (${Array(18).fill("?").join(",")}) ON CONFLICT(artifact_id) DO UPDATE SET
          id=excluded.id,artifact_version=excluded.artifact_version,model=excluded.model,prompt=excluded.prompt,
          created_at=excluded.created_at,created_by=excluded.created_by,mime_type=excluded.mime_type,
          byte_length=excluded.byte_length,width=excluded.width,height=excluded.height,
          encryption_version=excluded.encryption_version,key_id=excluded.key_id,iv_base64=excluded.iv_base64,
          tag_base64=excluded.tag_base64,ciphertext_base64=excluded.ciphertext_base64`,
        args: [row.artifact_id, row.project_id, row.workspace_id, row.id, row.artifact_version, row.model, row.prompt,
          row.created_at, row.created_by, row.mime_type, row.byte_length, row.width, row.height,
          encrypted.encryption_version, encrypted.key_id, encrypted.iv_base64, encrypted.tag_base64, encrypted.ciphertext_base64],
      });
      await tx.commit();
    } finally { tx.close(); }
    return { image: architectureImageInfo(row), reused: false };
  } finally {
    await db().execute({ sql: "DELETE FROM architecture_image_generations WHERE artifact_id=? AND token=?", args: [artifactId, token] });
  }
}
