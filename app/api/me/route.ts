import { audit } from "@/lib/audit";
import {
  body,
  checkOrigin,
  errorResponse,
  HttpError,
  nameInput,
  requireUser,
} from "@/lib/auth";
import { db } from "@/lib/db";
import { connection } from "next/server";
export async function GET(request: Request) {
  await connection();
  try {
    const user = await requireUser();
    await audit(request, {
      user,
      action: "READ",
      resource: "user",
      resourceId: user.id,
    });
    return Response.json(
      { user },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export async function PATCH(request: Request) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    const data = await body(request),
      name = nameInput(data.name);
    if (user.accountRole === "master" && name !== "master")
      throw new HttpError(403, "master 이름은 변경할 수 없습니다.");
    const tx = await db().transaction("write");
    try {
      const before = await tx.execute({
        sql: "SELECT name FROM users WHERE id=?",
        args: [user.id],
      });
      await tx.execute({
        sql: "UPDATE users SET name=?,updated_at=? WHERE id=?",
        args: [name, new Date().toISOString(), user.id],
      });
      await audit(
        request,
        {
          user,
          action: "UPDATE",
          resource: "user",
          resourceId: user.id,
          before: { name: String(before.rows[0].name) },
          after: { name },
        },
        tx,
      );
      await tx.commit();
    } catch (error) {
      await tx.rollback();
      throw error;
    } finally {
      tx.close();
    }
    return Response.json(
      { user: { ...user, name } },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
