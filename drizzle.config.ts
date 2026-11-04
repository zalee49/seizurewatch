import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";

// Pick up .env.local the way Next does; `db:generate` doesn't need DATABASE_URL.
loadEnvConfig(process.cwd());

export default defineConfig({
  dialect: "postgresql",
  schema: "src/lib/db/schema.ts",
  out: "drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
