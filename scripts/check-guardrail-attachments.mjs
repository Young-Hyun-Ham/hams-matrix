import assert from "node:assert/strict";
import { zipSync, strToU8 } from "fflate";

function pdfFixture(text) {
  const content = text ? `BT /F1 12 Tf 72 720 Td (${text}) Tj ET` : "";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
  ];
  let source = "%PDF-1.4\n", offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(source)); source += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const position = Buffer.byteLength(source);
  source += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` + offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  return Buffer.from(source + `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${position}\n%%EOF\n`);
}
export async function checkGuardrailAttachments({ request, client, cookie, base, defaults }) {
  await client.execute("DELETE FROM auth_rate_limits");
  const endpoint = "/api/admin/ai-guardrails";
  const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jQIoAAAAASUVORK5CYII=";
  const post = data => request(endpoint, { cookie, method: "POST", data: { action: "test", policy: defaults, stage: "input", text: "", ...data } });
  const file = (name, data) => ({ name, base64: Buffer.from(data).toString("base64") });
  assert.equal((await post({})).status, 400);
  let response = await post({ images: [{ dataUrl: png }] });
  assert.equal(response.status, 200, await response.clone().text());
  let data = await response.json();
  assert.equal(data.attachments.images, 1);
  assert.equal(data.attachments.readOnly, true);
  assert.equal(data.result.imageInspection, "not-inspected", "read-only must not imply visual inspection");
  response = await post({ policy: { ...defaults, imageMode: "block" }, images: [{ dataUrl: png }] });
  data = await response.json();
  assert.equal(data.result.decision, "block");
  assert.equal(data.result.imageInspection, "blocked");
  response = await post({ policy: { ...defaults, classifierEnabled: true, classifierModel: base.model, imageMode: "scan" }, text: "[EXPECT_IMAGE]", images: [{ dataUrl: png }] });
  assert.equal(response.status, 200, await response.clone().text());
  data = await response.json();
  assert.equal(data.result.decision, "allow");
  assert.equal(data.result.imageInspection, "classified", "the actual image must reach the classifier");
  assert.equal((await post({ images: [{ dataUrl: "data:image/png;base64,broken" }] })).status, 400);
  assert.equal((await post({ images: Array.from({ length: 4 }, () => ({ dataUrl: png })) })).status, 400);

  const blocked = { ...defaults, blockedTerms: ["ATTACHMENT_DENIED"] };
  for (const extension of ["txt", "md", "csv", "json", "log", "yaml", "xml"]) {
    response = await post({ policy: blocked, files: [file(`test.${extension}`, "ATTACHMENT_DENIED")] });
    assert.equal(response.status, 200, await response.clone().text());
    data = await response.json();
    assert.equal(data.result.decision, "block", extension);
    assert.ok(data.attachments.files[0].characters > 0);
    assert.ok(!JSON.stringify(data).includes("ATTACHMENT_DENIED"), "extracted text must not be returned");
  }
  await client.execute("DELETE FROM auth_rate_limits");
  response = await post({ policy: blocked, files: [file("test.pdf", pdfFixture("ATTACHMENT_DENIED"))] });
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal((await response.json()).result.decision, "block", "PDF text must actually be extracted");
  const docx = zipSync({
    "[Content_Types].xml": strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'),
    "word/document.xml": strToU8('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>normal document text</w:t></w:r></w:p></w:body></w:document>'),
    "word/header1.xml": strToU8('<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>ATTACHMENT_DENIED</w:t></w:r></w:p></w:hdr>'),
  });
  response = await post({ policy: blocked, files: [file("test.docx", docx)] });
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal((await response.json()).result.decision, "block", "DOCX headers must be included");
  assert.equal((await post({ files: [file("scan.pdf", pdfFixture(""))] })).status, 400, "empty/scanned PDF cannot silently pass");
  assert.equal((await post({ files: [file("broken.docx", "broken document")] })).status, 400);
  assert.equal((await post({ files: [file("old.doc", "old binary format")] })).status, 400);
  assert.equal((await post({ files: Array.from({ length: 4 }, () => file("test.txt", "test")) })).status, 400);
  assert.equal((await post({ files: [file("big.txt", Buffer.alloc(4 * 1024 * 1024 + 1, 65))] })).status, 400);
  assert.equal((await post({ files: [file("binary.txt", Buffer.from([255, 0, 255]))] })).status, 400);
  response = await post({ policy: blocked, text: "normal text", images: [{ dataUrl: png }], files: [file("test.txt", "ATTACHMENT_DENIED")] });
  data = await response.json();
  assert.equal(data.result.decision, "block", "a permitted image cannot override a blocked attachment");
  assert.equal(data.attachments.images, 1);
  assert.equal(data.attachments.files.length, 1);
  console.log("PASS: attachment-only and mixed policy tests, classifier image forwarding, read-only/blocked image states, text/PDF/DOCX extraction, headers, limits, malformed files, and empty PDFs.");
}
