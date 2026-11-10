import "server-only";
import { randomUUID } from "node:crypto";
import type { Client, Row } from "@libsql/client";
import { db } from "./db";
import { HttpError } from "./auth";
import { requireProjectPermission } from "./project-permissions";
import { audit } from "./audit";
import type { User } from "./types";
import { isDatabaseType } from "./database-data-types";
import {
  domainRuleVersion,
  type DatabaseDomain,
  type DomainCatalog,
} from "./database-domain-types";
import {
  validateDatabaseDomain,
  logicalDomainKey,
} from "./database-domain-validation";
type Executor = Pick<Client, "execute">;
export function databaseDomain(row: Row): DatabaseDomain {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    logicalName: String(row.logical_name),
    logicalKey: String(row.logical_key),
    physicalName: String(row.physical_name),
    databaseType: isDatabaseType(row.database_type) ? row.database_type : null,
    dataType: String(row.data_type),
    length: String(row.domain_length),
    description: String(row.description),
    version: Number(row.version),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}
export async function domainCatalog(
  executor: Executor,
  user: User,
  projectId: string,
): Promise<DomainCatalog> {
  await requireProjectPermission(executor, user, projectId, "database", "READ");
  const revision = (
    await executor.execute({
      sql: "SELECT revision FROM project_database_domain_catalogs WHERE project_id=? AND workspace_id=?",
      args: [projectId, user.workspaceId],
    })
  ).rows[0];
  const rows = await executor.execute({
    sql: "SELECT *,length AS domain_length FROM project_database_domains WHERE project_id=? AND workspace_id=? AND deleted_at IS NULL ORDER BY logical_key,id",
    args: [projectId, user.workspaceId],
  });
  return {
    catalogRevision: Number(revision?.revision ?? 1),
    ruleVersion: domainRuleVersion,
    items: rows.rows.map(databaseDomain),
  };
}
export async function readDomainCatalog(user: User, projectId: string) {
  const tx = await db().transaction("read");
  try {
    const catalog = await domainCatalog(tx, user, projectId);
    await tx.commit();
    return catalog;
  } finally {
    tx.close();
  }
}
export function domainContext(catalog: DomainCatalog) {
  let budget = 20000;
  const items = catalog.items.filter((item) => {
    const size = JSON.stringify(item).length;
    if (size > budget) return false;
    budget -= size;
    return true;
  });
  return {
    ...catalog,
    items,
    total: catalog.items.length,
    truncated: items.length !== catalog.items.length,
  };
}
export async function readDatabaseDomains(
  user: User,
  projectId: string,
  query: { q?: unknown; page?: unknown; pageSize?: unknown } = {},
  id?: string,
) {
  const tx = await db().transaction("read");
  try {
    await requireProjectPermission(tx, user, projectId, "database", "READ");
    const revision = (
      await tx.execute({
        sql: "SELECT revision FROM project_database_domain_catalogs WHERE project_id=? AND workspace_id=?",
        args: [projectId, user.workspaceId],
      })
    ).rows[0];
    const catalogRevision = Number(revision?.revision ?? 1);
    if (id) {
      const row = (
        await tx.execute({
          sql: "SELECT *,length AS domain_length FROM project_database_domains WHERE id=? AND project_id=? AND workspace_id=? AND deleted_at IS NULL",
          args: [id, projectId, user.workspaceId],
        })
      ).rows[0];
      if (!row) throw new HttpError(404, "도메인 메타를 찾을 수 없습니다.");
      await tx.commit();
      return { item: databaseDomain(row), catalogRevision };
    }
    if (
      query.q !== undefined &&
      (typeof query.q !== "string" || query.q.length > 100)
    )
      throw new HttpError(400, "검색어는 최대 100자입니다.");
    const q = logicalDomainKey(String(query.q ?? ""));
    const page = Number(query.page ?? 1),
      pageSize = Number(query.pageSize ?? 20);
    if (
      !Number.isSafeInteger(page) ||
      page < 1 ||
      !Number.isSafeInteger(pageSize) ||
      pageSize < 1 ||
      pageSize > 100
    )
      throw new HttpError(400, "페이지 범위를 확인해 주세요.");
    const pattern = `%${q.replace(/[!%_]/g, "!$&")}%`;
    const where =
      "project_id=? AND workspace_id=? AND deleted_at IS NULL AND (logical_key LIKE ? ESCAPE '!' OR physical_name LIKE ? ESCAPE '!')";
    const args = [projectId, user.workspaceId, pattern, pattern];
    const total = Number(
      (
        await tx.execute({
          sql: `SELECT COUNT(*) AS n FROM project_database_domains WHERE ${where}`,
          args,
        })
      ).rows[0].n,
    );
    const current = Math.min(page, Math.max(1, Math.ceil(total / pageSize)));
    const rows = await tx.execute({
      sql: `SELECT *,length AS domain_length FROM project_database_domains WHERE ${where} ORDER BY logical_key,id LIMIT ? OFFSET ?`,
      args: [...args, pageSize, (current - 1) * pageSize],
    });
    await tx.commit();
    return {
      items: rows.rows.map(databaseDomain),
      total,
      page: current,
      pageSize,
      catalogRevision,
      ruleVersion: domainRuleVersion,
    };
  } finally {
    tx.close();
  }
}
export async function mutateDatabaseDomain(
  request: Request,
  user: User,
  projectId: string,
  input: Record<string, unknown>,
  action: "CREATE" | "UPDATE" | "DELETE",
  id?: string,
) {
  const tx = await db().transaction("write");
  try {
    await requireProjectPermission(tx, user, projectId, "database", action);
    const beforeRow = id
      ? (
          await tx.execute({
            sql: "SELECT *,length AS domain_length FROM project_database_domains WHERE id=? AND project_id=? AND workspace_id=? AND deleted_at IS NULL",
            args: [id, projectId, user.workspaceId],
          })
        ).rows[0]
      : undefined;
    if (id && !beforeRow)
      throw new HttpError(404, "도메인 메타를 찾을 수 없습니다.");
    const before = beforeRow ? databaseDomain(beforeRow) : undefined;
    if (
      before &&
      (!Number.isSafeInteger(input.version) || input.version !== before.version)
    )
      throw new HttpError(
        409,
        "다른 사용자가 변경했습니다. 최신 메타를 불러온 뒤 다시 저장해 주세요.",
      );
    const now = new Date().toISOString(),
      domainId = id ?? randomUUID();
    let item: DatabaseDomain;
    if (action === "DELETE") {
      if (Object.keys(input).some((k) => k !== "version"))
        throw new HttpError(400, "삭제 요청 항목을 확인해 주세요.");
      const result = await tx.execute({
        sql: "UPDATE project_database_domains SET deleted_at=?,updated_at=?,updated_by=?,version=version+1 WHERE id=? AND project_id=? AND workspace_id=? AND version=? AND deleted_at IS NULL",
        args: [
          now,
          now,
          user.id,
          domainId,
          projectId,
          user.workspaceId,
          before!.version,
        ],
      });
      if (result.rowsAffected !== 1)
        throw new HttpError(409, "도메인 메타가 변경되었습니다.");
      item = { ...before!, version: before!.version + 1, updatedAt: now };
    } else {
      const fields = before
        ? {
            logicalName: before.logicalName,
            physicalName: before.physicalName,
            databaseType: before.databaseType,
            dataType: before.dataType,
            length: before.length,
            description: before.description,
            ...input,
          }
        : input;
      if (
        fields.databaseType === null &&
        (!before || before.databaseType !== null || input.databaseType === null)
      )
        throw new HttpError(400, "DB 종류를 선택해 주세요.");
      const values = validateDatabaseDomain(fields);
      const duplicate = (
        await tx.execute({
          sql: "SELECT id FROM project_database_domains WHERE project_id=? AND workspace_id=? AND logical_key=? AND deleted_at IS NULL AND id<>?",
          args: [projectId, user.workspaceId, values.logicalKey, domainId],
        })
      ).rows[0];
      if (duplicate)
        throw new HttpError(409, "동일한 논리 명칭의 도메인 메타가 있습니다.");
      item = {
        id: domainId,
        projectId,
        ...values,
        version: (before?.version ?? 0) + 1,
        createdAt: before?.createdAt ?? now,
        updatedAt: now,
      };
      if (before) {
        const result = await tx.execute({
          sql: "UPDATE project_database_domains SET logical_name=?,logical_key=?,physical_name=?,database_type=?,data_type=?,length=?,description=?,version=version+1,updated_by=?,updated_at=? WHERE id=? AND project_id=? AND workspace_id=? AND version=? AND deleted_at IS NULL",
          args: [
            values.logicalName,
            values.logicalKey,
            values.physicalName,
            values.databaseType,
            values.dataType,
            values.length,
            values.description,
            user.id,
            now,
            domainId,
            projectId,
            user.workspaceId,
            before.version,
          ],
        });
        if (result.rowsAffected !== 1)
          throw new HttpError(409, "도메인 메타가 변경되었습니다.");
      } else
        await tx.execute({
          sql: "INSERT INTO project_database_domains(id,project_id,workspace_id,logical_name,logical_key,physical_name,database_type,data_type,length,description,created_by,updated_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
          args: [
            domainId,
            projectId,
            user.workspaceId,
            values.logicalName,
            values.logicalKey,
            values.physicalName,
            values.databaseType,
            values.dataType,
            values.length,
            values.description,
            user.id,
            user.id,
            now,
            now,
          ],
        });
    }
    const revision = await tx.execute({
      sql: "INSERT INTO project_database_domain_catalogs(project_id,workspace_id,revision,updated_at) VALUES (?,?,2,?) ON CONFLICT(project_id,workspace_id) DO UPDATE SET revision=revision+1,updated_at=excluded.updated_at RETURNING revision",
      args: [projectId, user.workspaceId, now],
    });
    await audit(
      request,
      {
        user,
        action,
        resource: "database_domain",
        resourceId: domainId,
        before: before
          ? { fields: before, version: before.version }
          : undefined,
        after:
          action === "DELETE"
            ? undefined
            : { fields: item, version: item.version },
        metadata: { projectId },
      },
      tx,
    );
    const synonym =
      action === "DELETE"
        ? undefined
        : (
            await tx.execute({
              sql: "SELECT id FROM project_database_domains WHERE project_id=? AND workspace_id=? AND physical_name=? AND id<>? AND deleted_at IS NULL LIMIT 1",
              args: [projectId, user.workspaceId, item.physicalName, domainId],
            })
          ).rows[0];
    await tx.commit();
    return {
      item,
      catalogRevision: Number(revision.rows[0].revision),
      warnings: synonym
        ? [
            "같은 물리 명칭의 메타가 있습니다. 테이블 안의 컬럼명이 중복되지 않도록 확인해 주세요.",
          ]
        : [],
    };
  } catch (error) {
    await tx.rollback();
    throw error;
  } finally {
    tx.close();
  }
}
