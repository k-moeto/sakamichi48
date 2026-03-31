import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const connection = postgres(
  process.env.DATABASE_URL ?? "postgresql://sakamichi:sakamichi@localhost:5432/sakamichi48",
  {
    max: 1
  }
);

export const db = drizzle(connection);
