// Creates a dedicated encryption key without printing it or changing existing keys.
import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
let content;
try {
  content = await readFile(".env", "utf8");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
  content = "";
}
const match = content.match(/^AI_IMAGE_ENCRYPTION_KEY[ \t]*=[ \t]*(.*)$/m);
const existing = (process.env.AI_IMAGE_ENCRYPTION_KEY || match?.[1] || "")
  .trim()
  .replace(/^['"]|['"]$/g, "");
if (existing) {
  const decoded = Buffer.from(existing, "base64");
  if (decoded.length !== 32 || decoded.toString("base64") !== existing)
    throw new Error(
      "AI_IMAGE_ENCRYPTION_KEY must be 32 random bytes encoded as Base64. Existing value was preserved.",
    );
  console.log("AI image encryption key already configured; preserved.");
} else {
  const line = `AI_IMAGE_ENCRYPTION_KEY=${randomBytes(32).toString("base64")}`;
  content = match
    ? content.replace(/^AI_IMAGE_ENCRYPTION_KEY[ \t]*=.*$/m, line)
    : `${content}${content.endsWith("\n") || !content ? "" : "\n"}\n${line}\n`;
  await writeFile(".env", content, { encoding: "utf8", mode: 0o600 });
  console.log(
    "AI image encryption key created in .env. Keep this key backed up for saved images.",
  );
}
