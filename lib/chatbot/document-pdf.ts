import "server-only";
import { access, mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { join, resolve, dirname, basename } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { fail } from "./server";
import { documentHtml } from "./document-blocks";
export async function documentPdf(source: string, signal?: AbortSignal) {
  const candidates = [
    process.env.CHATBOT_CHROMIUM_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
  ].filter(Boolean) as string[];
  let executable = "";
  for (const candidate of candidates) {
    try {
      await access(candidate);
      executable = candidate;
      break;
    } catch {}
  }
  if (!executable)
    fail(503, "PDF 변환용 Chromium을 설정해 주세요. (CHATBOT_CHROMIUM_PATH)");
  const root = resolve(tmpdir()),
    folder = await mkdtemp(join(root, "chatbot-document-"));
  try {
    const output = join(folder, "document.pdf");
    await writeFile(
      join(folder, "document.html"),
      documentHtml(source),
      "utf8",
    );
    const env: NodeJS.ProcessEnv = {
      NODE_ENV: process.env.NODE_ENV ?? "production",
    };
    for (const key of [
      "SystemRoot",
      "SystemDrive",
      "WINDIR",
      "TEMP",
      "TMP",
      "PATH",
      "HOME",
      "LANG",
      "FONTCONFIG_PATH",
      "LOCALAPPDATA",
      "APPDATA",
      "USERPROFILE",
    ])
      if (process.env[key]) env[key] = process.env[key];
    await new Promise<void>((done, reject) => {
      const child = spawn(
        executable,
        [
          "--headless=new",
          "--disable-gpu",
          "--disable-background-networking",
          "--no-first-run",
          "--no-pdf-header-footer",
          "--host-resolver-rules=MAP * ~NOTFOUND",
          `--user-data-dir=${join(folder, "profile")}`,
          `--print-to-pdf=${output}`,
          pathToFileURL(join(folder, "document.html")).href,
        ],
        { windowsHide: true, stdio: "ignore", env, signal, timeout: 45000 },
      );
      child.on("error", () =>
        reject(new Error("PDF 변환 프로세스를 실행하지 못했습니다.")),
      );
      child.on("exit", (code) =>
        code === 0 ? done() : reject(new Error("PDF 변환에 실패했습니다.")),
      );
    });
    const bytes = await readFile(output);
    if (
      bytes.length > 67108864 ||
      !bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))
    )
      fail(502, "유효한 PDF를 생성하지 못했습니다.");
    return bytes;
  } finally {
    // Only remove the exact temporary directory created above; never a computed parent.
    if (
      dirname(resolve(folder)) === root &&
      basename(folder).startsWith("chatbot-document-")
    )
      await rm(folder, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 200,
      });
  }
}
