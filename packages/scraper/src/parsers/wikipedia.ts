import { load, type CheerioAPI } from "cheerio";

import { splitNames } from "../lib/normalizer.js";
import type { CreditRole, GroupSeed, ScrapedCredit, ScrapedRelease, ScrapedSong } from "../types/models.js";

const WIKIPEDIA_BASE = "https://ja.wikipedia.org";

type ColumnIndexMap = {
  trackNo?: number;
  title?: number;
  lyricist?: number;
  composer?: number;
  arranger?: number;
};

function toAbsoluteUrl(href: string): string {
  if (href.startsWith("http")) {
    return href;
  }
  return `${WIKIPEDIA_BASE}${href}`;
}

function normalizeSpace(input: string): string {
  return input.replace(/\[[^\]]*\]/g, "").replace(/\s+/g, " ").trim();
}

function parseReleaseNumber(text: string): number | undefined {
  const m = text.match(/(\d+)\s*(st|nd|rd|th|枚目|作目)?/i);
  return m ? Number(m[1] ?? "0") : undefined;
}

function parseReleaseDate(raw: string): string | undefined {
  const m = raw.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (!m) {
    return undefined;
  }

  const year = Number(m[1] ?? "0");
  const month = String(Number(m[2] ?? "1")).padStart(2, "0");
  const day = String(Number(m[3] ?? "1")).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function detectReleaseType(text: string): "single" | "album" | "other" {
  if (text.includes("シングル") || text.includes("Single")) {
    return "single";
  }
  if (text.includes("アルバム") || text.includes("Album")) {
    return "album";
  }
  return "other";
}

function parseCreditsFromText(text: string): ScrapedCredit[] {
  const credits: ScrapedCredit[] = [];

  const patterns: Array<{ role: CreditRole; regex: RegExp }> = [
    { role: "lyricist", regex: /作詞\s*[:：]\s*(.+?)(?=\s*(?:作曲|編曲)\s*[:：]|$)/ },
    { role: "composer", regex: /作曲\s*[:：]\s*(.+?)(?=\s*(?:編曲|作詞)\s*[:：]|$)/ },
    { role: "arranger", regex: /編曲\s*[:：]\s*(.+?)(?=\s*(?:作詞|作曲)\s*[:：]|$)/ }
  ];

  for (const p of patterns) {
    const m = text.match(p.regex);
    if (!m) {
      continue;
    }

    const names = splitNames(normalizeSpace(m[1] ?? ""));
    if (names.length === 0) {
      continue;
    }

    credits.push({ role: p.role, names });
  }

  return credits;
}

function sanitizeSongTitle(title: string): string {
  return normalizeSpace(title)
    .replace(/^\d+[\.\)]\s*/, "")
    .replace(/[「」『』]/g, "")
    .replace(/^(?:M\d+\.)\s*/i, "")
    .trim();
}

function parseTrackNumber(text: string, fallback: number): number {
  const m = normalizeSpace(text).match(/^(\d+)/);
  if (!m) {
    return fallback;
  }
  return Number(m[1]);
}

function headerToColumnMap(headers: string[]): ColumnIndexMap | null {
  const map: ColumnIndexMap = {};

  headers.forEach((header, index) => {
    const normalized = normalizeSpace(header);

    if (/^(?:No\.?|#|曲順|番号|M\d+)/i.test(normalized) || normalized.includes("No.")) {
      map.trackNo = index;
    }
    if (normalized.includes("曲名") || normalized.includes("タイトル") || normalized.includes("楽曲")) {
      map.title = index;
    }
    if (normalized.includes("作詞")) {
      map.lyricist = index;
    }
    if (normalized.includes("作曲")) {
      map.composer = index;
    }
    if (normalized.includes("編曲")) {
      map.arranger = index;
    }
  });

  const hasCreditColumn = map.lyricist !== undefined || map.composer !== undefined || map.arranger !== undefined;
  if (!hasCreditColumn) {
    return null;
  }

  return map;
}

function getCell(cells: string[], idx?: number): string {
  if (idx === undefined) {
    return "";
  }
  return cells[idx] ?? "";
}

function parseTableCredits(cells: string[], map: ColumnIndexMap): ScrapedCredit[] {
  const credits: ScrapedCredit[] = [];

  const creditColumns: Array<{ role: CreditRole; idx?: number }> = [
    { role: "lyricist", idx: map.lyricist },
    { role: "composer", idx: map.composer },
    { role: "arranger", idx: map.arranger }
  ];

  for (const column of creditColumns) {
    const raw = normalizeSpace(getCell(cells, column.idx));
    if (!raw) {
      continue;
    }

    const names = splitNames(raw);
    if (names.length === 0) {
      continue;
    }

    credits.push({ role: column.role, names });
  }

  return credits;
}

function parseSongsFromCreditTables($: CheerioAPI): ScrapedSong[] {
  const songs: ScrapedSong[] = [];

  $("table.wikitable").each((_, table) => {
    const rows = $(table).find("tr").toArray();
    if (rows.length < 2) {
      return;
    }

    const headerRow = rows.find((row) => $(row).find("th").length > 0);
    if (!headerRow) {
      return;
    }

    const headers = $(headerRow)
      .find("th")
      .toArray()
      .map((th) => normalizeSpace($(th).text()));

    const map = headerToColumnMap(headers);
    if (!map) {
      return;
    }

    let fallbackTrack = 1;

    rows.forEach((row) => {
      const cells = $(row)
        .find("td")
        .toArray()
        .map((td) => normalizeSpace($(td).text()));

      if (cells.length < 2) {
        return;
      }

      const titleCandidate = sanitizeSongTitle(getCell(cells, map.title) || cells[1] || cells[0] || "");
      if (!titleCandidate) {
        return;
      }

      const credits = parseTableCredits(cells, map);
      const fallbackCredits = credits.length === 0 ? parseCreditsFromText(cells.join(" ")) : credits;
      if (fallbackCredits.length === 0) {
        return;
      }

      const trackNumber = parseTrackNumber(getCell(cells, map.trackNo), fallbackTrack);
      fallbackTrack += 1;

      songs.push({
        title: titleCandidate,
        trackNumber,
        credits: fallbackCredits
      });
    });
  });

  return songs;
}

function parseSongsFromList($: CheerioAPI): ScrapedSong[] {
  const songs: ScrapedSong[] = [];

  const listItems = $("ol > li, ul > li")
    .toArray()
    .map((li) => normalizeSpace($(li).text()))
    .filter((text) => text.length > 0);

  let trackIndex = 1;
  for (const line of listItems) {
    if (!/作詞|作曲|編曲/.test(line)) {
      continue;
    }

    const titleMatch = line.match(/^[\d\.\)\s]*([^\(（作詞]+)/);
    const title = sanitizeSongTitle(titleMatch?.[1] ?? line.slice(0, 30));
    if (!title) {
      continue;
    }

    const credits = parseCreditsFromText(line);
    if (credits.length === 0) {
      continue;
    }

    songs.push({
      title,
      trackNumber: trackIndex,
      credits
    });

    trackIndex += 1;
  }

  return songs;
}

function dedupeSongs(songs: ScrapedSong[]): ScrapedSong[] {
  const map = new Map<string, ScrapedSong>();

  songs.forEach((song) => {
    const key = `${song.trackNumber}:${song.title}`;
    if (!map.has(key)) {
      map.set(key, song);
      return;
    }

    const existing = map.get(key);
    if (existing && existing.credits.length < song.credits.length) {
      map.set(key, song);
    }
  });

  return [...map.values()].sort((a, b) => a.trackNumber - b.trackNumber);
}

export function extractReleaseUrlsFromDiscography(html: string): string[] {
  const $ = load(html);
  const urls = new Set<string>();

  $("table.wikitable a, ul li a, .mw-parser-output a")
    .toArray()
    .forEach((anchor) => {
      const href = $(anchor).attr("href");
      const text = normalizeSpace($(anchor).text());

      if (!href || !href.startsWith("/wiki/") || href.includes(":") || href.includes("#")) {
        return;
      }

      if (text.length < 2) {
        return;
      }

      const looksLikeRelease =
        /シングル|アルバム|坂|AKB|SKE|NMB|HKT|STU|乃木|櫻|日向|君|恋|制服|ぐるぐる|フォーチュン|黒髪|メロン|暗闇/.test(
          text
        );
      if (!looksLikeRelease) {
        return;
      }

      urls.add(toAbsoluteUrl(href));
    });

  return [...urls];
}

export function parseReleasePage(group: GroupSeed, url: string, html: string): ScrapedRelease {
  const $ = load(html);

  const heading = normalizeSpace($("#firstHeading").first().text()) || "Untitled";
  const releaseTitle = heading.replace(/\s*\([^)]*\)\s*$/, "").trim();

  const infoboxText = normalizeSpace($("table.infobox").text());
  const contextText = `${heading} ${infoboxText}`;

  const songsFromTables = parseSongsFromCreditTables($);
  const songsFromList = parseSongsFromList($);
  const songs = dedupeSongs([...songsFromTables, ...songsFromList]);

  return {
    groupName: group.name,
    groupRomaji: group.nameRomaji,
    groupCategory: group.category,
    title: releaseTitle,
    releaseType: detectReleaseType(contextText),
    releaseNumber: parseReleaseNumber(contextText),
    releaseDate: parseReleaseDate(contextText),
    wikipediaUrl: url,
    songs
  };
}
