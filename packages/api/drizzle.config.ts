import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://sakamichi:sakamichi@localhost:5432/sakamichi48"
  },
  verbose: true,
  strict: true
});
