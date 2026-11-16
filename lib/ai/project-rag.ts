import "server-only";
import { randomUUID } from "node:crypto";
import type { Client, Row } from "@libsql/client";
import { db } from "../db";
import type { User } from "../types";
import { HttpError } from "../auth";
import { assertAiEnabled } from "./guardrail-policy";
import { ragAccess } from "./project-rag-permissions";
import {
  apiKeyInput,
  credentialFingerprint,
  encryptCredential,
  decryptCredential,
} from "./credentials";
import { embeddingModel, embeddingModels } from "./embeddings";
import { ragHash } from "./rag-chunks";
import { collectRagSources, manifestHash } from "./rag-sources";
import type { RagJob, RagSummary } from "./rag-types";
type Executor = Pick<Client, "execute">;
export function jobInfo(r: Row): RagJob {
  return {
    model: String(r.job_model ?? ""),
    restartMode: r.restart_mode === "resume" ? "resume" : "new",
    resumedFromJobId: r.resume_from_job_id
      ? String(r.resume_from_job_id)
      : null,
    id: String(r.id),
    status: String(r.status),
    totalSources: Number(r.total_sources),
    processedSources: Number(r.processed_sources),
    totalChunks: Number(r.total_chunks),
    completedChunks: Number(r.completed_chunks),
    skippedSources: Number(r.skipped_sources),
    failedSources: Number(r.failed_sources),
    errorCode: r.error_code ? String(r.error_code) : null,
  };
}
export async function ragCredential(
  user: User,
  projectId: string,
  id?: string,
  executor: Executor = db(),
) {
  const r = (
    await executor.execute({
      sql: id
        ? "SELECT * FROM project_ai_credentials WHERE id=? AND project_id=? AND workspace_id=? AND revoked_at IS NULL"
        : "SELECT c.* FROM project_ai_credentials c JOIN project_rag_configs f ON f.credential_id=c.id AND f.project_id=c.project_id AND f.workspace_id=c.workspace_id WHERE c.project_id=? AND c.workspace_id=? AND c.revoked_at IS NULL",
      args: id
        ? [id, projectId, user.workspaceId]
        : [projectId, user.workspaceId],
    })
  ).rows[0];
  if (!r) throw new HttpError(400, "프로젝트 임베딩 API 키를 입력해 주세요.");
  return { row: r, key: decryptCredential(r, user.workspaceId, projectId) };
}
export async function ragSummary(
  user: User,
  projectId: string,
  checkStale = true,
): Promise<RagSummary> {
  const access = await ragAccess(user, projectId);
  const result = await ragSummaries([projectId], user.workspaceId);
  const summary = result.get(projectId)!;
  summary.canManage = access.canManage;
  if (checkStale && summary.activeGeneration) {
    const gen = (
      await db().execute({
        sql: "SELECT manifest_hash FROM project_rag_generations WHERE id=? AND project_id=? AND workspace_id=?",
        args: [summary.activeGeneration.id, projectId, user.workspaceId],
      })
    ).rows[0];
    summary.stale =
      String(gen?.manifest_hash) !==
      manifestHash(await collectRagSources(user, projectId));
  }
  return summary;
}
// Callers must pass projects already authorized for this workspace.
export async function ragSummaries(
  ids: string[],
  workspaceId: string,
  executor: Executor = db(),
) {
  const result = new Map<string, RagSummary>(
    ids.map((id) => [
      id,
      {
        configVersion: 0,
        canManage: false,
        hasCredential: false,
        activeGeneration: null,
        latestJob: null,
      },
    ]),
  );
  for (let offset = 0; offset < ids.length; offset += 100) {
    const batch = ids.slice(offset, offset + 100);
    const rows = (
      await executor.execute({
        sql: `SELECT f.project_id,f.version,c.revoked_at,c.id AS credential_present,g.id AS generation_id,g.model,g.dimensions,g.published_at,g.coverage_json,j.*,jg.model AS job_model FROM project_rag_configs f LEFT JOIN project_ai_credentials c ON c.id=f.credential_id LEFT JOIN project_rag_generations g ON g.id=f.active_generation_id AND g.status='ready' LEFT JOIN project_rag_jobs j ON j.id=f.last_attempt_job_id LEFT JOIN project_rag_generations jg ON jg.id=j.generation_id AND jg.project_id=f.project_id AND jg.workspace_id=f.workspace_id WHERE f.workspace_id=? AND f.project_id IN (${batch.map(() => "?").join(",")})`,
        args: [workspaceId, ...batch],
      })
    ).rows;
    for (const r of rows)
      result.set(String(r.project_id), {
        configVersion: Number(r.version),
        canManage: false,
        hasCredential: !!r.credential_present && !r.revoked_at,
        activeGeneration: r.generation_id
          ? {
              id: String(r.generation_id),
              model: String(r.model),
              dimensions: Number(r.dimensions),
              publishedAt: String(r.published_at),
              coverage: JSON.parse(String(r.coverage_json)),
            }
          : null,
        latestJob: r.id ? jobInfo(r) : null,
      });
  }
  return result;
}
export async function startRagJob(
  user: User,
  projectId: string,
  input: Record<string, unknown>,
  signal?: AbortSignal,
) {
  await ragAccess(user, projectId, true);
  await assertAiEnabled(user.workspaceId);
  const model = embeddingModel(input.model),
    expected = input.expectedConfigVersion,
    idem = input.idempotencyKey;
  if (
    !Number.isSafeInteger(expected) ||
    Number(expected) < 0 ||
    typeof idem !== "string" ||
    !/^[\w-]{8,100}$/.test(idem)
  )
    throw new HttpError(400, "작업 키와 설정 버전을 확인해 주세요.");
  const key = input.apiKey
    ? apiKeyInput(input.apiKey)
    : (await ragCredential(user, projectId)).key;
  const fingerprint = credentialFingerprint(key),
    hash = ragHash([model, fingerprint, expected]);
  const duplicate = (
    await db().execute({
      sql: "SELECT * FROM project_rag_jobs WHERE workspace_id=? AND project_id=? AND idempotency_key=?",
      args: [user.workspaceId, projectId, idem],
    })
  ).rows[0];
  if (duplicate) {
    if (duplicate.input_hash !== hash)
      throw new HttpError(
        409,
        "같은 작업 키에 다른 입력을 사용할 수 없습니다.",
      );
    return jobInfo({ ...duplicate, job_model: model });
  }
  if (!(await embeddingModels(key, signal)).includes(model))
    throw new HttpError(
      400,
      "이 키로 사용할 수 있는 임베딩 모델을 선택해 주세요.",
    );
  const tx = await db().transaction("write");
  try {
    await ragAccess(user, projectId, true, tx);
    const sameRequest = (
      await tx.execute({
        sql: "SELECT * FROM project_rag_jobs WHERE workspace_id=? AND project_id=? AND idempotency_key=?",
        args: [user.workspaceId, projectId, idem],
      })
    ).rows[0];
    if (sameRequest) {
      if (sameRequest.input_hash !== hash)
        throw new HttpError(
          409,
          "같은 작업 키에 다른 입력을 사용할 수 없습니다.",
        );
      await tx.commit();
      return jobInfo({ ...sameRequest, job_model: model });
    }
    const current = (
      await tx.execute({
        sql: "SELECT * FROM project_rag_configs WHERE project_id=? AND workspace_id=?",
        args: [projectId, user.workspaceId],
      })
    ).rows[0];
    if (Number(current?.version ?? 0) !== expected)
      throw new HttpError(
        409,
        "벡터화 설정이 변경되었습니다. 다시 불러와 주세요.",
      );
    if (
      (
        await tx.execute({
          sql: "SELECT id FROM project_rag_jobs WHERE project_id=? AND workspace_id=? AND status IN ('queued','running','publishing','stop_requested')",
          args: [projectId, user.workspaceId],
        })
      ).rows.length
    )
      throw new HttpError(409, "이 프로젝트의 벡터화가 이미 진행 중입니다.");
    const credentialId = randomUUID(),
      generationId = randomUUID(),
      id = randomUUID(),
      now = new Date().toISOString(),
      version = Number(expected) + 1;
    const encrypted = encryptCredential(
      key,
      credentialId,
      user.workspaceId,
      projectId,
    );
    await tx.execute({
      sql: "INSERT INTO project_ai_credentials(id,workspace_id,project_id,ciphertext,iv,auth_tag,key_id,key_fingerprint,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
      args: [
        credentialId,
        user.workspaceId,
        projectId,
        encrypted.ciphertext,
        encrypted.iv,
        encrypted.authTag,
        encrypted.keyId,
        encrypted.fingerprint,
        user.id,
        now,
      ],
    });
    await tx.execute({
      sql: "INSERT INTO project_rag_generations(id,workspace_id,project_id,status,config_version,model,credential_id,credential_version,started_at) VALUES (?,?,?,'building',?,?,?,?,?)",
      args: [
        generationId,
        user.workspaceId,
        projectId,
        version,
        model,
        credentialId,
        1,
        now,
      ],
    });
    await tx.execute({
      sql: "INSERT INTO project_rag_jobs(id,workspace_id,project_id,generation_id,requested_by,idempotency_key,input_hash,config_version,credential_id,credential_version,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,1,'queued',?)",
      args: [
        id,
        user.workspaceId,
        projectId,
        generationId,
        user.id,
        idem,
        hash,
        version,
        credentialId,
        now,
      ],
    });
    await tx.execute({
      sql: "INSERT INTO project_rag_configs(workspace_id,project_id,model,credential_id,version,last_attempt_job_id,updated_by,updated_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(workspace_id,project_id) DO UPDATE SET model=excluded.model,credential_id=excluded.credential_id,version=excluded.version,last_attempt_job_id=excluded.last_attempt_job_id,updated_by=excluded.updated_by,updated_at=excluded.updated_at",
      args: [
        user.workspaceId,
        projectId,
        model,
        credentialId,
        version,
        id,
        user.id,
        now,
      ],
    });
    await tx.commit();
    return {
      model,
      restartMode: "new",
      resumedFromJobId: null,
      id,
      status: "queued",
      totalSources: 0,
      processedSources: 0,
      totalChunks: 0,
      completedChunks: 0,
      skippedSources: 0,
      failedSources: 0,
      errorCode: null,
    } satisfies RagJob;
  } catch (error) {
    await tx.rollback();
    throw error;
  } finally {
    tx.close();
  }
}
export async function readRagJob(user: User, projectId: string, id: string) {
  await ragAccess(user, projectId);
  const row = (
    await db().execute({
      sql: "SELECT j.*,g.model AS job_model FROM project_rag_jobs j JOIN project_rag_generations g ON g.id=j.generation_id AND g.project_id=j.project_id AND g.workspace_id=j.workspace_id WHERE j.id=? AND j.project_id=? AND j.workspace_id=?",
      args: [id, projectId, user.workspaceId],
    })
  ).rows[0];
  if (!row) throw new HttpError(404, "벡터화 작업을 찾을 수 없습니다.");
  const errors = (
    await db().execute({
      sql: "SELECT source_type,source_id,title,extraction_status,extraction_error_code FROM project_rag_sources WHERE generation_id=? AND project_id=? AND workspace_id=? AND extraction_status IN ('failed','unsupported') ORDER BY id LIMIT 100",
      args: [row.generation_id, projectId, user.workspaceId],
    })
  ).rows;
  return {
    ...jobInfo(row),
    errors: errors.map((r) => ({
      sourceType: String(r.source_type),
      sourceId: String(r.source_id),
      title: String(r.title),
      status: String(r.extraction_status),
      code: String(r.extraction_error_code),
    })),
  };
}
export async function stopRagJob(user: User, projectId: string, id: string) {
  const tx = await db().transaction("write");
  try {
    await ragAccess(user, projectId, true, tx);
    const found = (
      await tx.execute({
        sql: "SELECT id FROM project_rag_jobs WHERE id=? AND project_id=? AND workspace_id=?",
        args: [id, projectId, user.workspaceId],
      })
    ).rows[0];
    if (!found) throw new HttpError(404, "벡터화 작업을 찾을 수 없습니다.");
    await tx.execute({
      sql: "UPDATE project_rag_jobs SET status='stop_requested' WHERE id=? AND project_id=? AND workspace_id=? AND status IN ('queued','running')",
      args: [id, projectId, user.workspaceId],
    });
    await tx.commit();
  } catch (error) {
    await tx.rollback();
    throw error;
  } finally {
    tx.close();
  }
}
