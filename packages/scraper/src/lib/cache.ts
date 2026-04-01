import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const BASE_CACHE_DIR = path.resolve(process.cwd(), ".cache");

function domainBucket(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    if (hostname.includes("wikipedia")) return "wikipedia";
    if (hostname.includes("uta-net")) return "utanet";
    return hostname.replace(/\./g, "_");
  } catch {
    return "utanet";
  }
}

function cachePath(url: string): string {
  const hash = createHash("sha256").update(url).digest("hex");
  return path.join(BASE_CACHE_DIR, domainBucket(url), `${hash}.html`);
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
  const file = cachePath(url);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, html, "utf8");
}
