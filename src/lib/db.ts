import "server-only";

// Tiny SQL layer: Neon Postgres when DATABASE_URL is set (hosted), embedded PGlite otherwise (local dev).

export interface Db {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS methodology (
     id SERIAL PRIMARY KEY,
     rubric JSONB NOT NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS books (
     id SERIAL PRIMARY KEY,
     title TEXT NOT NULL,
     author TEXT,
     finished_on TEXT NOT NULL,
     estimated_words INTEGER NOT NULL,
     words INTEGER NOT NULL,
     word_confidence TEXT,
     word_notes TEXT,
     words_edited_by_parent BOOLEAN NOT NULL DEFAULT false,
     band_id TEXT,
     band_name TEXT,
     level_rationale TEXT,
     level_delta REAL,
     credited_words INTEGER,
     score_awarded REAL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS quiz_attempts (
     id SERIAL PRIMARY KEY,
     book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
     attempt INTEGER NOT NULL,
     questions JSONB NOT NULL,
     answers JSONB,
     results JSONB,
     correct INTEGER,
     multiplier REAL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
];

async function connect(): Promise<Db> {
  let db: Db;
  if (process.env.DATABASE_URL) {
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(process.env.DATABASE_URL);
    db = {
      query: async <T,>(text: string, params: unknown[] = []) => (await sql.query(text, params)) as T[],
    };
  } else {
    const { PGlite } = await import("@electric-sql/pglite");
    const { mkdir } = await import("node:fs/promises");
    const dir = process.env.PGLITE_DIR ?? "./.data/pglite";
    await mkdir(dir, { recursive: true }); // PGlite won't create missing parent folders
    const pg = new PGlite(dir);
    db = { query: async <T,>(text: string, params: unknown[] = []) => (await pg.query<T>(text, params)).rows };
  }
  for (const statement of SCHEMA) await db.query(statement);
  return db;
}

const globalForDb = globalThis as unknown as { __readingDb?: Promise<Db> };

export function getDb(): Promise<Db> {
  globalForDb.__readingDb ??= connect().catch((err) => {
    globalForDb.__readingDb = undefined;
    throw err;
  });
  return globalForDb.__readingDb;
}

export interface BookRow {
  id: number;
  title: string;
  author: string | null;
  finished_on: string;
  estimated_words: number;
  words: number;
  word_confidence: string | null;
  word_notes: string | null;
  words_edited_by_parent: boolean;
  band_id: string | null;
  band_name: string | null;
  level_rationale: string | null;
  level_delta: number | null;
  credited_words: number | null;
  score_awarded: number | null;
}
