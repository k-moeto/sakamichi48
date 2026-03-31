import { request } from "playwright";

import { getCachedHtml, setCachedHtml } from "./cache.js";

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchHtml(url: string, delayMs = 2200): Promise<string> {
  const cached = await getCachedHtml(url);
  if (cached) {
    return cached;
  }

  const api = await request.newContext({
    userAgent: "sakamichi48-bot/0.1 (+research use)"
  });

  try {
    await wait(delayMs);
    const response = await api.get(url);
    if (!response.ok()) {
      throw new Error(`failed to fetch ${url}: ${response.status()}`);
    }

    const html = await response.text();
    await setCachedHtml(url, html);
    return html;
  } finally {
    await api.dispose();
  }
}
