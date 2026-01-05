import { createDb } from "@ccc/db";

// Singleton database instance
let db: ReturnType<typeof createDb> | null = null;

export function isDbConfigured(): boolean {
  return !!process.env["DATABASE_URL"];
}

export function getDb() {
  if (!db) {
    const url = process.env["DATABASE_URL"];
    if (!url) {
      throw new Error("DATABASE_URL environment variable is required");
    }
    db = createDb(url);
  }
  return db;
}

export type { Database } from "@ccc/db";
