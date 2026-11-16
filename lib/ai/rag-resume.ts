import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "../db";
import { HttpError } from "../auth";
import type { User } from "../types";
import { ragAccess } from "./project-rag-permissions";
import { assertAiEnabled } from "./guardrail-policy";
import { jobInfo, ragCredential } from "./project-rag";
import {
  apiKeyInput,
  credentialFingerprint,
  encryptCredential,
} from "./credentials";
import { embeddingModels } from "./embeddings";
import { collectRagSources, manifestHash } from "./rag-sources";
import { ragHash } from "./rag-chunks";

export async function resumeRagJob(
  user: User,
  projectId: string,
  failedJobId: string,
  input: Record<string, unknown>,
  signal?: AbortSignal,
) {
  await ragAccess(user, projectId, true);
  await assertAiEnabled(user.workspaceId);
  const expected = input.expectedConfigVersion,
    idem = input.idempotencyKey;
  if (
    !Number.isSafeInteger(expected) ||
    Number(expected) < 1 ||
    typeof idem !== "string" ||
    !/^[\w-]{8,100}$/.test(idem) ||
    Object.keys(input).some(
      (k) => !["apiKey", "expectedConfigVersion", "idempotencyKey"].includes(k),
    )
  )
    throw new HttpError(400, "재개할 작업과 설정 버전을 확인해 주세요.");
  const parent = (
    await db().execute({
      sql: "SELECT j.*,g.model AS job_model FROM project_rag_jobs j JOIN project_rag_generations g ON g.id=j.generation_id AND g.project_id=j.project_id AND g.workspace_id=j.workspace_id WHERE j.id=? AND j.project_id=? AND j.workspace_id=?",
      args: [failedJobId, projectId, user.workspaceId],
    })
  ).rows[0];
  if (!parent) throw new HttpError(404, "재개할 실패 작업을 찾을 수 없습니다.");
  const key = input.apiKey
    ? apiKeyInput(input.apiKey)
    : (await ragCredential(user, projectId, String(parent.credential_id))).key;
  const hash = ragHash([
    "resume",
    failedJobId,
    parent.job_model,
    credentialFingerprint(key),
    expected,
  ]);
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
        "같은 작업 키에 다른 재개 요청을 사용할 수 없습니다.",
      );
    return jobInfo({ ...duplicate, job_model: parent.job_model });
  }
  if (parent.status !== "failed")
    throw new HttpError(409, "실패한 작업만 이어서 시작할 수 있습니다.");
  if (!(await embeddingModels(key, signal)).includes(String(parent.job_model)))
    throw new HttpError(
      400,
      "이 키로 기존 임베딩 모델을 사용할 수 없습니다. 같은 모델을 사용할 수 있는 키를 입력해 주세요.",
    );
  const tx = await db().transaction("write");
  try {
    await ragAccess(user, projectId, true, tx);
    await assertAiEnabled(user.workspaceId, tx);
    const repeated = (
      await tx.execute({
        sql: "SELECT * FROM project_rag_jobs WHERE workspace_id=? AND project_id=? AND idempotency_key=?",
        args: [user.workspaceId, projectId, idem],
      })
    ).rows[0];
    if (repeated) {
      if (repeated.input_hash !== hash)
        throw new HttpError(
          409,
          "같은 작업 키에 다른 재개 요청을 사용할 수 없습니다.",
        );
      await tx.commit();
      return jobInfo({ ...repeated, job_model: parent.job_model });
    }
    const config = (
      await tx.execute({
        sql: "SELECT * FROM project_rag_configs WHERE project_id=? AND workspace_id=?",
        args: [projectId, user.workspaceId],
      })
    ).rows[0];
    const job = (
      await tx.execute({
        sql: "SELECT * FROM project_rag_jobs WHERE id=? AND project_id=? AND workspace_id=?",
        args: [failedJobId, projectId, user.workspaceId],
      })
    ).rows[0];
    const generation = (
      await tx.execute({
        sql: "SELECT * FROM project_rag_generations WHERE id=? AND project_id=? AND workspace_id=?",
        args: [job.generation_id, projectId, user.workspaceId],
      })
    ).rows[0];
    if (
      !config ||
      config.version !== expected ||
      config.last_attempt_job_id !== failedJobId ||
      job.status !== "failed" ||
      generation.status !== "failed"
    )
      throw new HttpError(
        409,
        "작업 또는 설정이 변경되었습니다. 최신 실패 작업을 다시 불러와 주세요.",
      );
    if (
      (
        await tx.execute({
          sql: "SELECT id FROM project_rag_jobs WHERE project_id=? AND workspace_id=? AND status IN ('queued','running','publishing','stop_requested')",
          args: [projectId, user.workspaceId],
        })
      ).rows.length
    )
      throw new HttpError(409, "이미 진행 중인 벡터화 작업이 있습니다.");
    if (
      generation.model !== parent.job_model ||
      generation.chunker_version !== 1 ||
      generation.scope_version !== 1
    )
      throw new HttpError(
        409,
        "모델 또는 분할 방식이 변경되었습니다. 새로 시작해 주세요.",
      );
    const manifest = manifestHash(await collectRagSources(user, projectId, tx));
    const counts = (
      await tx.execute({
        sql: "SELECT COUNT(*) AS n,MIN(dimensions) AS minimum,MAX(dimensions) AS maximum FROM project_rag_chunks WHERE generation_id=? AND project_id=? AND workspace_id=?",
        args: [generation.id, projectId, user.workspaceId],
      })
    ).rows[0];
    if (
      (generation.manifest_hash && generation.manifest_hash !== manifest) ||
      (!generation.manifest_hash && Number(counts.n) > 0)
    )
      throw new HttpError(
        409,
        "실패 이후 프로젝트 원본이 변경되었습니다. 새로 시작을 선택해 주세요.",
        { code: "RAG_RESUME_SOURCE_CHANGED" },
      );
    if (
      Number(counts.n) > 0 &&
      (counts.minimum !== counts.maximum ||
        (Number(generation.dimensions) > 0 &&
          Number(generation.dimensions) !== Number(counts.minimum)))
    )
      throw new HttpError(
        409,
        "저장된 벡터 차원이 일치하지 않습니다. 새로 시작해 주세요.",
      );
    const id = randomUUID(),
      now = new Date().toISOString(),
      version = Number(expected) + 1;
    let credentialId = String(job.credential_id),
      credentialVersion = Number(job.credential_version);
    if (input.apiKey) {
      credentialId = randomUUID();
      credentialVersion = 1;
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
    } else {
      const credential = await ragCredential(user, projectId, credentialId, tx);
      if (Number(credential.row.version) !== credentialVersion)
        throw new HttpError(
          409,
          "기존 키가 변경되었습니다. 키를 다시 입력해 주세요.",
        );
    }
    await tx.execute({
      sql: "INSERT INTO project_rag_jobs(id,workspace_id,project_id,generation_id,requested_by,idempotency_key,input_hash,config_version,credential_id,credential_version,status,total_sources,processed_sources,total_chunks,completed_chunks,skipped_sources,reused_chunks,created_at,restart_mode,resume_from_job_id) SELECT ?,?,?,?,?,?,?,?,?,?,'queued',total_sources,processed_sources,total_chunks,?,skipped_sources,reused_chunks,?,'resume',id FROM project_rag_jobs WHERE id=? AND status='failed'",
      args: [
        id,
        user.workspaceId,
        projectId,
        generation.id,
        user.id,
        idem,
        hash,
        version,
        credentialId,
        credentialVersion,
        Number(counts.n),
        now,
        failedJobId,
      ],
    });
    await tx.execute({
      sql: "UPDATE project_rag_sources SET extraction_status='pending',extraction_error_code=NULL WHERE generation_id=? AND project_id=? AND workspace_id=? AND extraction_status='failed'",
      args: [generation.id, projectId, user.workspaceId],
    });
    await tx.execute({
      sql: "UPDATE project_rag_generations SET status='building',config_version=?,credential_id=?,credential_version=?,dimensions=?,completed_at=NULL WHERE id=? AND project_id=? AND workspace_id=?",
      args: [
        version,
        credentialId,
        credentialVersion,
        Number(generation.dimensions) || Number(counts.minimum) || 0,
        generation.id,
        projectId,
        user.workspaceId,
      ],
    });
    await tx.execute({
      sql: "UPDATE project_rag_configs SET credential_id=?,version=?,last_attempt_job_id=?,updated_by=?,updated_at=? WHERE project_id=? AND workspace_id=?",
      args: [
        credentialId,
        version,
        id,
        user.id,
        now,
        projectId,
        user.workspaceId,
      ],
    });
    const restarted = (
      await tx.execute({
        sql: "SELECT * FROM project_rag_jobs WHERE id=?",
        args: [id],
      })
    ).rows[0];
    await tx.commit();
    return jobInfo({ ...restarted, job_model: parent.job_model });
  } catch (error) {
    await tx.rollback();
    throw error;
  } finally {
    tx.close();
  }
}
