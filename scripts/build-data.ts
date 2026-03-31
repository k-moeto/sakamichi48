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

interface CsvSong {
  songId: string;
  title: string;
  lyricist: string;
  composer: string;
  arranger: string;
  openingLyrics: string;
  fullLyrics: string;
  songUrl: string;
}

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

  // Skip header row
  return rows.slice(1).map((cols) => ({
    songId: cols[0] ?? "",
    title: cols[1] ?? "",
    lyricist: cols[2] ?? "",
    composer: cols[3] ?? "",
    arranger: cols[4] ?? "",
    openingLyrics: cols[5] ?? "",
    fullLyrics: cols[6] ?? "",
    songUrl: cols[7] ?? "",
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
  groupId: number;
  groupName: string;
  groupCategory: string;
  songCategory: string;
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
  credits: Array<{
    role: "lyricist" | "composer" | "arranger";
    creatorId: number;
    creatorName: string;
    creatorRomaji: string | null;
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
        groupId,
        groupName: def.name,
        groupCategory: def.category,
        songCategory: "other",
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
        credits: credits.map((c) => ({ ...c, creatorRomaji: null })),
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
