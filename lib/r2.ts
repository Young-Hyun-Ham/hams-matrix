import "server-only";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { HttpError } from "./auth";

function storage() {
  const { R2_ENDPOINT, CLOUDFLARE_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME } = process.env;
  const endpoint = R2_ENDPOINT || (CLOUDFLARE_ACCOUNT_ID ? `https://${CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com` : "");
  if (!endpoint || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME)
    throw new HttpError(503, "문서 스토리지 설정을 확인해 주세요.");
  return {
    client: new S3Client({ region: "auto", endpoint, credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY } }),
    bucket: R2_BUCKET_NAME,
  };
}
export async function putDocument(key: string, bytes: Buffer) {
  const { client, bucket } = storage();
  try {
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: bytes, ContentType: "application/octet-stream" }));
  } finally { client.destroy(); }
}
export async function removeDocument(key: string) {
  const { client, bucket } = storage();
  try { await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })); }
  finally { client.destroy(); }
}
export async function getDocument(key: string) {
  const { client, bucket } = storage();
  try {
    const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!result.Body) throw new HttpError(404, "파일을 찾을 수 없습니다.");
    // Files are bounded at upload; finish consuming the response before closing the client.
    return await result.Body.transformToByteArray();
  } finally { client.destroy(); }
}
