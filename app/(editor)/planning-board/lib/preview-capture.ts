export type CaptureRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function capturePixels(
  region: CaptureRegion,
  width: number,
  height: number,
) {
  const x = Math.max(0, Math.min(width - 1, Math.floor(region.x * width)));
  const y = Math.max(0, Math.min(height - 1, Math.floor(region.y * height)));
  const right = Math.max(
    x + 1,
    Math.min(width, Math.ceil((region.x + region.width) * width)),
  );
  const bottom = Math.max(
    y + 1,
    Math.min(height, Math.ceil((region.y + region.height) * height)),
  );
  return { x, y, width: right - x, height: bottom - y };
}

export async function previewCapture(
  node: HTMLElement,
  region?: CaptureRegion,
) {
  const width = node.offsetWidth,
    height = node.offsetHeight;
  if (!width || !height) throw new Error("캡처할 페이지가 없습니다.");
  if (width > 16384 || height > 16384 || width * height > 16_777_216)
    throw new Error(
      "페이지 크기가 너무 큽니다. 페이지 크기를 줄인 뒤 캡처해 주세요.",
    );
  await document.fonts.ready;
  const { toCanvas } = await import("html-to-image");
  const canvas = await toCanvas(node, {
    width,
    height,
    canvasWidth: width,
    canvasHeight: height,
    pixelRatio: 1,
    skipAutoScale: true,
    includeQueryParams: true,
    fetchRequestInit: { credentials: "same-origin" },
    style: {
      transform: "none",
      transformOrigin: "top left",
      boxShadow: "none",
    },
  });
  let output = canvas;
  if (region) {
    const crop = capturePixels(region, canvas.width, canvas.height);
    output = document.createElement("canvas");
    output.width = crop.width;
    output.height = crop.height;
    const context = output.getContext("2d");
    if (!context) throw new Error("이미지를 생성할 수 없습니다.");
    context.drawImage(
      canvas,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      0,
      0,
      crop.width,
      crop.height,
    );
  }
  return new Promise<Blob>((resolve, reject) =>
    output.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error("PNG 이미지 생성에 실패했습니다.")),
      "image/png",
    ),
  );
}

export function downloadCapture(blob: Blob, pageName: string, region: boolean) {
  const name =
    Array.from(pageName)
      .filter((char) => char.charCodeAt(0) >= 32)
      .join("")
      .replace(/[<>:"/\\|?*]/g, "_")
      .trim()
      .slice(0, 80) || "page";
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `planning-${name}-${region ? "region" : "page"}-${Date.now()}.png`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
