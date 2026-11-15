import { NextResponse } from "next/server";
import { sendWeeklyEmail } from "@/lib/email";
import { errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Called by Vercel Cron every Sunday evening (see vercel.json). Vercel sends
 * `Authorization: Bearer $CRON_SECRET`, so only the scheduler can trigger it.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await sendWeeklyEmail();
    console.log("Weekly email", result);
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
