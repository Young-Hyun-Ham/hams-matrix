export type DocumentBlock =
  | { kind: "heading"; text: string; level: number }
  | { kind: "text"; text: string }
  | { kind: "table"; rows: string[][] }
  | { kind: "image"; mime: string; base64: string }
  | { kind: "break" };
export const xml = (s: string) =>
  s
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
export const plain = (s: string) =>
  s
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
export function documentBlocks(source: string): DocumentBlock[] {
  const lines = source
    .replace(/\r/g, "")
    .replace(
      /(!\[[^\]\n]*\]\(data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+=*\))/g,
      "\n$1\n",
    )
    .split("\n");
  const blocks: DocumentBlock[] = [];
  const cells = (s: string) =>
    s
      .trim()
      .replace(/^\||\|$/g, "")
      .split("|")
      .map((v) => plain(v.trim()));
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || /^```/.test(line)) continue;
    const image =
      /^!\[[^\]]*\]\(data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/]+=*)\)$/.exec(
        line,
      );
    if (image) {
      blocks.push({ kind: "image", mime: image[1], base64: image[2] });
      continue;
    }
    if (/^---+$/.test(line)) {
      blocks.push({ kind: "break" });
      continue;
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      blocks.push({
        kind: "heading",
        level: heading[1].length,
        text: plain(heading[2]),
      });
      continue;
    }
    if (line.includes("|") && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1] ?? "")) {
      const rows = [cells(line)];
      i++;
      while (lines[i + 1]?.trim().includes("|")) rows.push(cells(lines[++i]));
      const columns = Math.max(...rows.map((r) => r.length));
      if (columns > 12 || rows.length > 100)
        throw Error("문서 표는 최대 12열·100행입니다.");
      blocks.push({
        kind: "table",
        rows: rows.map((r) =>
          Array.from({ length: columns }, (_, n) => r[n] ?? ""),
        ),
      });
      continue;
    }
    blocks.push({ kind: "text", text: plain(line) });
  }
  if (blocks.length > 3000) throw Error("문서가 너무 깁니다.");
  return blocks;
}
export function documentHtml(source: string) {
  const content = documentBlocks(source)
    .map((b) =>
      b.kind === "heading"
        ? `<h${b.level}>${xml(b.text)}</h${b.level}>`
        : b.kind === "text"
          ? `<p>${xml(b.text)}</p>`
          : b.kind === "break"
            ? '<div class="page-break"></div>'
            : b.kind === "image"
              ? `<img alt="문서 이미지" src="data:${b.mime};base64,${b.base64}">`
              : `<table>${b.rows.map((row, n) => `<tr>${row.map((c) => `<${n ? "td" : "th"}>${xml(c)}</${n ? "td" : "th"}>`).join("")}</tr>`).join("")}</table>`,
    )
    .join("\n");
  return `<!doctype html><html lang="ko"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>문서</title><style>@page{size:A4;margin:18mm}body{font:11pt/1.6 'Malgun Gothic','Noto Sans CJK KR',sans-serif;color:#172033}h1,h2,h3{line-height:1.3;break-after:avoid}p{white-space:pre-wrap;overflow-wrap:anywhere}table{border-collapse:collapse;width:100%;margin:12px 0;table-layout:fixed}td,th{border:1px solid #bcc4d0;padding:6px;overflow-wrap:anywhere}th{background:#edf1f7}img{max-width:100%;max-height:240mm;object-fit:contain;break-inside:avoid}.page-break{break-before:page}</style><body>${content}</body></html>`;
}
