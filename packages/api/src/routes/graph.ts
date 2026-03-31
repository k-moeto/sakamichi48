import type { FastifyInstance } from "fastify";
import { and, asc, eq, inArray, ne } from "drizzle-orm";

import { db } from "../db/client.js";
import { creators, groups, releases, songCredits, songs } from "../db/schema.js";

const AKIMOTO_NAME = "秋元康";

type GraphNode = {
  id: string;
  type: "creator" | "song";
  label: string;
  groupId?: number;
  groupName?: string;
};

type GraphEdge = {
  source: string;
  target: string;
  role: "lyricist" | "composer" | "arranger";
};

function parseBoolean(value?: string): boolean {
  return value === "true" || value === "1";
}

function parseLimit(value?: string, fallback = 120, max = 300): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(Math.floor(parsed), max);
}

function dedupeNodes(nodes: GraphNode[]): GraphNode[] {
  return Array.from(new Map(nodes.map((node) => [node.id, node])).values());
}

function dedupeEdges(edges: GraphEdge[]): GraphEdge[] {
  return Array.from(new Map(edges.map((edge) => [`${edge.source}:${edge.target}:${edge.role}`, edge])).values());
}

export async function registerGraphRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/graph/composer/:id", async (request, reply) => {
    const params = request.params as { id: string };
    const query = request.query as { excludeAkimoto?: string };
    const composerId = Number(params.id);
    const excludeAkimoto = parseBoolean(query.excludeAkimoto);

    const composer = await db
      .select({ id: creators.id, name: creators.name })
      .from(creators)
      .where(eq(creators.id, composerId))
      .limit(1);

    if (composer.length === 0) {
      return reply.code(404).send({ message: "Composer not found" });
    }
    const composerNode = composer[0]!;

    const links = await db
      .select({
        songId: songs.id,
        songTitle: songs.title,
        groupName: groups.name,
        groupId: groups.id,
        role: songCredits.role
      })
      .from(songCredits)
      .innerJoin(songs, eq(songCredits.songId, songs.id))
      .innerJoin(releases, eq(songs.releaseId, releases.id))
      .innerJoin(groups, eq(releases.groupId, groups.id))
      .where(eq(songCredits.creatorId, composerId));

    const songIds = [...new Set(links.map((x) => x.songId))];
    const coCredits =
      songIds.length > 0
        ? await db
            .select({
              songId: songCredits.songId,
              creatorId: creators.id,
              creatorName: creators.name,
              role: songCredits.role
            })
            .from(songCredits)
            .innerJoin(creators, eq(songCredits.creatorId, creators.id))
            .where(
              and(
                inArray(songCredits.songId, songIds),
                eq(songCredits.role, "composer"),
                excludeAkimoto ? ne(creators.name, AKIMOTO_NAME) : undefined
              )
            )
        : [];

    const nodes = dedupeNodes([
      {
        id: `creator:${composerNode.id}`,
        type: "creator",
        label: composerNode.name
      },
      ...links.map((link) => ({
        id: `song:${link.songId}`,
        type: "song" as const,
        label: link.songTitle,
        groupId: link.groupId,
        groupName: link.groupName
      })),
      ...coCredits
        .filter((credit) => credit.creatorId !== composerId)
        .map((credit) => ({
          id: `creator:${credit.creatorId}`,
          type: "creator" as const,
          label: credit.creatorName
        }))
    ]);

    const edges = dedupeEdges([
      ...links.map((link) => ({
        source: `creator:${composerNode.id}`,
        target: `song:${link.songId}`,
        role: link.role
      })),
      ...coCredits
        .filter((credit) => credit.creatorId !== composerId)
        .map((credit) => ({
          source: `creator:${credit.creatorId}`,
          target: `song:${credit.songId}`,
          role: credit.role
        }))
    ]);

    return { nodes, edges };
  });

  app.get("/api/graph/group/:id", async (request, reply) => {
    const params = request.params as { id: string };
    const query = request.query as { limit?: string; excludeAkimoto?: string };
    const groupId = Number(params.id);
    const limit = parseLimit(query.limit, 120, 300);
    const excludeAkimoto = parseBoolean(query.excludeAkimoto);

    const groupRow = await db.select().from(groups).where(eq(groups.id, groupId)).limit(1);
    if (groupRow.length === 0) {
      return reply.code(404).send({ message: "Group not found" });
    }

    const songsInGroup = await db
      .select({
        songId: songs.id,
        songTitle: songs.title,
        groupId: groups.id,
        groupName: groups.name
      })
      .from(songs)
      .innerJoin(releases, eq(songs.releaseId, releases.id))
      .innerJoin(groups, eq(releases.groupId, groups.id))
      .where(eq(groups.id, groupId))
      .orderBy(asc(releases.releaseNumber), asc(songs.trackNumber), asc(songs.title))
      .limit(limit);

    if (songsInGroup.length === 0) {
      return { nodes: [], edges: [] };
    }

    const songIds = songsInGroup.map((song) => song.songId);
    const creditsInGroup = await db
      .select({
        songId: songCredits.songId,
        creatorId: creators.id,
        creatorName: creators.name,
        role: songCredits.role
      })
      .from(songCredits)
      .innerJoin(creators, eq(songCredits.creatorId, creators.id))
      .where(
        and(
          inArray(songCredits.songId, songIds),
          excludeAkimoto ? ne(creators.name, AKIMOTO_NAME) : undefined
        )
      );

    const nodes = dedupeNodes([
      ...songsInGroup.map((song) => ({
        id: `song:${song.songId}`,
        type: "song" as const,
        label: song.songTitle,
        groupId: song.groupId,
        groupName: song.groupName
      })),
      ...creditsInGroup.map((credit) => ({
        id: `creator:${credit.creatorId}`,
        type: "creator" as const,
        label: credit.creatorName
      }))
    ]);

    const edges = dedupeEdges(
      creditsInGroup.map((credit) => ({
        source: `creator:${credit.creatorId}`,
        target: `song:${credit.songId}`,
        role: credit.role
      }))
    );

    return { nodes, edges };
  });
}
