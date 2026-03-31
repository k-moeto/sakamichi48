import type { FastifyInstance } from "fastify";
import { asc } from "drizzle-orm";

import { db } from "../db/client.js";
import { groups } from "../db/schema.js";

export async function registerGroupRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/groups", async () => {
    return db.select().from(groups).orderBy(asc(groups.name));
  });
}
