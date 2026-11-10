import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "./db";
import { HttpError } from "./auth";
import type { User } from "./types";
import { textInput, writeTransaction, requireVersion } from "./plan-products";
import { productById, productEvent } from "./product-access";

export async function submitBusinessRequest(
  user: User,
  input: Record<string, unknown>,
) {
  if (
    Object.keys(input).some(
      (k) => !["companyName", "contact", "message"].includes(k),
    )
  )
    throw new HttpError(400, "계약 신청 항목을 확인해 주세요.");
  const company = textInput(input.companyName, "업체명"),
    contact = textInput(input.contact, "연락처", 200);
  const message =
    input.message == null || input.message === ""
      ? ""
      : textInput(input.message, "요청 내용", 2000);
  return writeTransaction(async (tx) => {
    const prior = (
      await tx.execute({
        sql: "SELECT id,status FROM business_requests WHERE user_id=? AND status IN ('submitted','reviewing','contracting')",
        args: [user.id],
      })
    ).rows[0];
    if (prior) return prior;
    const master = (
      await tx.execute("SELECT id FROM users WHERE account_role='master'")
    ).rows[0];
    if (!master)
      throw new HttpError(
        503,
        "계약 담당자를 확인할 수 없습니다. 잠시 후 다시 신청해 주세요.",
      );
    const id = randomUUID();
    await tx.execute({
      sql: "INSERT INTO business_requests(id,user_id,company_name,contact,message) VALUES (?,?,?,?,?)",
      args: [id, user.id, company, contact, message],
    });
    await tx.execute({
      sql: "INSERT INTO notifications(id,recipient_user_id,type,business_request_id) VALUES (?,?,'business_request',?)",
      args: [randomUUID(), String(master.id), id],
    });
    return { id, status: "submitted" };
  });
}
export async function updateBusinessRequest(
  actor: User,
  id: string,
  input: Record<string, unknown>,
) {
  if (actor.accountRole !== "master")
    throw new HttpError(403, "슈퍼관리자만 처리할 수 있습니다.");
  const status = String(input.status);
  const transitions: Record<string, string[]> = {
    submitted: ["reviewing", "rejected"],
    reviewing: ["contracting", "rejected"],
    contracting: ["approved", "rejected"],
  };
  return writeTransaction(async (tx) => {
    const row = (
      await tx.execute({
        sql: "SELECT * FROM business_requests WHERE id=?",
        args: [id],
      })
    ).rows[0];
    if (!row) throw new HttpError(404, "신청을 찾을 수 없습니다.");
    if (Number(row.version) !== requireVersion(input.version))
      throw new HttpError(409, "신청이 변경되었습니다.");
    if (!transitions[String(row.status)]?.includes(status))
      throw new HttpError(400, "진행 상태 순서를 확인해 주세요.");
    let productId: string | null = null,
      contractId: string | null = null;
    if (status === "approved") {
      productId = textInput(input.productId, "상품 ID");
      if ((await productById(productId, tx)).plan_code !== "business")
        throw new HttpError(400, "Business 상품만 연결할 수 있습니다.");
      contractId = String(
        (
          await tx.execute({
            sql: "SELECT id FROM contracts WHERE product_id=? AND status='active'",
            args: [productId],
          })
        ).rows[0].id,
      );
      await productEvent(
        tx,
        actor.id,
        productId,
        "business_request_approved",
        id,
      );
    }
    await tx.execute({
      sql: "UPDATE business_requests SET status=?,product_id=?,contract_id=?,version=version+1 WHERE id=?",
      args: [status, productId, contractId, id],
    });
    // Approval records a contract; it does not silently promote or subscribe the applicant.
  });
}
export async function ownBusinessRequests(userId: string) {
  return (
    await db().execute({
      sql: "SELECT id,company_name,status,created_at,version FROM business_requests WHERE user_id=? ORDER BY created_at DESC LIMIT 50",
      args: [userId],
    })
  ).rows;
}
