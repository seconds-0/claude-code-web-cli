import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema.js";

export * from "./schema.js";

export function createDb(connectionString: string) {
  const sql = neon(connectionString);
  return drizzle({ client: sql, schema });
}

export type Database = ReturnType<typeof createDb>;
