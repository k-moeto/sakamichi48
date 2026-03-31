import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { asc, eq, sql } from "drizzle-orm";

import { connection, db } from "../db/client.js";
import { creators, groups, members, releases, songCredits, songFormations, songs } from "../db/schema.js";

type CreditRole = "lyricist" | "composer" | "arranger";

type SongCredit = {
  role: CreditRole;
  creatorId: number;
  creatorName: string;
  creatorRomaji: string | null;
};

type SongListWithCredits = {
  songId: number;
  songTitle: string;
  duration: string | null;
  trackNumber: number | null;
  editionType: string | null;
  songCategory: string;
  releaseId: number;
  releaseTitle: string;
  releaseType: string;
  releaseNumber: number | null;
  releaseDate: string | null;
  releaseYear: number | null;
  groupId: number;
  groupName: string;
  groupCategory: "sakamichi" | "48";
  credits: SongCredit[];
  formation: SongFormationEntry[];
};

type SongDetail = {
  songId: number;
  title: string;
  duration: string | null;
  trackNumber: number | null;
  editionType: string | null;
  songCategory: string;
  lyricsText: string | null;
  releaseTitle: string;
  groupName: string;
  releaseDate: string | null;
  credits: SongCredit[];
  releaseYear: number | null;
  formation: SongFormationEntry[];
};

type SongFormationEntry = {
  memberName: string;
  memberRomaji: string | null;
  positionType: "center" | "fukujin" | "senbatsu" | "under";
  rowNumber: number | null;
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultOutDir = path.resolve(__dirname, "../../../web/public/data");

function parseOutDir(): string {
  const arg = process.argv.slice(2).find((item) => item.startsWith("--out-dir="));
  return arg ? path.resolve(process.cwd(), arg.split("=")[1] ?? "") : defaultOutDir;
}

function toIsoDate(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return String(value);
}

function toReleaseYear(date: string | null): number | null {
  if (!date) {
    return null;
  }
  const year = Number(date.slice(0, 4));
  return Number.isNaN(year) ? null : year;
}

async function main(): Promise<void> {
  const outDir = parseOutDir();

  const groupRows = await db
    .select({
      id: groups.id,
      name: groups.name,
      nameRomaji: groups.nameRomaji,
      category: groups.category,
      formedDate: groups.formedDate
    })
    .from(groups)
    .orderBy(asc(groups.id));

  const creatorRows = await db
    .select({
      id: creators.id,
      name: creators.name,
      nameRomaji: creators.nameRomaji,
      songCount: sql<number>`count(${songCredits.id})::int`
    })
    .from(creators)
    .leftJoin(songCredits, eq(songCredits.creatorId, creators.id))
    .groupBy(creators.id)
    .orderBy(asc(creators.name));

  const songRows = await db
    .select({
      songId: songs.id,
      songTitle: songs.title,
      duration: songs.duration,
      trackNumber: songs.trackNumber,
      editionType: songs.editionType,
      songCategory: songs.songCategory,
      lyricsText: songs.lyricsText,
      releaseId: releases.id,
      releaseTitle: releases.title,
      releaseType: releases.releaseType,
      releaseNumber: releases.releaseNumber,
      releaseDate: releases.releaseDate,
      groupId: groups.id,
      groupName: groups.name,
      groupCategory: groups.category
    })
    .from(songs)
    .innerJoin(releases, eq(songs.releaseId, releases.id))
    .innerJoin(groups, eq(releases.groupId, groups.id))
    .orderBy(asc(groups.id), asc(releases.id), asc(songs.trackNumber), asc(songs.id));

  const creditRows = await db
    .select({
      songId: songCredits.songId,
      role: songCredits.role,
      creatorId: creators.id,
      creatorName: creators.name,
      creatorRomaji: creators.nameRomaji
    })
    .from(songCredits)
    .innerJoin(creators, eq(songCredits.creatorId, creators.id))
    .orderBy(asc(songCredits.songId), asc(creators.id));

  const creditsBySongId = new Map<number, SongCredit[]>();
  for (const row of creditRows) {
    const list = creditsBySongId.get(row.songId) ?? [];
    list.push({
      role: row.role as CreditRole,
      creatorId: row.creatorId,
      creatorName: row.creatorName,
      creatorRomaji: row.creatorRomaji
    });
    creditsBySongId.set(row.songId, list);
  }

  const formationRows = await db
    .select({
      songId: songFormations.songId,
      memberName: members.name,
      memberRomaji: members.nameRomaji,
      positionType: songFormations.positionType,
      rowNumber: songFormations.rowNumber
    })
    .from(songFormations)
    .innerJoin(members, eq(songFormations.memberId, members.id))
    .orderBy(asc(songFormations.songId), asc(songFormations.rowNumber), asc(members.id));

  const formationBySongId = new Map<number, SongFormationEntry[]>();
  for (const row of formationRows) {
    const list = formationBySongId.get(row.songId) ?? [];
    list.push({
      memberName: row.memberName,
      memberRomaji: row.memberRomaji,
      positionType: row.positionType,
      rowNumber: row.rowNumber
    });
    formationBySongId.set(row.songId, list);
  }

  const songsWithCredits: SongListWithCredits[] = songRows.map((row) => ({
    songId: row.songId,
    songTitle: row.songTitle,
    duration: row.duration,
    trackNumber: row.trackNumber,
    editionType: row.editionType,
    songCategory: row.songCategory,
    releaseId: row.releaseId,
    releaseTitle: row.releaseTitle,
    releaseType: row.releaseType,
    releaseNumber: row.releaseNumber,
    releaseDate: toIsoDate(row.releaseDate),
    releaseYear: toReleaseYear(toIsoDate(row.releaseDate)),
    groupId: row.groupId,
    groupName: row.groupName,
    groupCategory: row.groupCategory,
    credits: creditsBySongId.get(row.songId) ?? [],
    formation: formationBySongId.get(row.songId) ?? []
  }));

  const lyricsBySongId = new Map<number, string | null>();
  for (const row of songRows) {
    lyricsBySongId.set(row.songId, row.lyricsText ?? null);
  }

  const songDetails: Record<string, SongDetail> = {};
  for (const row of songsWithCredits) {
    songDetails[String(row.songId)] = {
      songId: row.songId,
      title: row.songTitle,
      duration: row.duration,
      trackNumber: row.trackNumber,
      editionType: row.editionType,
      songCategory: row.songCategory,
      lyricsText: lyricsBySongId.get(row.songId) ?? null,
      releaseTitle: row.releaseTitle,
      groupName: row.groupName,
      releaseDate: row.releaseDate,
      releaseYear: row.releaseYear,
      credits: row.credits,
      formation: row.formation
    };
  }

  const metadata = {
    generatedAt: new Date().toISOString(),
    source: "postgresql",
    counts: {
      groups: groupRows.length,
      creators: creatorRows.length,
      songs: songsWithCredits.length,
      songCredits: creditRows.length
    }
  };

  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, "groups.json"), JSON.stringify(groupRows), "utf8");
  await writeFile(path.join(outDir, "creators.json"), JSON.stringify(creatorRows), "utf8");
  await writeFile(path.join(outDir, "songs.json"), JSON.stringify(songsWithCredits), "utf8");
  await writeFile(path.join(outDir, "songs-detail.json"), JSON.stringify(songDetails), "utf8");
  await writeFile(path.join(outDir, "meta.json"), JSON.stringify(metadata, null, 2), "utf8");

  console.log(
    `[data:snapshot] wrote ${outDir} groups=${groupRows.length} creators=${creatorRows.length} songs=${songsWithCredits.length} credits=${creditRows.length}`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await connection.end({ timeout: 5 });
  });
