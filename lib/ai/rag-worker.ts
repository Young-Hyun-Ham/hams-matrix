import "server-only";
import { randomUUID } from "node:crypto";
import type { Row } from "@libsql/client";
import { db } from "../db";
import { userInWorkspace, HttpError } from "../auth";
import { assertAiEnabled, activeGuardrailPolicy } from "./guardrail-policy";
import { createGuardrailSession } from "./guardrails";
import type { AiCallEvent } from "./token-types";
import { ragAccess } from "./project-rag-permissions";
import { ragCredential } from "./project-rag";
import { collectRagSources, manifestHash, sourceText } from "./rag-sources";
import { ragChunks, vectorBytes } from "./rag-chunks";
import { embedTexts } from "./embeddings";
import { createTokenTracker } from "./token-usage";

class LeaseLost extends Error {}
class JobStopped extends Error {}
const leaseUntil = () => new Date(Date.now() + 180000).toISOString();
export async function processNextRagJob() {
  const candidate = (
    await db().execute({
      sql: "SELECT id FROM project_rag_jobs WHERE status IN ('queued','running','publishing','stop_requested') AND (lease_until IS NULL OR lease_until<?) ORDER BY created_at LIMIT 1",
      args: [new Date().toISOString()],
    })
  ).rows[0];
  if (!candidate) return null;
  const token = randomUUID();
  const job = (
    await db().execute({
      sql: "UPDATE project_rag_jobs SET lease_token=?,lease_until=?,attempt=attempt+1,status=CASE WHEN status='queued' THEN 'running' ELSE status END WHERE id=? AND (lease_until IS NULL OR lease_until<?) RETURNING *",
      args: [token, leaseUntil(), candidate.id, new Date().toISOString()],
    })
  ).rows[0];
  if (!job) return null;
  return { id: String(job.id), run: () => runRagJob(job, token) };
}
async function runRagJob(job: Row, token: string) {
  const id = String(job.id),
    projectId = String(job.project_id),
    workspaceId = String(job.workspace_id),
    generationId = String(job.generation_id);
  const generation = (
    await db().execute({
      sql: "SELECT * FROM project_rag_generations WHERE id=? AND project_id=? AND workspace_id=?",
      args: [generationId, projectId, workspaceId],
    })
  ).rows[0];
  let stopped = false;
  try {
    const user = await userInWorkspace(String(job.requested_by), workspaceId);
    if (!user) throw new HttpError(403, "작업 요청자의 접근 권한이 없습니다.");
    const checkpoint = async () => {
      const r = (
        await db().execute({
          sql: "UPDATE project_rag_jobs SET lease_until=?,heartbeat_at=? WHERE id=? AND lease_token=? AND lease_until>? RETURNING status",
          args: [
            leaseUntil(),
            new Date().toISOString(),
            id,
            token,
            new Date().toISOString(),
          ],
        })
      ).rows[0];
      if (!r) throw new LeaseLost();
      if (r.status === "stop_requested") throw new JobStopped();
      await ragAccess(user, projectId, true);
      await assertAiEnabled(workspaceId);
    };
    await checkpoint();
    const credential = await ragCredential(
      user,
      projectId,
      String(job.credential_id),
    );
    if (Number(credential.row.version) !== Number(job.credential_version))
      throw Error("CREDENTIAL_CHANGED");
    const sources = await collectRagSources(user, projectId),
      manifest = manifestHash(sources);
    if (generation.manifest_hash && generation.manifest_hash !== manifest)
      throw new HttpError(409, "색인 중 원본이 변경되었습니다.");
    await checkpoint();
    await db().execute({
      sql: "UPDATE project_rag_generations SET manifest_hash=?,source_count=? WHERE id=?",
      args: [manifest, sources.length, generationId],
    });
    await db().execute({
      sql: "UPDATE project_rag_jobs SET total_sources=? WHERE id=? AND lease_token=?",
      args: [sources.length, id, token],
    });
    const track = createTokenTracker({
      workspaceId,
      userId: user.id,
      projectId,
      projectName: "프로젝트 벡터화",
      convId: `rag-job:${id}`,
      conversationTitle: "프로젝트 벡터화",
      chatId: `rag-job:${id}`,
      requestId: `rag-job:${id}`,
      model: String(generation.model),
      prompt: "프로젝트 자료 벡터화",
    });
    let dimensions = Number(generation.dimensions);
    for (const source of sources) {
      await checkpoint();
      let stored = (
        await db().execute({
          sql: "SELECT * FROM project_rag_sources WHERE generation_id=? AND source_type=? AND source_id=?",
          args: [generationId, source.type, source.id],
        })
      ).rows[0];
      if (
        stored &&
        ["ready", "unsupported"].includes(String(stored.extraction_status))
      )
        continue;
      if (!stored) {
        const sourceId = randomUUID();
        await db().execute({
          sql: "INSERT INTO project_rag_sources(id,workspace_id,project_id,generation_id,source_type,source_id,source_version,content_hash,permission_tab,title,locator_json,extraction_status) VALUES (?,?,?,?,?,?,?,?,?,?,?,'pending')",
          args: [
            sourceId,
            workspaceId,
            projectId,
            generationId,
            source.type,
            source.id,
            source.version,
            source.hash,
            source.tab,
            source.title,
            JSON.stringify({ href: source.href }),
          ],
        });
        stored = { id: sourceId, length: 0 };
      }
      let extracted;
      try {
        extracted = await sourceText(source, AbortSignal.timeout(60000));
      } catch {
        await db().execute({
          sql: "UPDATE project_rag_sources SET extraction_status='failed',extraction_error_code='EXTRACTION_FAILED' WHERE id=?",
          args: [stored.id],
        });
        await updateProgress(id, generationId, token);
        throw new HttpError(422, "원본 추출에 실패했습니다.");
      }
      if (extracted.status === "unsupported") {
        await db().execute({
          sql: "UPDATE project_rag_sources SET extraction_status='unsupported',extraction_error_code=? WHERE id=?",
          args: [extracted.code ?? "UNSUPPORTED_FORMAT", stored.id],
        });
      } else {
        // const policy = await activeGuardrailPolicy(workspaceId);
        // const inspectionCalls = new Map<number, number>();
        // const guard = createGuardrailSession({
        //   workspaceId,
        //   userId: user.id,
        //   requestId: `rag-job:${id}`,
        //   version: policy.version,
        //   policy: policy.policy,
        //   checkpoint,
        //   track: async (event: AiCallEvent) => {
        //     let turn = inspectionCalls.get(event.turn);
        //     if (turn === undefined) {
        //       const counter = (
        //         await db().execute({
        //           sql: "UPDATE project_rag_jobs SET call_index=call_index+1 WHERE id=? AND lease_token=? AND lease_until>? RETURNING call_index",
        //           args: [id, token, new Date().toISOString()],
        //         })
        //       ).rows[0];
        //       if (!counter) throw new LeaseLost();
        //       turn = Number(counter.call_index);
        //       inspectionCalls.set(event.turn, turn);
        //     }
        //     await track({ ...event, turn });
        //   },
        // });
        // try {
        //   await guard.inspect("context", extracted.text);
        // } catch (error) {
        //   await db().execute({
        //     sql: "UPDATE project_rag_sources SET extraction_status='failed',extraction_error_code='CONTEXT_BLOCKED' WHERE id=?",
        //     args: [stored.id],
        //   });
        //   await updateProgress(id, generationId, token);
        //   throw error;
        // }
        const chunks = ragChunks(extracted.text);
        if (!chunks.length)
          throw new HttpError(422, "색인할 원본 텍스트가 없습니다.");
        await db().execute({
          sql: "UPDATE project_rag_sources SET chunk_count=? WHERE id=?",
          args: [chunks.length, stored.id],
        });
        const previous = (
          await db().execute({
            sql: "SELECT chunk_no,content_hash FROM project_rag_chunks WHERE source_record_id=?",
            args: [stored.id],
          })
        ).rows;
        for (let offset = 0; offset < chunks.length; offset += 32) {
          await checkpoint();
          const pending = chunks
            .slice(offset, offset + 32)
            .map((chunk, i) => ({ ...chunk, no: offset + i }))
            .filter(
              (c) =>
                !previous.some(
                  (p) =>
                    Number(p.chunk_no) === c.no && p.content_hash === c.hash,
                ),
            );
          for (const chunk of pending) {
            const reuse = (
              await db().execute({
                sql: "SELECT c.embedding,c.dimensions FROM project_rag_chunks c JOIN project_rag_sources s ON s.id=c.source_record_id JOIN project_rag_generations g ON g.id=c.generation_id WHERE c.workspace_id=? AND c.project_id=? AND s.source_type=? AND s.source_id=? AND s.content_hash=? AND c.content_hash=? AND g.model=? AND g.chunker_version=1 AND g.status='ready' LIMIT 1",
                args: [
                  workspaceId,
                  projectId,
                  source.type,
                  source.id,
                  source.hash,
                  chunk.hash,
                  generation.model,
                ],
              })
            ).rows[0];
            if (
              reuse &&
              (!dimensions || Number(reuse.dimensions) === dimensions)
            ) {
              dimensions = Number(reuse.dimensions);
              await checkpoint();
              await db().execute({
                sql: "INSERT OR IGNORE INTO project_rag_chunks(id,workspace_id,project_id,generation_id,source_record_id,chunk_no,section,content,content_hash,token_count,embedding,dimensions,created_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM project_rag_jobs WHERE id=? AND lease_token=? AND lease_until>?)",
                args: [
                  randomUUID(),
                  workspaceId,
                  projectId,
                  generationId,
                  stored.id,
                  chunk.no,
                  `구간 ${chunk.no + 1}`,
                  chunk.content,
                  chunk.hash,
                  chunk.tokens,
                  reuse.embedding,
                  dimensions,
                  new Date().toISOString(),
                  id,
                  token,
                  new Date().toISOString(),
                ],
              });
              await db().execute({
                sql: "UPDATE project_rag_jobs SET reused_chunks=reused_chunks+1 WHERE id=? AND lease_token=?",
                args: [id, token],
              });
              previous.push({
                chunk_no: chunk.no,
                content_hash: chunk.hash,
                length: 0,
              });
            }
          }
          const missing = pending.filter(
            (c) =>
              !previous.some(
                (p) => Number(p.chunk_no) === c.no && p.content_hash === c.hash,
              ),
          );
          if (missing.length) {
            let vectors: number[][] | undefined;
            for (let attempt = 0; attempt < 3; attempt++) {
              const counter = (
                await db().execute({
                  sql: "UPDATE project_rag_jobs SET call_index=call_index+1 WHERE id=? AND lease_token=? RETURNING call_index",
                  args: [id, token],
                })
              ).rows[0];
              if (!counter) throw new LeaseLost();
              try {
                vectors = await embedTexts({
                  key: credential.key,
                  model: String(generation.model),
                  texts: missing.map((c) => c.content),
                  dimensions: dimensions || undefined,
                  checkpoint,
                  track,
                  turn: Number(counter.call_index),
                  purpose: "embedding_index",
                });
                break;
              } catch (error) {
                if (
                  !(error instanceof HttpError) ||
                  ![429, 503, 504].includes(error.status) ||
                  attempt === 2
                )
                  throw error;
                await new Promise((resolve) =>
                  setTimeout(resolve, 1000 * 2 ** attempt),
                );
              }
            }
            if (!vectors) throw Error("EMBEDDING_FAILED");
            dimensions = vectors[0].length;
            const tx = await db().transaction("write");
            try {
              const owned = (
                await tx.execute({
                  sql: "SELECT status FROM project_rag_jobs WHERE id=? AND lease_token=? AND lease_until>?",
                  args: [id, token, new Date().toISOString()],
                })
              ).rows[0];
              if (!owned) throw new LeaseLost();
              if (owned.status === "stop_requested") throw new JobStopped();
              for (let i = 0; i < missing.length; i++)
                await tx.execute({
                  sql: "INSERT OR IGNORE INTO project_rag_chunks(id,workspace_id,project_id,generation_id,source_record_id,chunk_no,section,content,content_hash,token_count,embedding,dimensions,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                  args: [
                    randomUUID(),
                    workspaceId,
                    projectId,
                    generationId,
                    stored.id,
                    missing[i].no,
                    `구간 ${missing[i].no + 1}`,
                    missing[i].content,
                    missing[i].hash,
                    missing[i].tokens,
                    vectorBytes(vectors[i]),
                    dimensions,
                    new Date().toISOString(),
                  ],
                });
              await tx.execute({
                sql: "UPDATE project_rag_generations SET dimensions=? WHERE id=?",
                args: [dimensions, generationId],
              });
              await tx.commit();
            } catch (error) {
              await tx.rollback();
              throw error;
            } finally {
              tx.close();
            }
          }
          await updateProgress(id, generationId, token);
        }
        await checkpoint();
        await db().execute({
          sql: "UPDATE project_rag_sources SET extraction_status='ready',extraction_error_code=NULL WHERE id=?",
          args: [stored.id],
        });
      }
      await updateProgress(id, generationId, token);
    }
    await checkpoint();
    const tx = await db().transaction("write");
    try {
      const owned = (
        await tx.execute({
          sql: "SELECT status FROM project_rag_jobs WHERE id=? AND lease_token=? AND lease_until>?",
          args: [id, token, new Date().toISOString()],
        })
      ).rows[0];
      if (!owned) throw new LeaseLost();
      if (owned.status === "stop_requested") throw new JobStopped();
      await ragAccess(user, projectId, true, tx);
      await assertAiEnabled(workspaceId, tx);
      const config = (
        await tx.execute({
          sql: "SELECT * FROM project_rag_configs WHERE project_id=? AND workspace_id=?",
          args: [projectId, workspaceId],
        })
      ).rows[0];
      if (
        config.version !== job.config_version ||
        manifestHash(await collectRagSources(user, projectId, tx)) !== manifest
      )
        throw new HttpError(409, "원본 또는 설정이 변경되었습니다.");
      await ragCredential(user, projectId, String(job.credential_id), tx);
      const counts = (
        await tx.execute({
          sql: "SELECT COUNT(*) AS sources,SUM(CASE WHEN extraction_status='unsupported' THEN 1 ELSE 0 END) AS unsupported,SUM(CASE WHEN extraction_status NOT IN ('ready','unsupported') THEN 1 ELSE 0 END) AS incomplete FROM project_rag_sources WHERE generation_id=?",
          args: [generationId],
        })
      ).rows[0];
      const chunks = Number(
        (
          await tx.execute({
            sql: "SELECT COUNT(*) AS n FROM project_rag_chunks WHERE generation_id=?",
            args: [generationId],
          })
        ).rows[0].n,
      );
      if (
        Number(counts.sources) !== sources.length ||
        Number(counts.incomplete) ||
        !chunks
      )
        throw new HttpError(
          422,
          "색인 자료가 비어 있거나 처리가 완료되지 않았습니다.",
        );
      const now = new Date().toISOString();
      await tx.execute({
        sql: "UPDATE project_rag_generations SET status='ready',dimensions=?,source_count=?,chunk_count=?,coverage_json=?,completed_at=?,published_at=? WHERE id=?",
        args: [
          dimensions,
          sources.length,
          chunks,
          JSON.stringify({
            sources: sources.length,
            chunks,
            unsupported: Number(counts.unsupported),
          }),
          now,
          now,
          generationId,
        ],
      });
      await tx.execute({
        sql: "UPDATE project_rag_configs SET active_generation_id=? WHERE project_id=? AND workspace_id=?",
        args: [generationId, projectId, workspaceId],
      });
      if (config.active_generation_id)
        await tx.execute({
          sql: "UPDATE project_rag_generations SET status='retired' WHERE id=?",
          args: [config.active_generation_id],
        });
      await tx.execute({
        sql: "UPDATE project_rag_jobs SET status='completed',finished_at=?,lease_token=NULL,lease_until=NULL WHERE id=? AND lease_token=?",
        args: [now, id, token],
      });
      await tx.commit();
    } catch (error) {
      await tx.rollback();
      throw error;
    } finally {
      tx.close();
    }
  } catch (error) {
    if (error instanceof LeaseLost) return;
    stopped = error instanceof JobStopped;
    const code = stopped
      ? "CANCELLED"
      : error instanceof HttpError
        ? `RAG_${error.status}`
        : "RAG_FAILED";
    const tx = await db().transaction("write");
    try {
      const owned = (
        await tx.execute({
          sql: "UPDATE project_rag_jobs SET status=?,error_code=?,finished_at=?,lease_token=NULL,lease_until=NULL WHERE id=? AND lease_token=? AND lease_until>? RETURNING id",
          args: [
            stopped ? "cancelled" : "failed",
            code,
            new Date().toISOString(),
            id,
            token,
            new Date().toISOString(),
          ],
        })
      ).rows[0];
      if (owned) {
        await tx.execute({
          sql: "UPDATE project_rag_generations SET status=? WHERE id=? AND status='building'",
          args: [stopped ? "cancelled" : "failed", generationId],
        });
        if (!stopped)
          await tx.execute({
            sql: "UPDATE project_rag_sources SET extraction_status='failed',extraction_error_code=COALESCE(extraction_error_code,?) WHERE generation_id=? AND extraction_status='pending'",
            args: [code, generationId],
          });
        await tx.execute({
          sql: "UPDATE project_rag_jobs SET failed_sources=(SELECT COUNT(*) FROM project_rag_sources WHERE generation_id=? AND extraction_status='failed') WHERE id=?",
          args: [generationId, id],
        });
      }
      await tx.commit();
    } catch (failure) {
      await tx.rollback();
      throw failure;
    } finally {
      tx.close();
    }
  }
}
async function updateProgress(id: string, generationId: string, token: string) {
  await db().execute({
    sql: "UPDATE project_rag_jobs SET processed_sources=(SELECT COUNT(*) FROM project_rag_sources WHERE generation_id=? AND extraction_status IN ('ready','unsupported')),total_chunks=(SELECT COALESCE(SUM(chunk_count),0) FROM project_rag_sources WHERE generation_id=?),completed_chunks=(SELECT COUNT(*) FROM project_rag_chunks WHERE generation_id=?),skipped_sources=(SELECT COUNT(*) FROM project_rag_sources WHERE generation_id=? AND extraction_status='unsupported'),failed_sources=(SELECT COUNT(*) FROM project_rag_sources WHERE generation_id=? AND extraction_status='failed') WHERE id=? AND lease_token=?",
    args: [
      generationId,
      generationId,
      generationId,
      generationId,
      generationId,
      id,
      token,
    ],
  });
}
