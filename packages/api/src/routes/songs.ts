import type { FastifyInstance } from "fastify";
import { and, asc, eq, ilike, inArray, sql } from "drizzle-orm";

import { db } from "../db/client.js";
import { creators, groups, releases, songCredits, songs } from "../db/schema.js";

export async function registerSongRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/songs", async (request) => {
    const query = request.query as {
      q?: string;
      groupId?: string;
      composerId?: string;
      limit?: string;
      offset?: string;
    };

    const keyword = (query.q ?? "").trim();
    const groupId = query.groupId ? Number(query.groupId) : undefined;
    const composerId = query.composerId ? Number(query.composerId) : undefined;
    const limit = Math.min(Number(query.limit ?? 50), 200);
    const offset = Math.max(Number(query.offset ?? 0), 0);

    const songIdsByComposer =
      composerId !== undefined
        ? (
            await db
              .select({ songId: songCredits.songId })
              .from(songCredits)
              .where(and(eq(songCredits.role, "composer"), eq(songCredits.creatorId, composerId)))
          ).map((x) => x.songId)
        : undefined;

    if (composerId !== undefined && songIdsByComposer?.length === 0) {
      return [];
    }

    const rows = await db
      .select({
        songId: songs.id,
        songTitle: songs.title,
        duration: songs.duration,
        trackNumber: songs.trackNumber,
        editionType: songs.editionType,
        songCategory: songs.songCategory,
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
      .where(
        and(
          keyword.length > 0 ? ilike(songs.title, `%${keyword}%`) : undefined,
          groupId !== undefined ? eq(groups.id, groupId) : undefined,
          composerId !== undefined && songIdsByComposer
            ? inArray(songs.id, songIdsByComposer)
            : undefined
        )
      )
      .orderBy(asc(groups.name), asc(releases.releaseNumber), asc(songs.trackNumber), asc(songs.title))
      .limit(limit)
      .offset(offset);

    return rows;
  });

  app.get("/api/songs/:id", async (request, reply) => {
    const params = request.params as { id: string };
    const songId = Number(params.id);

    const song = await db
      .select({
        songId: songs.id,
        title: songs.title,
        duration: songs.duration,
        trackNumber: songs.trackNumber,
        editionType: songs.editionType,
        songCategory: songs.songCategory,
        lyricsText: songs.lyricsText,
        releaseTitle: releases.title,
        groupName: groups.name,
        releaseDate: releases.releaseDate
      })
      .from(songs)
      .innerJoin(releases, eq(songs.releaseId, releases.id))
      .innerJoin(groups, eq(releases.groupId, groups.id))
      .where(eq(songs.id, songId))
      .limit(1);

    if (song.length === 0) {
      return reply.code(404).send({ message: "Song not found" });
    }

    const credits = await db
      .select({
        role: songCredits.role,
        creatorId: creators.id,
        creatorName: creators.name,
        creatorRomaji: creators.nameRomaji
      })
      .from(songCredits)
      .innerJoin(creators, eq(songCredits.creatorId, creators.id))
      .where(eq(songCredits.songId, songId));

    return {
      ...song[0],
      credits
    };
  });
}
