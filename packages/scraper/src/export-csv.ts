import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ScrapedRelease } from "./types/models.js";

type ParsedArgs = {
  input: string;
  outDir: string;
};

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  const inputArg = args.find((arg) => arg.startsWith("--input="));
  const outDirArg = args.find((arg) => arg.startsWith("--out-dir="));

  return {
    input: inputArg?.split("=")[1] ?? "tmp/utanet-enriched.json",
    outDir: outDirArg?.split("=")[1] ?? "tmp/csv"
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

async function main(): Promise<void> {
  const { input, outDir } = parseArgs();
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

    for (const song of release.songs) {
      const currentSongId = songId++;
      songRows.push({
        song_id: currentSongId,
        release_id: currentReleaseId,
        track_number: song.trackNumber,
        song_title: song.title
      });

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
            song_title: song.title,
            track_number: song.trackNumber,
            credit_role: credit.role,
            creator_name: creatorName
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
      "song_title",
      "track_number",
      "credit_role",
      "creator_name"
    ]),
    "utf8"
  );

  console.log(
    `[export-csv] wrote ${outDirPath} releases=${releaseRows.length} songs=${songRows.length} credits=${creditRows.length} flat=${flatRows.length}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
