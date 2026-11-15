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
  // v2: tricky words per book + sentence points
  `ALTER TABLE books ADD COLUMN IF NOT EXISTS vocab JSONB`,
  `ALTER TABLE books ADD COLUMN IF NOT EXISTS vocab_points REAL`,
  `ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS vocab_points REAL`,
  // v2: single parent account, sessions, weekly email log
  `CREATE TABLE IF NOT EXISTS parent (
     id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
     email TEXT NOT NULL,
     password_hash TEXT NOT NULL,
     weekly_email BOOLEAN NOT NULL DEFAULT true,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS parent_sessions (
     token_hash TEXT PRIMARY KEY,
     expires_at TIMESTAMPTZ NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS email_log (
     week_start TEXT PRIMARY KEY,
     sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     email_id TEXT
   )`,
];

/**
 * Find the Postgres connection string. Vercel's Neon integration may add a prefix
 * (e.g. STORAGE_DATABASE_URL), so accept the common names and any *_DATABASE_URL / *_POSTGRES_URL.
 */
export function databaseUrl(): string | undefined {
  const env = process.env;
  if (env.DATABASE_URL) return env.DATABASE_URL;
  if (env.POSTGRES_URL) return env.POSTGRES_URL;
  const key = Object.keys(env)
    .filter((k) => /(^|_)(DATABASE|POSTGRES)_URL$/.test(k) && env[k]?.startsWith("postgres"))
    .sort()[0];
  return key ? env[key] : undefined;
}

export class DbConfigError extends Error {}

export function dbDriver(): "neon" | "pglite" | "missing" {
  if (databaseUrl()) return "neon";
  return process.env.VERCEL ? "missing" : "pglite";
}

async function connect(): Promise<Db> {
  let db: Db;
  const url = databaseUrl();
  if (!url && process.env.VERCEL) {
    // Vercel's filesystem is read-only, so the embedded database can't work there.
    throw new DbConfigError("No database connected. In Vercel, connect a Neon database under Storage, then redeploy.");
  }
  if (url) {
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(url);
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
  vocab: VocabWord[] | null;
  vocab_points: number | null;
}

export interface VocabWord {
  word: string;
  meaning: string; // child-friendly definition
  example: string; // how the book (or a simple sentence) uses it
}
