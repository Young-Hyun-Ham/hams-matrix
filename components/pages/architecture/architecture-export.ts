// Rasterize the same self-contained SVG used by the screen and preview.
export async function architecturePng(svg: SVGSVGElement): Promise<Blob> {
  await document.fonts.ready;
  const width = Number(svg.getAttribute("width"));
  const height = Number(svg.getAttribute("height"));
  const ratio = Math.min(
    2,
    16000 / width,
    16000 / height,
    Math.sqrt(32000000 / (width * height)),
  );
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.removeAttribute("class");
  const source = new Blob([new XMLSerializer().serializeToString(clone)], {
    type: "image/svg+xml;charset=utf-8",
  });
  const url = URL.createObjectURL(source);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("SVG 이미지를 읽지 못했습니다."));
      image.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("이미지를 생성할 수 없습니다.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) =>
          blob ? resolve(blob) : reject(new Error("PNG 변환에 실패했습니다.")),
        "image/png",
      ),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
