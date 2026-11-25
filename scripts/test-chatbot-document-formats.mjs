import "./deliverable-worker-loader.mjs";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { posix } from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import { SaxesParser } from "saxes";
import { getDocumentProxy } from "unpdf";
const { exportDocument } = await import("../lib/chatbot/document-export.ts");
const { documentHtml } = await import("../lib/chatbot/document-blocks.ts");
const png =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a30sAAAAASUVORK5CYII=";
const source = `# 한국어 문서\n\n## 개요\n안전한 실제 문서 & 테스트 <script>alert(1)</script>\n\n| 항목 | 설명 |\n| --- | --- |\n| 이름 | 한글 보존 |\n\n![첨부](data:image/png;base64,${png})\n\n---\n## 다음 장\n완료`;
let checks = 0;
await mkdir(".auth-tests/chatbot-document-formats", { recursive: true });
function checkPackage(bytes, root) {
  assert.equal(bytes.readUInt32LE(0), 0x04034b50);
  const files = unzipSync(bytes);
  assert.ok(files["[Content_Types].xml"]);
  assert.ok(files[root]);
  for (const [name, content] of Object.entries(files))
    if (/\.(xml|rels)$/.test(name)) {
      const parser = new SaxesParser({ xmlns: true });
      parser.on("error", (e) => {
        throw Error(name + ": " + e.message);
      });
      if (name.endsWith(".rels"))
        parser.on("opentag", (tag) => {
          if (tag.local !== "Relationship") return;
          const get = (k) => tag.attributes[k]?.value;
          assert.notEqual(get("TargetMode"), "External");
          const base =
            name === "_rels/.rels" ? "" : posix.dirname(posix.dirname(name));
          assert.ok(
            files[posix.normalize(posix.join(base, get("Target")))],
            name + " missing target " + get("Target"),
          );
        });
      parser.write(strFromU8(content)).close();
    }
  checks++;
  return files;
}
for (const format of ["docx", "pptx"]) {
  const result = await exportDocument(source, format);
  const files = checkPackage(
    result.bytes,
    format === "docx" ? "word/document.xml" : "ppt/presentation.xml",
  );
  assert.ok(Object.keys(files).some((n) => n.includes("/media/")));
  const all = Object.entries(files)
    .filter(([n]) => n.endsWith(".xml"))
    .map(([, v]) => strFromU8(v))
    .join("\n");
  assert.ok(all.includes("한글 보존"));
  assert.ok(all.includes("다음 장"));
  assert.ok(!all.includes("<script>"));
  if (format === "docx") assert.ok(all.includes("<w:tbl>"));
  else assert.ok(all.includes("<a:tbl>"));
  await writeFile(
    `.auth-tests/chatbot-document-formats/test.${format}`,
    result.bytes,
  );
  checks++;
}
const html = documentHtml(source);
assert.ok(!html.includes("<script>"));
assert.ok(html.includes("Content-Security-Policy"));
checks++;
const pdf = await exportDocument(source, "pdf");
assert.equal(pdf.bytes.subarray(0, 5).toString(), "%PDF-");
const document = await getDocumentProxy(new Uint8Array(pdf.bytes));
try {
  assert.ok(document.numPages >= 2);
  let text = "";
  for (let i = 1; i <= document.numPages; i++) {
    const page = await document.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((v) => v.str ?? "").join(" ");
    page.cleanup();
  }
  assert.ok(text.includes("한국어 문서"), text);
  assert.ok(text.includes("한글 보존"), text);
  checks++;
} finally {
  await document.loadingTask.destroy();
}
await writeFile(".auth-tests/chatbot-document-formats/test.pdf", pdf.bytes);
const mermaid = await exportDocument(
  '```mermaid\nflowchart TD\n A["시작"] --> B["완료"]\n```',
  "mermaid",
);
assert.equal(mermaid.extension, "mmd");
assert.ok(mermaid.bytes.toString().startsWith("flowchart TD"));
checks++;
for (const bad of [
  'flowchart TD\nclick A "https://example.org"',
  "%%{init: {}}%%\nflowchart TD\nA-->B",
]) {
  await assert.rejects(() => exportDocument(bad, "mermaid"));
  checks++;
}
await assert.rejects(() => exportDocument("text", "invalid"));
checks++;
console.log(
  `Chatbot document formats: ${checks} checks passed (real DOCX/PPTX packages, Korean PDF extraction, Mermaid restrictions).`,
);
