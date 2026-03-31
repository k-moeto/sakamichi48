import { and, eq } from "drizzle-orm";

import { db } from "./client.js";
import { creators, groups, members, releases, songCredits, songFormations, songs } from "./schema.js";
import { normalizeCreatorName } from "../lib/normalizer.js";
import type { ScrapedRelease } from "../types/models.js";

function requireId(row: { id: number } | undefined, label: string): number {
  if (!row) {
    throw new Error(`failed to create ${label}`);
  }
  return row.id;
}

async function upsertGroup(release: ScrapedRelease): Promise<number> {
  const existing = await db.select().from(groups).where(eq(groups.name, release.groupName)).limit(1);
  if (existing.length > 0) {
    return requireId(existing[0], `group(${release.groupName})`);
  }

  const inserted = await db
    .insert(groups)
    .values({
      name: release.groupName,
      nameRomaji: release.groupRomaji,
      category: release.groupCategory
    })
    .returning({ id: groups.id });

  return requireId(inserted[0], `group(${release.groupName})`);
}

async function upsertRelease(groupId: number, release: ScrapedRelease): Promise<number> {
  const existing = await db
    .select()
    .from(releases)
    .where(and(eq(releases.groupId, groupId), eq(releases.title, release.title)))
    .limit(1);

  if (existing.length > 0) {
    return requireId(existing[0], `release(${release.title})`);
  }

  const inserted = await db
    .insert(releases)
    .values({
      groupId,
      title: release.title,
      releaseType: release.releaseType,
      releaseNumber: release.releaseNumber,
      releaseDate: release.releaseDate,
      wikipediaUrl: release.wikipediaUrl
    })
    .returning({ id: releases.id });

  return requireId(inserted[0], `release(${release.title})`);
}

async function upsertSong(releaseId: number, title: string, trackNumber: number): Promise<number> {
  const existing = await db
    .select()
    .from(songs)
    .where(and(eq(songs.releaseId, releaseId), eq(songs.title, title), eq(songs.trackNumber, trackNumber)))
    .limit(1);

  if (existing.length > 0) {
    return requireId(existing[0], `song(${title})`);
  }

  const inserted = await db
    .insert(songs)
    .values({
      releaseId,
      title,
      trackNumber,
      songCategory: trackNumber === 1 ? "title" : "coupling"
    })
    .returning({ id: songs.id });

  return requireId(inserted[0], `song(${title})`);
}

async function upsertCreator(name: string): Promise<number> {
  const normalized = normalizeCreatorName(name);

  const existing = await db.select().from(creators).where(eq(creators.name, normalized)).limit(1);
  if (existing.length > 0) {
    return requireId(existing[0], `creator(${normalized})`);
  }

  const inserted = await db
    .insert(creators)
    .values({
      name: normalized
    })
    .returning({ id: creators.id });

  return requireId(inserted[0], `creator(${normalized})`);
}

async function upsertCredit(songId: number, creatorId: number, role: "lyricist" | "composer" | "arranger"): Promise<void> {
  const existing = await db
    .select()
    .from(songCredits)
    .where(and(eq(songCredits.songId, songId), eq(songCredits.creatorId, creatorId), eq(songCredits.role, role)))
    .limit(1);

  if (existing.length > 0) {
    return;
  }

  await db.insert(songCredits).values({ songId, creatorId, role });
}

async function upsertMember(groupId: number, name: string): Promise<number> {
  const normalized = normalizeCreatorName(name);
  const existing = await db
    .select()
    .from(members)
    .where(and(eq(members.groupId, groupId), eq(members.name, normalized)))
    .limit(1);

  if (existing.length > 0) {
    return requireId(existing[0], `member(${normalized})`);
  }

  const inserted = await db
    .insert(members)
    .values({ groupId, name: normalized })
    .returning({ id: members.id });

  return requireId(inserted[0], `member(${normalized})`);
}

async function upsertFormation(
  songId: number,
  memberId: number,
  positionType: "center" | "fukujin" | "senbatsu" | "under",
  rowNumber?: number
): Promise<void> {
  const existing = await db
    .select()
    .from(songFormations)
    .where(and(eq(songFormations.songId, songId), eq(songFormations.memberId, memberId)))
    .limit(1);

  if (existing.length > 0) {
    return;
  }

  await db.insert(songFormations).values({
    songId,
    memberId,
    positionType,
    rowNumber: rowNumber ?? null
  });
}

export async function ingestReleases(releasesData: ScrapedRelease[]): Promise<void> {
  for (const release of releasesData) {
    const groupId = await upsertGroup(release);
    const releaseId = await upsertRelease(groupId, release);

    for (const song of release.songs) {
      const songId = await upsertSong(releaseId, song.title, song.trackNumber);

      for (const credit of song.credits) {
        for (const creatorName of credit.names) {
          const creatorId = await upsertCreator(creatorName);
          await upsertCredit(songId, creatorId, credit.role);
        }
      }

      if (song.formation) {
        for (const member of song.formation.members) {
          const memberId = await upsertMember(groupId, member.name);
          const positionType =
            member.isCenter ? "center" : song.formation?.formationType === "undergirls" ? "under" : "senbatsu";
          await upsertFormation(songId, memberId, positionType, member.row);
        }
      }
    }
  }
}
