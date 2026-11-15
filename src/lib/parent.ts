import "server-only";
import { randomBytes, scrypt as scryptCb, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { getDb } from "./db";

// Single parent account (one family). Password hashed with scrypt; sessions are random tokens stored hashed.

const scrypt = promisify(scryptCb) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;
export const PARENT_COOKIE = "parent_session";
const SESSION_DAYS = 30;

export interface Parent {
  email: string;
  weekly_email: boolean;
}

export class ParentError extends Error {}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, keyHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !keyHex) return false;
  const expected = Buffer.from(keyHex, "hex");
  const actual = await scrypt(password, Buffer.from(saltHex, "hex"), expected.length);
  return timingSafeEqual(actual, expected);
}

const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

export async function getParent(): Promise<Parent | null> {
  const db = await getDb();
  const [row] = await db.query<Parent>("SELECT email, weekly_email FROM parent WHERE id = 1");
  return row ?? null;
}

async function startSession(): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const db = await getDb();
  await db.query("DELETE FROM parent_sessions WHERE expires_at < now()");
  await db.query(`INSERT INTO parent_sessions (token_hash, expires_at) VALUES ($1, now() + interval '${SESSION_DAYS} days')`, [
    tokenHash(token),
  ]);
  (await cookies()).set(PARENT_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

/** One-time sign-up. Requires the existing PARENT_PIN (if configured) so only the parent can claim the account. */
export async function signUp(input: { email: string; password: string; setupPin: string }): Promise<Parent> {
  if (await getParent()) throw new ParentError("A parent account already exists. Please log in.");
  const pin = process.env.PARENT_PIN;
  if (pin && input.setupPin !== pin) throw new ParentError("That setup PIN isn't right.");
  if (!pin && process.env.NODE_ENV === "production") throw new ParentError("PARENT_PIN must be set to create the account.");
  const db = await getDb();
  await db.query("INSERT INTO parent (id, email, password_hash) VALUES (1, $1, $2) ON CONFLICT (id) DO NOTHING", [
    input.email.toLowerCase(),
    await hashPassword(input.password),
  ]);
  await startSession();
  return (await getParent())!;
}

export async function logIn(email: string, password: string): Promise<Parent> {
  const db = await getDb();
  const [row] = await db.query<{ email: string; password_hash: string }>("SELECT email, password_hash FROM parent WHERE id = 1");
  const ok = row && row.email === email.toLowerCase() && (await verifyPassword(password, row.password_hash));
  if (!ok) {
    await new Promise((r) => setTimeout(r, 500)); // slow down guessing
    throw new ParentError("Email or password is wrong.");
  }
  await startSession();
  return (await getParent())!;
}

export async function logOut(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(PARENT_COOKIE)?.value;
  if (token) {
    const db = await getDb();
    await db.query("DELETE FROM parent_sessions WHERE token_hash = $1", [tokenHash(token)]);
  }
  jar.delete(PARENT_COOKIE);
}

/** True if the request comes from the logged-in parent. */
export async function isParent(): Promise<boolean> {
  const token = (await cookies()).get(PARENT_COOKIE)?.value;
  if (!token) return false;
  const db = await getDb();
  const [row] = await db.query("SELECT 1 FROM parent_sessions WHERE token_hash = $1 AND expires_at > now()", [tokenHash(token)]);
  return Boolean(row);
}

export async function updateSettings(input: { email?: string; weekly_email?: boolean; password?: string }): Promise<Parent> {
  const db = await getDb();
  if (input.email !== undefined) await db.query("UPDATE parent SET email = $1 WHERE id = 1", [input.email.toLowerCase()]);
  if (input.weekly_email !== undefined) await db.query("UPDATE parent SET weekly_email = $1 WHERE id = 1", [input.weekly_email]);
  if (input.password !== undefined) {
    await db.query("UPDATE parent SET password_hash = $1 WHERE id = 1", [await hashPassword(input.password)]);
  }
  return (await getParent())!;
}
