import { promises as fs } from "node:fs";
import path from "node:path";

import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { requirePlatformAdmin } from "@/lib/plans";

import MarkdownViewer from "./md/MarkdownViewer";

export type MarkdownDocument = {
  name: string;
  relativePath: string;
  content: string;
  modifiedAt: string;
  size: number;
};

const DOCS_DIRECTORY = path.join(process.cwd(), "docs");

async function findMarkdownFiles(directory: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const nestedFiles = await Promise.all(
      entries.map(async (entry) => {
        const absolutePath = path.join(directory, entry.name);

        if (entry.isDirectory()) return findMarkdownFiles(absolutePath);
        if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
          return [absolutePath];
        }
        return [];
      }),
    );
    return nestedFiles.flat();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function loadDocuments(): Promise<MarkdownDocument[]> {
  const files = await findMarkdownFiles(DOCS_DIRECTORY);
  const documents = await Promise.all(
    files.map(async (absolutePath) => {
      const [content, stats] = await Promise.all([
        fs.readFile(absolutePath, "utf8"),
        fs.stat(absolutePath),
      ]);
      const relativePath = path
        .relative(DOCS_DIRECTORY, absolutePath)
        .split(path.sep)
        .join("/");

      return {
        name: path.basename(absolutePath, path.extname(absolutePath)),
        relativePath,
        content,
        modifiedAt: stats.mtime.toISOString(),
        size: stats.size,
      };
    }),
  );

  return documents.sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath, "ko"),
  );
}

export default function Page() {
  return (
    <Suspense fallback={<p>문서 뷰어를 불러오는 중입니다.</p>}>
      <MarkdownViewerPage />
    </Suspense>
  );
}

async function MarkdownViewerPage() {
  const user = await requireUser();
  requirePlatformAdmin(user);

  const documents = await loadDocuments();

  return <MarkdownViewer documents={documents} />;
}
