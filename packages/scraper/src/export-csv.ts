import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { GROUPS } from "./config/groups.js";
import type { CreditRole, ScrapedRelease } from "./types/models.js";

type ParsedArgs = {
  input: string;
  outDir: string;
  groupCsvDir: string;
};

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  const inputArg = args.find((arg) => arg.startsWith("--input="));
  const outDirArg = args.find((arg) => arg.startsWith("--out-dir="));
  const groupCsvDirArg = args.find((arg) => arg.startsWith("--group-csv-dir="));

  return {
    input: inputArg?.split("=")[1] ?? "tmp/utanet-enriched.json",
    outDir: outDirArg?.split("=")[1] ?? "tmp/csv",
    groupCsvDir: groupCsvDirArg?.split("=")[1] ?? ""
  };
}

function csvEscape(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? "" : String(value);
  if (text.includes('"') || text.includes(",") || text.includes("\n") || text.includes("\r")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function toCsv(rows: Array<Record<string, string | number | null | undefined>>, columns: string[]): string {
  const header = columns.map(csvEscape).join(",");
  const body = rows.map((row) => columns.map((column) => csvEscape(row[column])).join(",")).join("\n");
  return `${header}\n${body}\n`;
}

function extractYear(dateStr?: string | null): string {
  if (!dateStr) return "";
  const m = dateStr.match(/^(\d{4})/);
  return m ? (m[1] ?? "") : "";
}

function creditNames(credits: Array<{ role: CreditRole; names: string[] }>, role: CreditRole): string {
  return credits
    .filter((c) => c.role === role)
    .flatMap((c) => c.names)
    .join(";");
}

async function main(): Promise<void> {
  const { input, outDir, groupCsvDir } = parseArgs();
  const inputPath = path.resolve(process.cwd(), input);
  const outDirPath = path.resolve(process.cwd(), outDir);
  const raw = await readFile(inputPath, "utf8");
  const releases = JSON.parse(raw) as ScrapedRelease[];

  let releaseId = 1;
  let songId = 1;

  const releaseRows: Array<Record<string, string | number | null>> = [];
  const songRows: Array<Record<string, string | number | null>> = [];
  const creditRows: Array<Record<string, string | number | null>> = [];
  const flatRows: Array<Record<string, string | number | null>> = [];

  // Group-keyed data for per-group flat CSVs
  const groupFlatRows = new Map<string, Array<Record<string, string | number | null>>>();

  for (const release of releases) {
    const currentReleaseId = releaseId++;
    releaseRows.push({
      release_id: currentReleaseId,
      group_name: release.groupName,
      group_romaji: release.groupRomaji,
      group_category: release.groupCategory,
      release_title: release.title,
      release_type: release.releaseType,
      release_date: release.releaseDate ?? null,
      source_url: release.wikipediaUrl
    });

    // Find group key from name
    const groupSeed = GROUPS.find((g) => g.name === release.groupName);
    const groupKey = groupSeed?.key ?? release.groupRomaji.toLowerCase().replace(/\s+/g, "");

    for (const song of release.songs) {
      const currentSongId = songId++;
      songRows.push({
        song_id: currentSongId,
        release_id: currentReleaseId,
        track_number: song.trackNumber,
        song_title: song.title
      });

      const formation = song.formation;
      const membersStr = formation ? formation.members.map((m) => m.name).join(";") : "";
      const centerStr = formation ? formation.centerNames.join(";") : "";
      const formationRowsStr = formation
        ? buildFormationRowsString(formation.members)
        : "";

      // Per-group flat row (one row per song, all credits merged)
      const groupRow: Record<string, string | number | null> = {
        song_id: song.trackNumber,
        title: song.title,
        lyricist: creditNames(song.credits, "lyricist"),
        composer: creditNames(song.credits, "composer"),
        arranger: creditNames(song.credits, "arranger"),
        release_year: extractYear(release.releaseDate),
        release_title: release.title,
        release_type: release.releaseType,
        members: membersStr,
        center: centerStr,
        formation_rows: formationRowsStr,
        opening_lyrics: "",
        full_lyrics: "",
        song_url: ""
      };

      if (!groupFlatRows.has(groupKey)) {
        groupFlatRows.set(groupKey, []);
      }
      groupFlatRows.get(groupKey)!.push(groupRow);

      for (const credit of song.credits) {
        for (const creatorName of credit.names) {
          creditRows.push({
            song_id: currentSongId,
            credit_role: credit.role,
            creator_name: creatorName
          });

          flatRows.push({
            group_name: release.groupName,
            release_title: release.title,
            release_date: release.releaseDate ?? null,
            release_type: release.releaseType,
            song_title: song.title,
            track_number: song.trackNumber,
            credit_role: credit.role,
            creator_name: creatorName,
            members: membersStr,
            center: centerStr,
            formation_rows: formationRowsStr
          });
        }
      }
    }
  }

  await mkdir(outDirPath, { recursive: true });

  await writeFile(
    path.join(outDirPath, "releases.csv"),
    toCsv(releaseRows, [
      "release_id",
      "group_name",
      "group_romaji",
      "group_category",
      "release_title",
      "release_type",
      "release_date",
      "source_url"
    ]),
    "utf8"
  );

  await writeFile(
    path.join(outDirPath, "songs.csv"),
    toCsv(songRows, ["song_id", "release_id", "track_number", "song_title"]),
    "utf8"
  );

  await writeFile(
    path.join(outDirPath, "song_credits.csv"),
    toCsv(creditRows, ["song_id", "credit_role", "creator_name"]),
    "utf8"
  );

  await writeFile(
    path.join(outDirPath, "songs_flat.csv"),
    toCsv(flatRows, [
      "group_name",
      "release_title",
      "release_date",
      "release_type",
      "song_title",
      "track_number",
      "credit_role",
      "creator_name",
      "members",
      "center",
      "formation_rows"
    ]),
    "utf8"
  );

  // Write per-group flat CSVs
  const groupCsvColumns = [
    "song_id",
    "title",
    "lyricist",
    "composer",
    "arranger",
    "release_year",
    "release_title",
    "release_type",
    "members",
    "center",
    "formation_rows",
    "opening_lyrics",
    "full_lyrics",
    "song_url"
  ];

  const targetDir = groupCsvDir ? path.resolve(process.cwd(), groupCsvDir) : outDirPath;
  if (groupCsvDir) {
    await mkdir(targetDir, { recursive: true });
  }

  for (const [groupKey, rows] of groupFlatRows) {
    const filename = `${groupKey}.csv`;
    await writeFile(path.join(targetDir, filename), toCsv(rows, groupCsvColumns), "utf8");
    console.log(`[export-csv] wrote ${filename} songs=${rows.length}`);
  }

  console.log(
    `[export-csv] wrote ${outDirPath} releases=${releaseRows.length} songs=${songRows.length} credits=${creditRows.length} flat=${flatRows.length}`
  );
}

function buildFormationRowsString(members: Array<{ name: string; row?: number }>): string {
  const byRow = new Map<number, string[]>();
  const noRow: string[] = [];

  for (const m of members) {
    if (m.row !== undefined) {
      if (!byRow.has(m.row)) byRow.set(m.row, []);
      byRow.get(m.row)!.push(m.name);
    } else {
      noRow.push(m.name);
    }
  }

  if (byRow.size === 0) return noRow.join(",");

  const rows = [...byRow.entries()].sort(([a], [b]) => a - b);
  const parts = rows.map(([, names]) => names.join(","));
  if (noRow.length > 0) parts.push(noRow.join(","));
  return parts.join("|");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
