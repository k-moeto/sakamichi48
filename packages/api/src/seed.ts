import { and, eq } from "drizzle-orm";

import { db } from "./db/client.js";
import { creators, groups, releases, songCredits, songs } from "./db/schema.js";

async function seed(): Promise<void> {
  const [nogizaka] = await db
    .insert(groups)
    .values({
      name: "乃木坂46",
      nameRomaji: "Nogizaka46",
      category: "sakamichi",
      formedDate: "2011-08-21"
    })
    .onConflictDoNothing()
    .returning();

  const [akb] = await db
    .insert(groups)
    .values({
      name: "AKB48",
      nameRomaji: "AKB48",
      category: "48",
      formedDate: "2005-12-08"
    })
    .onConflictDoNothing()
    .returning();

  const allGroups = await db.select().from(groups);
  const nogizakaId = nogizaka?.id ?? allGroups.find((g) => g.name === "乃木坂46")?.id;
  const akbId = akb?.id ?? allGroups.find((g) => g.name === "AKB48")?.id;

  if (!nogizakaId || !akbId) {
    throw new Error("failed to resolve group ids");
  }

  const [releaseA] = await db
    .insert(releases)
    .values({
      groupId: nogizakaId,
      title: "ぐるぐるカーテン",
      releaseType: "single",
      releaseNumber: 1,
      releaseDate: "2012-02-22"
    })
    .onConflictDoNothing()
    .returning();

  const [releaseB] = await db
    .insert(releases)
    .values({
      groupId: akbId,
      title: "恋するフォーチュンクッキー",
      releaseType: "single",
      releaseNumber: 32,
      releaseDate: "2013-08-21"
    })
    .onConflictDoNothing()
    .returning();

  const allReleases = await db.select().from(releases);
  const releaseAId = releaseA?.id ?? allReleases.find((r) => r.title === "ぐるぐるカーテン")?.id;
  const releaseBId = releaseB?.id ?? allReleases.find((r) => r.title === "恋するフォーチュンクッキー")?.id;

  if (!releaseAId || !releaseBId) {
    throw new Error("failed to resolve release ids");
  }

  const [songA] = await db
    .insert(songs)
    .values({
      releaseId: releaseAId,
      title: "ぐるぐるカーテン",
      trackNumber: 1,
      songCategory: "title"
    })
    .onConflictDoNothing()
    .returning();

  const [songB] = await db
    .insert(songs)
    .values({
      releaseId: releaseBId,
      title: "恋するフォーチュンクッキー",
      trackNumber: 1,
      songCategory: "title"
    })
    .onConflictDoNothing()
    .returning();

  const [composerA] = await db
    .insert(creators)
    .values({ name: "杉山勝彦", nameRomaji: "Masahiko Sugiyama" })
    .onConflictDoNothing()
    .returning();

  const [composerB] = await db
    .insert(creators)
    .values({ name: "伊藤心太郎", nameRomaji: "Shintaro Ito" })
    .onConflictDoNothing()
    .returning();

  const [lyricist] = await db
    .insert(creators)
    .values({ name: "秋元康", nameRomaji: "Yasushi Akimoto" })
    .onConflictDoNothing()
    .returning();

  const allSongs = await db.select().from(songs);
  const allCreators = await db.select().from(creators);

  const songAId = songA?.id ?? allSongs.find((s) => s.title === "ぐるぐるカーテン")?.id;
  const songBId = songB?.id ?? allSongs.find((s) => s.title === "恋するフォーチュンクッキー")?.id;

  const composerAId = composerA?.id ?? allCreators.find((c) => c.name === "杉山勝彦")?.id;
  const composerBId = composerB?.id ?? allCreators.find((c) => c.name === "伊藤心太郎")?.id;
  const lyricistId = lyricist?.id ?? allCreators.find((c) => c.name === "秋元康")?.id;

  if (!songAId || !songBId || !composerAId || !composerBId || !lyricistId) {
    throw new Error("failed to resolve foreign ids");
  }

  const existing = await db
    .select()
    .from(songCredits)
    .where(and(eq(songCredits.songId, songAId), eq(songCredits.creatorId, composerAId), eq(songCredits.role, "composer")));

  if (existing.length === 0) {
    await db.insert(songCredits).values([
      { songId: songAId, creatorId: composerAId, role: "composer" },
      { songId: songAId, creatorId: lyricistId, role: "lyricist" },
      { songId: songBId, creatorId: composerBId, role: "composer" },
      { songId: songBId, creatorId: lyricistId, role: "lyricist" }
    ]);
  }

  console.log("seed completed");
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
