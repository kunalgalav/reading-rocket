import { NextResponse } from "next/server";
import { dbDriver, DbConfigError, getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Public, non-sensitive health check: which database driver is in use and whether it answers. */
export async function GET() {
  const driver = dbDriver();
  const checks = {
    database: driver,
    anthropicKey: Boolean(process.env.ANTHROPIC_API_KEY),
    familyPasscode: Boolean(process.env.FAMILY_PASSCODE),
    parentPin: Boolean(process.env.PARENT_PIN),
  };
  try {
    const db = await getDb();
    await db.query("SELECT 1");
    return NextResponse.json({ ok: true, ...checks });
  } catch (err) {
    console.error("Health check failed", err);
    const reason = err instanceof DbConfigError ? err.message : "Database did not respond (see Vercel logs).";
    return NextResponse.json({ ok: false, ...checks, reason }, { status: 503 });
  }
}
