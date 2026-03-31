import cors from "@fastify/cors";
import Fastify from "fastify";

import { env } from "./env.js";
import { registerCreatorRoutes } from "./routes/creators.js";
import { registerGraphRoutes } from "./routes/graph.js";
import { registerGroupRoutes } from "./routes/groups.js";
import { registerSongRoutes } from "./routes/songs.js";

const app = Fastify({ logger: true });

const allowOriginList = env.FRONTEND_ORIGINS
  .split(",")
  .map((origin) => origin.trim())
  .filter((origin) => origin.length > 0);

await app.register(cors, {
  origin: (origin, callback) => {
    if (!origin) {
      callback(null, true);
      return;
    }

    if (allowOriginList.length === 0) {
      callback(null, true);
      return;
    }

    callback(null, allowOriginList.includes(origin));
  }
});

app.get("/health", async () => ({ status: "ok" }));

await registerGroupRoutes(app);
await registerCreatorRoutes(app);
await registerSongRoutes(app);
await registerGraphRoutes(app);

app.listen({ port: env.API_PORT, host: "0.0.0.0" }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
