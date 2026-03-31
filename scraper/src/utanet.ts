import { chromium, type Browser, type Page } from "playwright";
import * as cheerio from "cheerio";
import * as fs from "fs";
import * as path from "path";
import type { GroupConfig, SongDetail } from "./types.js";

const BASE_URL = "https://www.uta-net.com";
const DELAY_MS = 2000;
const CACHE_DIR = path.resolve("cache");

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureCacheDir(): void {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function getCachePath(url: string): string {
  const key = url.replace(/[^a-zA-Z0-9]/g, "_");
  return path.join(CACHE_DIR, `${key}.html`);
}

async function fetchPage(page: Page, url: string): Promise<string> {
  const cachePath = getCachePath(url);
  if (fs.existsSync(cachePath)) {
    console.log(`  [cache] ${url}`);
    return fs.readFileSync(cachePath, "utf-8");
  }

  console.log(`  [fetch] ${url}`);
  await page.goto(url, { waitUntil: "domcontentloaded" });
  const html = await page.content();

  ensureCacheDir();
  fs.writeFileSync(cachePath, html, "utf-8");

  await sleep(DELAY_MS);
  return html;
}

function parseArtistPage(html: string): SongDetail[] {
  const $ = cheerio.load(html);
  const songs: SongDetail[] = [];

  $("table tbody tr, table tr").each((_i, row) => {
    const cells = $(row).find("td");
    if (cells.length < 6) return;

    const titleLink = $(cells[0]).find("a");
    const href = titleLink.attr("href") || "";
    const songIdMatch = href.match(/\/song\/(\d+)\//);
    if (!songIdMatch) return;

    const songId = songIdMatch[1];
    // Title is inside <span class="songlist-title">, not the full <a> text
    const titleSpan = titleLink.find(".songlist-title");
    const title = titleSpan.length > 0 ? titleSpan.text().trim() : titleLink.first().contents().first().text().trim();
    const lyricist = $(cells[2]).text().trim();
    const composer = $(cells[3]).text().trim();
    const arranger = $(cells[4]).text().trim();
    const openingLyrics = $(cells[5]).text().trim();

    songs.push({
      songId,
      title,
      lyricist,
      composer,
      arranger,
      openingLyrics,
      fullLyrics: "",
      songUrl: `${BASE_URL}/song/${songId}/`,
    });
  });

  return songs;
}

function getTotalPages(html: string): number {
  const $ = cheerio.load(html);
  // Look for pagination: "全Xページ中" or page links
  const paginationText = $("body").text();
  const match = paginationText.match(/全(\d+)ページ中/);
  if (match) return parseInt(match[1], 10);

  // Fallback: count pagination links
  const pageLinks = $('a[href*="/artist/"]').filter((_i, el) => {
    const href = $(el).attr("href") || "";
    return /\/artist\/\d+\/\d+\//.test(href);
  });

  let maxPage = 1;
  pageLinks.each((_i, el) => {
    const href = $(el).attr("href") || "";
    const m = href.match(/\/artist\/\d+\/(\d+)\//);
    if (m) {
      const p = parseInt(m[1], 10);
      if (p > maxPage) maxPage = p;
    }
  });

  return maxPage;
}

async function fetchSongLyrics(
  page: Page,
  songUrl: string
): Promise<string> {
  const html = await fetchPage(page, songUrl);
  const $ = cheerio.load(html);

  // Lyrics are in #kashi_area
  const lyricsEl = $("#kashi_area");
  if (lyricsEl.length === 0) return "";

  // Get text with line breaks preserved
  // Replace <br> with newlines
  lyricsEl.find("br").replaceWith("\n");
  return lyricsEl.text().trim();
}

export async function scrapeGroup(
  group: GroupConfig,
  options: { skipLyrics?: boolean } = {}
): Promise<SongDetail[]> {
  console.log(`\n=== Scraping ${group.nameJa} (${group.name}) ===`);

  const browser: Browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();

  try {
    // Step 1: Fetch first page to determine total pages
    const firstUrl = `${BASE_URL}/artist/${group.utanetArtistId}/`;
    const firstHtml = await fetchPage(page, firstUrl);
    const totalPages = getTotalPages(firstHtml);
    console.log(`  Total pages: ${totalPages}`);

    // Step 2: Parse all pages
    let allSongs: SongDetail[] = parseArtistPage(firstHtml);
    console.log(`  Page 1: ${allSongs.length} songs`);

    for (let p = 2; p <= totalPages; p++) {
      const pageUrl = `${BASE_URL}/artist/${group.utanetArtistId}/${p}/`;
      const html = await fetchPage(page, pageUrl);
      const pageSongs = parseArtistPage(html);
      console.log(`  Page ${p}: ${pageSongs.length} songs`);
      allSongs = allSongs.concat(pageSongs);
    }

    // Deduplicate by songId
    const seen = new Set<string>();
    allSongs = allSongs.filter((song) => {
      if (seen.has(song.songId)) return false;
      seen.add(song.songId);
      return true;
    });

    console.log(`  Total songs (deduplicated): ${allSongs.length}`);

    // Step 3: Fetch lyrics for each song
    if (!options.skipLyrics) {
      console.log(`  Fetching lyrics for ${allSongs.length} songs...`);
      for (let i = 0; i < allSongs.length; i++) {
        const song = allSongs[i];
        console.log(
          `  [${i + 1}/${allSongs.length}] ${song.title}`
        );
        song.fullLyrics = await fetchSongLyrics(page, song.songUrl);
      }
    }

    return allSongs;
  } finally {
    await browser.close();
  }
}

export function writeCsv(songs: SongDetail[], outputPath: string): void {
  const header = [
    "song_id",
    "title",
    "lyricist",
    "composer",
    "arranger",
    "opening_lyrics",
    "full_lyrics",
    "song_url",
  ];

  const escapeCsvField = (field: string): string => {
    if (
      field.includes(",") ||
      field.includes('"') ||
      field.includes("\n") ||
      field.includes("\r")
    ) {
      return `"${field.replace(/"/g, '""')}"`;
    }
    return field;
  };

  const lines = [header.join(",")];
  for (const song of songs) {
    const row = [
      song.songId,
      escapeCsvField(song.title),
      escapeCsvField(song.lyricist),
      escapeCsvField(song.composer),
      escapeCsvField(song.arranger),
      escapeCsvField(song.openingLyrics),
      escapeCsvField(song.fullLyrics),
      song.songUrl,
    ];
    lines.push(row.join(","));
  }

  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(outputPath, lines.join("\n"), "utf-8");
  console.log(`  CSV written: ${outputPath} (${songs.length} songs)`);
}
