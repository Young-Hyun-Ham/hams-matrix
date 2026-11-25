import "server-only";
import { zipSync, strToU8 } from "fflate";
import sharp from "sharp";
import { documentBlocks, xml, type DocumentBlock } from "./document-blocks";
const declaration = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const relNS = "http://schemas.openxmlformats.org/package/2006/relationships";
const office =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/";
const drawing = "http://schemas.openxmlformats.org/drawingml/2006/main";
const emu = (n: number) => Math.round(n * 914400);
type Entry = Record<string, Uint8Array>;
const relationships = (items: { id: string; type: string; target: string }[]) =>
  `${declaration}<Relationships xmlns="${relNS}">${items.map((i) => `<Relationship Id="${i.id}" Type="${office + i.type}" Target="${i.target}"/>`).join("")}</Relationships>`;
function contentTypes(overrides: Record<string, string>) {
  return `${declaration}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/>${Object.entries(
    overrides,
  )
    .map(
      ([name, type]) =>
        `<Override PartName="/${name}" ContentType="application/vnd.openxmlformats-officedocument.${type}+xml"/>`,
    )
    .join("")}</Types>`;
}
async function media(blocks: DocumentBlock[], root: string, entries: Entry) {
  const result = new Map<
    DocumentBlock,
    { id: string; name: string; width: number; height: number }
  >();
  for (const block of blocks)
    if (block.kind === "image") {
      const bytes = Buffer.from(block.base64, "base64"),
        meta = await sharp(bytes, { limitInputPixels: 40000000 }).metadata();
      if (!meta.width || !meta.height)
        throw Error("문서 이미지 크기를 확인할 수 없습니다.");
      const index = result.size + 1,
        name = `image${index}.${block.mime === "image/jpeg" ? "jpeg" : "png"}`;
      entries[`${root}/media/${name}`] = bytes;
      result.set(block, {
        id: `image${index}`,
        name,
        width: meta.width,
        height: meta.height,
      });
    }
  return result;
}
export async function documentDocx(source: string) {
  const blocks = documentBlocks(source),
    entries: Entry = {},
    images = await media(blocks, "word", entries);
  const paragraph = (text: string, level = 0) =>
    `<w:p><w:pPr>${level ? `<w:pStyle w:val="Heading${Math.min(level, 3)}"/>` : ""}<w:spacing w:after="160"/></w:pPr><w:r><w:t xml:space="preserve">${xml(text)}</w:t></w:r></w:p>`;
  let drawingId = 0;
  const body = blocks
    .map((block) => {
      if (block.kind === "heading") return paragraph(block.text, block.level);
      if (block.kind === "text") return paragraph(block.text);
      if (block.kind === "break")
        return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
      if (block.kind === "table")
        return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>${["top", "left", "bottom", "right", "insideH", "insideV"].map((x) => `<w:${x} w:val="single" w:sz="4" w:color="AAB4C4"/>`).join("")}</w:tblBorders></w:tblPr><w:tblGrid>${block.rows[0].map(() => '<w:gridCol w:w="1800"/>').join("")}</w:tblGrid>${block.rows.map((row, index) => `<w:tr>${index === 0 ? "<w:trPr><w:tblHeader/></w:trPr>" : ""}${row.map((text) => `<w:tc><w:tcPr>${index === 0 ? '<w:shd w:fill="EDF1F7"/>' : ""}<w:tcW w:w="${Math.floor(5000 / row.length)}" w:type="pct"/></w:tcPr>${paragraph(text)}</w:tc>`).join("")}</w:tr>`).join("")}</w:tbl>`;
      const image = images.get(block)!;
      const ratio = Math.min(6.2 / image.width, 8 / image.height);
      const cx = emu(image.width * ratio),
        cy = emu(image.height * ratio);
      drawingId++;
      return `<w:p><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${drawingId}" name="문서 이미지 ${drawingId}"/><a:graphic xmlns:a="${drawing}"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${drawingId}" name="${image.name}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${image.id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
    })
    .join("");
  entries["word/document.xml"] = strToU8(
    `${declaration}<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="${office.slice(0, -1)}" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body></w:document>`,
  );
  entries["word/styles.xml"] = strToU8(
    `${declaration}<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Malgun Gothic" w:hAnsi="Malgun Gothic" w:eastAsia="맑은 고딕"/><w:sz w:val="22"/><w:lang w:val="ko-KR" w:eastAsia="ko-KR"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>${[1, 2, 3].map((level) => `<w:style w:type="paragraph" w:styleId="Heading${level}"><w:name w:val="heading ${level}"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:outlineLvl w:val="${level - 1}"/></w:pPr><w:rPr><w:b/><w:sz w:val="${40 - level * 4}"/></w:rPr></w:style>`).join("")}</w:styles>`,
  );
  entries["word/_rels/document.xml.rels"] = strToU8(
    relationships([
      { id: "styles", type: "styles", target: "styles.xml" },
      ...Array.from(images.values(), (i) => ({
        id: i.id,
        type: "image",
        target: `media/${i.name}`,
      })),
    ]),
  );
  entries["_rels/.rels"] = strToU8(
    relationships([
      { id: "document", type: "officeDocument", target: "word/document.xml" },
    ]),
  );
  entries["[Content_Types].xml"] = strToU8(
    contentTypes({
      "word/document.xml": "wordprocessingml.document.main",
      "word/styles.xml": "wordprocessingml.styles",
    }),
  );
  return Buffer.from(zipSync(entries, { level: 6 }));
}
const group =
  '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';
const namespaces = `xmlns:a="${drawing}" xmlns:r="${office.slice(0, -1)}" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"`;
function shape(
  id: number,
  text: string,
  x: number,
  y: number,
  w: number,
  h: number,
  size: number,
) {
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Text ${id}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${emu(x)}" y="${emu(y)}"/><a:ext cx="${emu(w)}" cy="${emu(h)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0"><a:normAutofit/></a:bodyPr><a:lstStyle/>${text
    .split("\n")
    .map(
      (t) =>
        `<a:p><a:r><a:rPr lang="ko-KR" sz="${size * 100}"><a:solidFill><a:srgbClr val="172033"/></a:solidFill><a:latin typeface="Malgun Gothic"/><a:ea typeface="맑은 고딕"/></a:rPr><a:t>${xml(t)}</a:t></a:r><a:endParaRPr lang="ko-KR"/></a:p>`,
    )
    .join("")}</p:txBody></p:sp>`;
}
export async function documentPptx(source: string) {
  const blocks = documentBlocks(source),
    entries: Entry = {},
    images = await media(blocks, "ppt", entries);
  const slides: { title: string; blocks: DocumentBlock[] }[] = [];
  let current = { title: "문서", blocks: [] as DocumentBlock[] };
  let height = 0;
  const push = () => {
    if (current.blocks.length || current.title !== "문서") slides.push(current);
    current = { title: "문서", blocks: [] };
    height = 0;
  };
  const add = (b: DocumentBlock, cost: number) => {
    if (height + cost > 4.9 && current.blocks.length) {
      const title = current.title;
      push();
      current.title = title + " (계속)";
    }
    current.blocks.push(b);
    height += cost;
  };
  for (const b of blocks) {
    if (b.kind === "break") {
      push();
      continue;
    }
    if (b.kind === "heading" && b.level <= 2) {
      if (current.blocks.length || current.title !== "문서") push();
      current.title = b.text;
      continue;
    }
    if (b.kind === "text" || b.kind === "heading") {
      const chunks = b.text.match(/[\s\S]{1,200}/g) ?? [""];
      for (const text of chunks)
        add({ kind: "text", text }, Math.ceil(text.length / 55) * 0.32 + 0.16);
    } else if (b.kind === "table") {
      for (let i = 1; i < b.rows.length; i += 6) {
        const rows = [b.rows[0], ...b.rows.slice(i, i + 6)];
        add({ kind: "table", rows }, rows.length * 0.55 + 0.15);
      }
      if (b.rows.length === 1) add(b, 0.7);
    } else add(b, 3.6);
  }
  push();
  if (!slides.length || slides.length > 100)
    throw Error("슬라이드는 1~100장으로 구성해 주세요.");
  const overrides: Record<string, string> = {
    "ppt/presentation.xml": "presentationml.presentation.main",
    "ppt/slideMasters/slideMaster1.xml": "presentationml.slideMaster",
    "ppt/slideLayouts/slideLayout1.xml": "presentationml.slideLayout",
    "ppt/theme/theme1.xml": "theme",
  };
  slides.forEach((slide, index) => {
    let id = 2,
      y = 1.4;
    const refs = [
      {
        id: "layout",
        type: "slideLayout",
        target: "../slideLayouts/slideLayout1.xml",
      },
    ];
    const shapes = [shape(id++, slide.title, 0.7, 0.4, 12, 0.8, 30)];
    for (const b of slide.blocks) {
      if (b.kind === "text" || b.kind === "heading") {
        const h = Math.ceil(b.text.length / 55) * 0.32 + 0.16;
        shapes.push(shape(id++, b.text, 0.7, y, 12, h, 18));
        y += h;
      } else if (b.kind === "table") {
        const columns = b.rows[0].length,
          cw = emu(12 / columns),
          rh = emu(0.55);
        const text = (s: string) =>
          `<a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="ko-KR" sz="1200"><a:latin typeface="Malgun Gothic"/><a:ea typeface="맑은 고딕"/></a:rPr><a:t>${xml(s)}</a:t></a:r></a:p></a:txBody>`;
        shapes.push(
          `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id++}" name="문서 표"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="${emu(0.7)}" y="${emu(y)}"/><a:ext cx="${emu(12)}" cy="${rh * b.rows.length}"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr firstRow="1" bandRow="1"/><a:tblGrid>${b.rows[0].map(() => `<a:gridCol w="${cw}"/>`).join("")}</a:tblGrid>${b.rows.map((row) => `<a:tr h="${rh}">${row.map((cell) => `<a:tc>${text(cell)}<a:tcPr/></a:tc>`).join("")}</a:tr>`).join("")}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`,
        );
        y += b.rows.length * 0.55 + 0.15;
      } else if (b.kind === "image") {
        const m = images.get(b)!,
          scale = Math.min(12 / m.width, 3.4 / m.height),
          w = m.width * scale,
          h = m.height * scale;
        refs.push({ id: m.id, type: "image", target: `../media/${m.name}` });
        shapes.push(
          `<p:pic><p:nvPicPr><p:cNvPr id="${id++}" name="문서 이미지"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${m.id}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="${emu(0.7)}" y="${emu(y)}"/><a:ext cx="${emu(w)}" cy="${emu(h)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`,
        );
        y += 3.6;
      }
    }
    const name = `ppt/slides/slide${index + 1}.xml`;
    overrides[name] = "presentationml.slide";
    entries[name] = strToU8(
      `${declaration}<p:sld ${namespaces}><p:cSld><p:spTree>${group}${shapes.join("")}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`,
    );
    entries[`ppt/slides/_rels/slide${index + 1}.xml.rels`] = strToU8(
      relationships(Array.from(new Map(refs.map((r) => [r.id, r])).values())),
    );
  });
  entries["ppt/presentation.xml"] = strToU8(
    `${declaration}<p:presentation ${namespaces}><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="master"/></p:sldMasterIdLst><p:sldIdLst>${slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="slide${i + 1}"/>`).join("")}</p:sldIdLst><p:sldSz cx="12192000" cy="6858000" type="screen16x9"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`,
  );
  entries["ppt/_rels/presentation.xml.rels"] = strToU8(
    relationships([
      {
        id: "master",
        type: "slideMaster",
        target: "slideMasters/slideMaster1.xml",
      },
      ...slides.map((_, i) => ({
        id: `slide${i + 1}`,
        type: "slide",
        target: `slides/slide${i + 1}.xml`,
      })),
    ]),
  );
  const clrMap =
    '<p:clrMap accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" bg1="lt1" bg2="lt2" folHlink="folHlink" hlink="hlink" tx1="dk1" tx2="dk2"/>';
  entries["ppt/slideMasters/slideMaster1.xml"] = strToU8(
    `${declaration}<p:sldMaster ${namespaces}><p:cSld><p:spTree>${group}</p:spTree></p:cSld>${clrMap}<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="layout"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>`,
  );
  entries["ppt/slideMasters/_rels/slideMaster1.xml.rels"] = strToU8(
    relationships([
      {
        id: "layout",
        type: "slideLayout",
        target: "../slideLayouts/slideLayout1.xml",
      },
      { id: "theme", type: "theme", target: "../theme/theme1.xml" },
    ]),
  );
  entries["ppt/slideLayouts/slideLayout1.xml"] = strToU8(
    `${declaration}<p:sldLayout ${namespaces} type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>${group}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`,
  );
  entries["ppt/slideLayouts/_rels/slideLayout1.xml.rels"] = strToU8(
    relationships([
      {
        id: "master",
        type: "slideMaster",
        target: "../slideMasters/slideMaster1.xml",
      },
    ]),
  );
  const colors = [
      "172033",
      "FFFFFF",
      "334155",
      "EDF1F7",
      "2563EB",
      "16A34A",
      "D97706",
      "9333EA",
      "DB2777",
      "0891B2",
      "2563EB",
      "7C3AED",
    ],
    names = [
      "dk1",
      "lt1",
      "dk2",
      "lt2",
      "accent1",
      "accent2",
      "accent3",
      "accent4",
      "accent5",
      "accent6",
      "hlink",
      "folHlink",
    ];
  const fill = '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>';
  entries["ppt/theme/theme1.xml"] = strToU8(
    `${declaration}<a:theme xmlns:a="${drawing}" name="Chatbot"><a:themeElements><a:clrScheme name="Chatbot">${names.map((n, i) => `<a:${n}><a:srgbClr val="${colors[i]}"/></a:${n}>`).join("")}</a:clrScheme><a:fontScheme name="Korean">${["majorFont", "minorFont"].map((n) => `<a:${n}><a:latin typeface="Malgun Gothic"/><a:ea typeface="맑은 고딕"/><a:cs typeface="Arial"/></a:${n}>`).join("")}</a:fontScheme><a:fmtScheme name="Chatbot"><a:fillStyleLst>${fill.repeat(3)}</a:fillStyleLst><a:lnStyleLst>${`<a:ln w="9525">${fill}<a:prstDash val="solid"/></a:ln>`.repeat(3)}</a:lnStyleLst><a:effectStyleLst>${"<a:effectStyle><a:effectLst/></a:effectStyle>".repeat(3)}</a:effectStyleLst><a:bgFillStyleLst>${fill.repeat(3)}</a:bgFillStyleLst></a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>`,
  );
  entries["_rels/.rels"] = strToU8(
    relationships([
      {
        id: "document",
        type: "officeDocument",
        target: "ppt/presentation.xml",
      },
    ]),
  );
  entries["[Content_Types].xml"] = strToU8(contentTypes(overrides));
  return Buffer.from(zipSync(entries, { level: 6 }));
}
