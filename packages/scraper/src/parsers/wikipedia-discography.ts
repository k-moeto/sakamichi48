import { load } from "cheerio";

const WIKIPEDIA_BASE = "https://ja.wikipedia.org";

function normalizeSpace(input: string): string {
  return input.replace(/\[[^\]]*\]/g, "").replace(/\s+/g, " ").trim();
}

function toAbsoluteUrl(href: string): string {
  if (href.startsWith("http")) return href;
  if (href.startsWith("//")) return `https:${href}`;
  return `${WIKIPEDIA_BASE}${href}`;
}

function isWikiLink(href: string): boolean {
  return (
    (href.startsWith("/wiki/") || href.includes("/wiki/")) &&
    !href.includes(":") &&
    !href.includes("#")
  );
}

export type DiscographyEntry = {
  title: string;
  url: string;
};

export function extractSingleUrlsFromDiscography(html: string): DiscographyEntry[] {
  const $ = load(html);
  const entries: DiscographyEntry[] = [];
  const seen = new Set<string>();

  // Strategy 1: Links inside wikitables (discography tables)
  $("table.wikitable a").each((_, anchor) => {
    const href = $(anchor).attr("href");
    const text = normalizeSpace($(anchor).text());

    if (!href || !isWikiLink(href)) return;
    if (text.length < 2) return;

    // Exclude obvious non-release links (group pages, categories, etc.)
    if (/一覧|関連作品|テンプレート|Category|グループ|48$|46$/.test(text)) return;
    if (/の作品|作品一覧/.test(text)) return;

    const url = toAbsoluteUrl(href);
    if (seen.has(url)) return;
    seen.add(url);
    entries.push({ title: text, url });
  });

  // Strategy 2: Links in ul/ol lists under シングル/アルバム headings
  let inSingleSection = false;
  $(".mw-parser-output").children().each((_, el) => {
    const tagName = (el as any).tagName ?? "";
    const $el = $(el);

    if (/^h[2-3]$/.test(tagName)) {
      const headingText = normalizeSpace($el.text());
      inSingleSection = /シングル|ディスコグラフィ|作品/.test(headingText);
    }

    if (inSingleSection && /^(?:ul|ol|table|div)$/.test(tagName)) {
      $el.find("a").each((_, anchor) => {
        const href = $(anchor).attr("href");
        const text = normalizeSpace($(anchor).text());

        if (!href || !isWikiLink(href)) return;
        if (text.length < 2) return;
        if (/一覧|関連作品|テンプレート|Category|グループ|48$|46$/.test(text)) return;
        if (/の作品|作品一覧/.test(text)) return;

        const url = toAbsoluteUrl(href);
        if (seen.has(url)) return;
        seen.add(url);
        entries.push({ title: text, url });
      });
    }
  });

  return entries;
}

export function buildTitleToUrlMap(entries: DiscographyEntry[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const entry of entries) {
    const normalized = entry.title
      .normalize("NFKC")
      .replace(/\s+/g, " ")
      .trim();
    map.set(normalized, entry.url);
  }
  return map;
}

export function findWikipediaUrl(
  releaseTitle: string,
  titleToUrl: Map<string, string>
): string | undefined {
  const normalized = releaseTitle
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .replace(/\s*\[.*?\]\s*$/, "")
    .trim();

  // Exact match
  if (titleToUrl.has(normalized)) return titleToUrl.get(normalized);

  // Partial match: release title contains the Wikipedia title or vice versa
  for (const [wikiTitle, url] of titleToUrl) {
    if (normalized.includes(wikiTitle) || wikiTitle.includes(normalized)) {
      return url;
    }
  }

  return undefined;
}
