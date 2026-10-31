import { body, checkOrigin, errorResponse, HttpError, requireUser } from "@/lib/auth";
import { mutateArtifact, prepareEditedArtifactMermaid, projectAccess, projectData } from "@/lib/artifacts";
import { db } from "@/lib/db";
import { topologyFor } from "@/lib/architecture";
type Context = { params: Promise<{ projectId: string; artifactId: string }> };
export async function PATCH(request: Request, context: Context) {
  try {
    checkOrigin(request);
    const user = await requireUser(), { projectId, artifactId } = await context.params;
    const raw = await body(request, 700000);
    if (typeof raw.code !== "string" || !Number.isSafeInteger(raw.version)) throw new HttpError(400, "코드와 최신 버전을 확인해 주세요.");
    const tx = await db().transaction("write");
    try {
      await projectAccess(tx, user, projectId, true);
      const data = await projectData(tx, user, projectId);
      const before = data.artifacts.find((artifact) => artifact.id === artifactId && artifact.kind === "architecture");
      if (!before) throw new HttpError(404, "아키텍처를 찾을 수 없습니다.");
      if (before.version !== raw.version) throw new HttpError(409, "다른 사용자가 변경했습니다. 코드를 복사한 후 최신 내용을 다시 불러와 주세요.");
      const normalized = { ...before, structure: { ...before.structure, topology: topologyFor(before) } };
      const input = { kind: before.kind, title: before.title, status: before.status, fields: before.fields, links: before.links, structure: normalized.structure, version: before.version };
      prepareEditedArtifactMermaid(input, normalized, user, raw.code);
      const artifact = before.structure?.mermaid?.code === raw.code.trim() ? before : await mutateArtifact(request, user, projectId, input, "UPDATE", artifactId, undefined, tx);
      const result = { artifact, data: await projectData(tx, user, projectId) };
      await tx.commit();
      return Response.json(result);
    } catch (error) { await tx.rollback(); throw error; }
    finally { tx.close(); }
  } catch (error) { return errorResponse(error); }
}
