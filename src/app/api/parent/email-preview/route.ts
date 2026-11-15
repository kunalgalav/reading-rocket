import { NextResponse } from "next/server";
import { buildWeeklySummary, renderWeeklyEmail, siteUrl } from "@/lib/email";
import { errorResponse, parentOnly } from "@/lib/http";
import { isParent } from "@/lib/parent";

export const dynamic = "force-dynamic";

/** Shows this week's summary email in the browser without sending it. */
export async function GET() {
  if (!(await isParent())) return parentOnly();
  try {
    const { html } = renderWeeklyEmail(await buildWeeklySummary(), siteUrl());
    return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8" } });
  } catch (err) {
    return errorResponse(err);
  }
}
