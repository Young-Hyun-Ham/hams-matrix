import { createHash } from "node:crypto";
export const ragHash = (value: unknown) =>
  createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(value))
    .digest("hex");
// UTF-8 byte counts conservatively bound tokens, including Korean and emoji.
export function ragChunks(text: string) {
  const chars = Array.from(text.normalize("NFC")),
    chunks: { content: string; hash: string; tokens: number }[] = [];
  let start = 0;
  while (start < chars.length) {
    let end = start,
      bytes = 0;
    while (
      end < chars.length &&
      bytes + Buffer.byteLength(chars[end], "utf8") <= 2400
    )
      bytes += Buffer.byteLength(chars[end++], "utf8");
    const content = chars.slice(start, end).join("").trim();
    if (content)
      chunks.push({
        content,
        hash: ragHash(content),
        tokens: Buffer.byteLength(content, "utf8"),
      });
    if (end >= chars.length) break;
    let overlap = end,
      overlapBytes = 0;
    while (
      overlap > start + 1 &&
      overlapBytes + Buffer.byteLength(chars[overlap - 1], "utf8") <= 400
    )
      overlapBytes += Buffer.byteLength(chars[--overlap], "utf8");
    start = Math.max(start + 1, overlap);
  }
  return chunks;
}
export function vectorBytes(vector: number[]) {
  if (
    !vector.length ||
    vector.length > 65536 ||
    vector.some((n) => !Number.isFinite(n)) ||
    !vector.some((n) => n !== 0)
  )
    throw Error("INVALID_VECTOR");
  const bytes = Buffer.alloc(vector.length * 4);
  vector.forEach((n, i) => bytes.writeFloatLE(n, i * 4));
  if (
    Array.from({ length: vector.length }, (_, i) =>
      bytes.readFloatLE(i * 4),
    ).some((n) => !Number.isFinite(n))
  )
    throw Error("INVALID_VECTOR");
  return bytes;
}
export function cosine(bytes: Uint8Array, query: number[]) {
  const buffer = Buffer.from(bytes);
  if (buffer.length !== query.length * 4)
    throw Error("VECTOR_DIMENSION_MISMATCH");
  let dot = 0,
    left = 0,
    right = 0;
  for (let i = 0; i < query.length; i++) {
    const n = buffer.readFloatLE(i * 4);
    dot += n * query[i];
    left += n * n;
    right += query[i] * query[i];
  }
  return left && right ? dot / Math.sqrt(left * right) : -1;
}
