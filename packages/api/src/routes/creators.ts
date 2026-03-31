import type { FastifyInstance } from "fastify";
import { and, asc, count, ilike, ne, or, sql } from "drizzle-orm";

import { db } from "../db/client.js";
import { creators, songCredits } from "../db/schema.js";

const AKIMOTO_NAME = "秋元康";

export async function registerCreatorRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/creators", async (request) => {
    const query = request.query as { q?: string; limit?: string; excludeAkimoto?: string };
    const keyword = (query.q ?? "").trim();
    const excludeAkimoto = query.excludeAkimoto === "true" || query.excludeAkimoto === "1";
    const limit = Math.min(Math.max(Number(query.limit ?? 30), 1), 200);

    const rows = await db
      .select({
        id: creators.id,
        name: creators.name,
        nameRomaji: creators.nameRomaji,
        songCount: count(songCredits.id)
      })
      .from(creators)
      .leftJoin(songCredits, sql`${songCredits.creatorId} = ${creators.id}`)
      .where(
        and(
          keyword.length > 0
            ? or(ilike(creators.name, `%${keyword}%`), ilike(creators.nameRomaji, `%${keyword}%`))
            : undefined,
          excludeAkimoto ? ne(creators.name, AKIMOTO_NAME) : undefined
        )
      )
      .groupBy(creators.id)
      .orderBy(asc(creators.name))
      .limit(limit);

    return rows;
  });
}
