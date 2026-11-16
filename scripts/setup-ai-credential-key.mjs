// Never print keys; preserve existing configuration verbatim except this variable.
import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
let content = "";
try {
  content = await readFile(".env", "utf8");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const match = content.match(/^AI_CREDENTIAL_ENCRYPTION_KEY[ \t]*=[ \t]*(.*)$/m);
const existing = (process.env.AI_CREDENTIAL_ENCRYPTION_KEY || match?.[1] || "")
  .trim()
  .replace(/^['"]|['"]$/g, "");
if (existing) {
  const decoded = Buffer.from(existing, "base64");
  if (decoded.length !== 32 || decoded.toString("base64") !== existing)
    throw Error(
      "AI credential encryption key is invalid; existing value preserved.",
    );
  console.log("AI credential encryption key already configured; preserved.");
} else {
  const line = `AI_CREDENTIAL_ENCRYPTION_KEY=${randomBytes(32).toString("base64")}`;
  content = match
    ? content.replace(/^AI_CREDENTIAL_ENCRYPTION_KEY[ \t]*=.*$/m, line)
    : `${content}${content.endsWith("\n") || !content ? "" : "\n"}\n${line}\n`;
  await writeFile(".env", content, { encoding: "utf8", mode: 0o600 });
  console.log(
    "AI credential encryption key created in ignored .env. Preserve it across deployments.",
  );
}
