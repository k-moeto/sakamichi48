import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const CACHE_DIR = path.resolve(process.cwd(), ".cache", "utanet");

function cachePath(url: string): string {
  const hash = createHash("sha256").update(url).digest("hex");
  return path.join(CACHE_DIR, `${hash}.html`);
}

export async function getCachedHtml(url: string): Promise<string | null> {
  try {
    const file = cachePath(url);
    return await readFile(file, "utf8");
  } catch {
    return null;
  }
}

export async function setCachedHtml(url: string, html: string): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(cachePath(url), html, "utf8");
}
