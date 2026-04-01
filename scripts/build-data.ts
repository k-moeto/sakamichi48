/**
 * CSV → JSON data builder
 * Reads all group CSVs from data/ and outputs structured JSON files
 * for the static web frontend into packages/web/public/data/
 */
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "..", "data");
const OUT_DIR = path.resolve(__dirname, "..", "packages", "web", "public", "data");
const SONG_CACHE_DIR = path.resolve(__dirname, "..", "scraper", "cache");

interface CsvSong {
  songId: string;
  title: string;
  lyricist: string;
  composer: string;
  arranger: string;
  releaseDate: string;
  releaseYear: string;
  releaseTitle: string;
  releaseType: string;
  fullLyrics: string;
  songUrl: string;
}

const COLUMN_ALIASES: Record<string, keyof CsvSong> = {
  song_id: "songId",
  曲ID: "songId",
  title: "title",
  曲名: "title",
  lyricist: "lyricist",
  作詞: "lyricist",
  composer: "composer",
  作曲: "composer",
  arranger: "arranger",
  編曲: "arranger",
  release_date: "releaseDate",
  発売日: "releaseDate",
  release_year: "releaseYear",
  発売年: "releaseYear",
  release_title: "releaseTitle",
  リリース名: "releaseTitle",
  release_type: "releaseType",
  リリース種別: "releaseType",
  full_lyrics: "fullLyrics",
  歌詞: "fullLyrics",
  song_url: "songUrl",
  楽曲URL: "songUrl",
};

interface GroupDef {
  csvFile: string;
  name: string;
  nameRomaji: string;
  category: "sakamichi" | "48";
}

const GROUP_DEFS: GroupDef[] = [
  { csvFile: "nogizaka46", name: "乃木坂46", nameRomaji: "Nogizaka46", category: "sakamichi" },
  { csvFile: "keyakizaka46", name: "欅坂46", nameRomaji: "Keyakizaka46", category: "sakamichi" },
  { csvFile: "sakurazaka46", name: "櫻坂46", nameRomaji: "Sakurazaka46", category: "sakamichi" },
  { csvFile: "hinatazaka46", name: "日向坂46", nameRomaji: "Hinatazaka46", category: "sakamichi" },
  { csvFile: "akb48", name: "AKB48", nameRomaji: "AKB48", category: "48" },
  { csvFile: "ske48", name: "SKE48", nameRomaji: "SKE48", category: "48" },
  { csvFile: "nmb48", name: "NMB48", nameRomaji: "NMB48", category: "48" },
  { csvFile: "hkt48", name: "HKT48", nameRomaji: "HKT48", category: "48" },
  { csvFile: "stu48", name: "STU48", nameRomaji: "STU48", category: "48" },
  { csvFile: "ngt48", name: "NGT48", nameRomaji: "NGT48", category: "48" },
];

// --- CSV Parser (handles quoted fields with commas and newlines) ---

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuote = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (inQuote) {
      if (ch === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuote = false;
          i++;
        }
      } else {
        field += ch;
        i++;
      }
    } else {
      if (ch === '"') {
        inQuote = true;
        i++;
      } else if (ch === ",") {
        row.push(field);
        field = "";
        i++;
      } else if (ch === "\n" || (ch === "\r" && i + 1 < text.length && text[i + 1] === "\n")) {
        row.push(field);
        field = "";
        if (row.length > 1) {
          rows.push(row);
        }
        row = [];
        i += ch === "\r" ? 2 : 1;
      } else {
        field += ch;
        i++;
      }
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.length > 1) {
      rows.push(row);
    }
  }

  return rows;
}

function readCsvFile(filename: string): CsvSong[] {
  const filepath = path.join(DATA_DIR, `${filename}.csv`);
  if (!fs.existsSync(filepath)) {
    console.warn(`  Warning: ${filepath} not found, skipping`);
    return [];
  }

  const text = fs.readFileSync(filepath, "utf-8");
  const rows = parseCsv(text);
  const [header, ...dataRows] = rows;
  if (!header) return [];

  const indexByKey = new Map<keyof CsvSong, number>();
  header.forEach((name, index) => {
    const normalized = name.normalize("NFKC").trim();
    const key = COLUMN_ALIASES[normalized];
    if (key) {
      indexByKey.set(key, index);
    }
  });

  function get(row: string[], key: keyof CsvSong): string {
    const idx = indexByKey.get(key);
    return idx === undefined ? "" : row[idx] ?? "";
  }

  return dataRows.map((cols) => ({
    songId: get(cols, "songId"),
    title: get(cols, "title"),
    lyricist: get(cols, "lyricist"),
    composer: get(cols, "composer"),
    arranger: get(cols, "arranger"),
    releaseDate: get(cols, "releaseDate"),
    releaseYear: get(cols, "releaseYear"),
    releaseTitle: get(cols, "releaseTitle"),
    releaseType: get(cols, "releaseType"),
    fullLyrics: get(cols, "fullLyrics"),
    songUrl: get(cols, "songUrl"),
  }));
}

// --- Split multi-name credit fields ---

function splitCreators(field: string): string[] {
  if (!field.trim()) return [];
  // Split on ・, ／, /, ・ but NOT on names within parentheses
  return field
    .split(/[・／\/]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function toIsoDate(value: string): string | null {
  const normalized = value.trim();
  if (!normalized) return null;

  const ymd = normalized.match(/(\d{4})[\/\-年.](\d{1,2})[\/\-月.](\d{1,2})/);
  if (ymd) {
    const y = ymd[1];
    const m = String(Number.parseInt(ymd[2] ?? "0", 10)).padStart(2, "0");
    const d = String(Number.parseInt(ymd[3] ?? "0", 10)).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  const yearOnly = normalized.match(/(\d{4})/);
  if (yearOnly) {
    return `${yearOnly[1]}-01-01`;
  }
  return null;
}

function toYear(value: string | null): number | null {
  if (!value) return null;
  const year = Number.parseInt(value.slice(0, 4), 10);
  return Number.isFinite(year) ? year : null;
}

function releaseDateFromSongCache(songId: number): string | null {
  const cachePath = path.join(SONG_CACHE_DIR, `https___www_uta_net_com_song_${songId}_.html`);
  if (!fs.existsSync(cachePath)) {
    return null;
  }

  const html = fs.readFileSync(cachePath, "utf-8");
  const match = html.match(/発売日[:：]\s*(\d{4})[\/\-年.](\d{1,2})[\/\-月.](\d{1,2})/);
  if (!match) {
    return null;
  }

  const y = match[1];
  const m = String(Number.parseInt(match[2] ?? "0", 10)).padStart(2, "0");
  const d = String(Number.parseInt(match[3] ?? "0", 10)).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

type ScraperRelease = {
  groupName: string;
  title: string;
  releaseType: string;
  releaseDate?: string;
  songs: Array<{ title: string }>;
};

function normalizeSongTitle(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}

function sanitizeReleaseTitle(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.includes("Uta-Net Other Songs") ? "" : trimmed;
}

function loadReleaseMetaMap(): Map<string, { releaseTitle: string; releaseType: string; releaseDate: string | null }> {
  const releaseMap = new Map<string, { releaseTitle: string; releaseType: string; releaseDate: string | null }>();
  const enrichedPath = path.resolve(__dirname, "..", "packages", "scraper", "tmp", "utanet-enriched.json");
  if (!fs.existsSync(enrichedPath)) {
    return releaseMap;
  }

  const releases = JSON.parse(fs.readFileSync(enrichedPath, "utf-8")) as ScraperRelease[];
  for (const release of releases) {
    for (const song of release.songs) {
      const key = `${release.groupName}::${normalizeSongTitle(song.title)}`;
      if (releaseMap.has(key)) {
        continue;
      }
      releaseMap.set(key, {
        releaseTitle: sanitizeReleaseTitle(release.title),
        releaseType: release.releaseType,
        releaseDate: toIsoDate(release.releaseDate ?? "") ?? null
      });
    }
  }

  return releaseMap;
}

// --- Main build ---

interface OutputGroup {
  id: number;
  name: string;
  nameRomaji: string;
  category: "sakamichi" | "48";
}

interface OutputSong {
  songId: number;
  songTitle: string;
  duration: string | null;
  trackNumber: number | null;
  editionType: string | null;
  groupId: number;
  groupName: string;
  groupCategory: string;
  songCategory: string;
  releaseId: number | null;
  releaseTitle: string;
  releaseType: string;
  releaseNumber: number | null;
  releaseDate: string | null;
  releaseYear: number | null;
  credits: Array<{
    role: "lyricist" | "composer" | "arranger";
    creatorId: number;
    creatorName: string;
  }>;
}

interface OutputSongDetail {
  songId: number;
  title: string;
  groupName: string;
  groupId: number;
  songCategory: string;
  lyricsText: string | null;
  duration: string | null;
  trackNumber: number | null;
  editionType: string | null;
  releaseTitle: string;
  releaseType: string;
  releaseDate: string | null;
  releaseYear: number | null;
  credits: Array<{
    role: "lyricist" | "composer" | "arranger";
    creatorId: number;
    creatorName: string;
    creatorRomaji: string | null;
  }>;
  formation: Array<{
    memberName: string;
    memberRomaji: string | null;
    positionType: "center" | "fukujin" | "senbatsu" | "under";
    rowNumber: number | null;
  }>;
}

interface OutputCreator {
  id: number;
  name: string;
  nameRomaji: string | null;
  songCount: number;
}

function build(): void {
  console.log("Building static data from CSVs...\n");
  const releaseMetaMap = loadReleaseMetaMap();

  const creatorMap = new Map<string, number>(); // name -> id
  let nextCreatorId = 1;

  function getOrCreateCreator(name: string): number {
    const normalized = name.normalize("NFKC").trim();
    if (creatorMap.has(normalized)) {
      return creatorMap.get(normalized)!;
    }
    const id = nextCreatorId++;
    creatorMap.set(normalized, id);
    return id;
  }

  const allSongs: OutputSong[] = [];
  const songDetails: Record<number, OutputSongDetail> = {};
  const creatorSongCount = new Map<number, number>();
  const groups: OutputGroup[] = [];

  for (let gi = 0; gi < GROUP_DEFS.length; gi++) {
    const def = GROUP_DEFS[gi];
    const groupId = gi + 1;
    groups.push({
      id: groupId,
      name: def.name,
      nameRomaji: def.nameRomaji,
      category: def.category,
    });

    const csvSongs = readCsvFile(def.csvFile);
    console.log(`  ${def.name}: ${csvSongs.length} songs`);

    for (const csv of csvSongs) {
      const songId = parseInt(csv.songId, 10);
      if (isNaN(songId)) continue;

      const csvReleaseDate = toIsoDate(csv.releaseDate);
      const csvReleaseYear = Number.parseInt(csv.releaseYear, 10);
      const releaseMeta = releaseMetaMap.get(`${def.name}::${normalizeSongTitle(csv.title)}`);
      const cacheReleaseDate = releaseDateFromSongCache(songId);
      const releaseDate = csvReleaseDate ?? releaseMeta?.releaseDate ?? cacheReleaseDate ?? null;
      const releaseYear = Number.isFinite(csvReleaseYear) ? csvReleaseYear : toYear(releaseDate);
      const releaseTitle = csv.releaseTitle.trim() || releaseMeta?.releaseTitle || "";
      const releaseType = csv.releaseType.trim() || releaseMeta?.releaseType || "other";

      const credits: OutputSong["credits"] = [];

      // Process each credit role
      for (const [role, field] of [
        ["lyricist", csv.lyricist],
        ["composer", csv.composer],
        ["arranger", csv.arranger],
      ] as const) {
        const names = splitCreators(field);
        for (const name of names) {
          const creatorId = getOrCreateCreator(name);
          credits.push({ role, creatorId, creatorName: name.normalize("NFKC").trim() });

          // Count songs per creator (count each song once per creator)
          const key = creatorId;
          creatorSongCount.set(key, (creatorSongCount.get(key) ?? 0) + 1);
        }
      }

      const song: OutputSong = {
        songId,
        songTitle: csv.title,
        duration: null,
        trackNumber: null,
        editionType: null,
        groupId,
        groupName: def.name,
        groupCategory: def.category,
        songCategory: "other",
        releaseId: null,
        releaseTitle,
        releaseType,
        releaseNumber: null,
        releaseDate,
        releaseYear,
        credits,
      };
      allSongs.push(song);

      songDetails[songId] = {
        songId,
        title: csv.title,
        groupName: def.name,
        groupId,
        songCategory: "other",
        lyricsText: csv.fullLyrics || null,
        duration: null,
        trackNumber: null,
        editionType: null,
        releaseTitle,
        releaseType,
        releaseDate,
        releaseYear,
        credits: credits.map((c) => ({ ...c, creatorRomaji: null })),
        formation: [],
      };
    }
  }

  // Build creators list
  const creatorsArr: OutputCreator[] = [];
  for (const [name, id] of creatorMap) {
    creatorsArr.push({
      id,
      name,
      nameRomaji: null,
      songCount: creatorSongCount.get(id) ?? 0,
    });
  }
  creatorsArr.sort((a, b) => b.songCount - a.songCount);

  // Write output
  fs.mkdirSync(OUT_DIR, { recursive: true });

  fs.writeFileSync(path.join(OUT_DIR, "groups.json"), JSON.stringify(groups));
  console.log(`\n  groups.json: ${groups.length} groups`);

  // Songs list (without lyrics for lighter initial load)
  const songsList = allSongs.map((s) => ({
    songId: s.songId,
    songTitle: s.songTitle,
    duration: s.duration,
    trackNumber: s.trackNumber,
    editionType: s.editionType,
    releaseId: s.releaseId,
    releaseTitle: s.releaseTitle,
    releaseType: s.releaseType,
    releaseNumber: s.releaseNumber,
    releaseDate: s.releaseDate,
    releaseYear: s.releaseYear,
    groupId: s.groupId,
    groupName: s.groupName,
    groupCategory: s.groupCategory,
    songCategory: s.songCategory,
    credits: s.credits,
  }));
  fs.writeFileSync(path.join(OUT_DIR, "songs.json"), JSON.stringify(songsList));
  console.log(`  songs.json: ${songsList.length} songs`);

  fs.writeFileSync(path.join(OUT_DIR, "creators.json"), JSON.stringify(creatorsArr));
  console.log(`  creators.json: ${creatorsArr.length} creators`);

  // Song details (with lyrics) - as a single file keyed by songId
  fs.writeFileSync(path.join(OUT_DIR, "songs-detail.json"), JSON.stringify(songDetails));
  const detailSize = (Buffer.byteLength(JSON.stringify(songDetails)) / 1024).toFixed(0);
  console.log(`  songs-detail.json: ${Object.keys(songDetails).length} songs (${detailSize}KB)`);

  console.log("\nDone!");
}

build();
