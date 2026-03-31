import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

type CreditRole = "lyricist" | "composer" | "arranger";

type SongCredit = {
  role: CreditRole;
  creatorId: number;
  creatorName: string;
  creatorRomaji?: string | null;
};

type Song = {
  songId: number;
  songTitle: string;
  groupId: number;
  groupName: string;
  releaseTitle?: string;
  credits: SongCredit[];
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultOutDir = path.resolve(__dirname, "../../../web/public/data");

const MIN_GROUPS = Number(process.env.MIN_GROUPS ?? 8);
const MIN_CREATORS = Number(process.env.MIN_CREATORS ?? 300);
const MIN_SONGS = Number(process.env.MIN_SONGS ?? 1000);
const MIN_COMPOSER_COVERAGE = Number(process.env.MIN_COMPOSER_COVERAGE ?? 0.95);

const REQUIRED_GROUPS = ["乃木坂46", "櫻坂46", "日向坂46", "AKB48", "SKE48", "NMB48", "HKT48", "STU48"];

function parseOutDir(): string {
  const arg = process.argv.slice(2).find((item) => item.startsWith("--out-dir="));
  return arg ? path.resolve(process.cwd(), arg.split("=")[1] ?? "") : defaultOutDir;
}

async function readJson<T>(filePath: string): Promise<T> {
  const text = await readFile(filePath, "utf8");
  return JSON.parse(text) as T;
}

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(`[data:check] ${message}`);
  }
}

async function main(): Promise<void> {
  const outDir = parseOutDir();

  const groups = await readJson<Array<{ id: number; name: string }>>(path.join(outDir, "groups.json"));
  const creators = await readJson<Array<{ id: number; name: string }>>(path.join(outDir, "creators.json"));
  const songs = await readJson<Song[]>(path.join(outDir, "songs.json"));
  const songDetails = await readJson<Record<string, { songId: number }>>(path.join(outDir, "songs-detail.json"));

  assert(groups.length >= MIN_GROUPS, `groups is too small: ${groups.length}`);
  assert(creators.length >= MIN_CREATORS, `creators is too small: ${creators.length}`);
  assert(songs.length >= MIN_SONGS, `songs is too small: ${songs.length}`);

  const groupSet = new Set(groups.map((group) => group.name));
  const missingGroups = REQUIRED_GROUPS.filter((name) => !groupSet.has(name));
  assert(missingGroups.length === 0, `required groups missing: ${missingGroups.join(", ")}`);

  const songIds = new Set<number>();
  for (const song of songs) {
    assert(song.songId > 0, `invalid songId: ${song.songId}`);
    assert(song.songTitle.trim().length > 0, `song title is empty: ${song.songId}`);
    assert(song.groupName.trim().length > 0, `group name is empty: ${song.songId}`);
    assert(!songIds.has(song.songId), `duplicate songId found: ${song.songId}`);
    songIds.add(song.songId);
  }

  const detailKeys = Object.keys(songDetails);
  assert(detailKeys.length === songs.length, `songs-detail size mismatch: details=${detailKeys.length}, songs=${songs.length}`);

  const validRoles = new Set<CreditRole>(["lyricist", "composer", "arranger"]);
  let totalCredits = 0;
  let songsWithComposer = 0;
  for (const song of songs) {
    const credits = song.credits ?? [];
    totalCredits += credits.length;

    if (credits.some((credit) => credit.role === "composer")) {
      songsWithComposer += 1;
    }

    for (const credit of credits) {
      assert(validRoles.has(credit.role), `invalid credit role: ${credit.role}`);
      assert(credit.creatorId > 0, `invalid creatorId: ${credit.creatorId} (song=${song.songId})`);
      assert(credit.creatorName.trim().length > 0, `empty creatorName (song=${song.songId})`);
    }
  }

  const composerCoverage = songs.length === 0 ? 0 : songsWithComposer / songs.length;
  assert(
    composerCoverage >= MIN_COMPOSER_COVERAGE,
    `composer coverage too low: ${composerCoverage.toFixed(4)} (min=${MIN_COMPOSER_COVERAGE})`
  );

  console.log(
    `[data:check] ok groups=${groups.length} creators=${creators.length} songs=${songs.length} credits=${totalCredits} composerCoverage=${composerCoverage.toFixed(
      4
    )}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
