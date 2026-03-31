import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().default(4000),
  FRONTEND_ORIGINS: z.string().default(""),
  DATABASE_URL: z
    .string()
    .min(1)
    .default("postgresql://sakamichi:sakamichi@localhost:5432/sakamichi48")
});

export const env = envSchema.parse(process.env);
