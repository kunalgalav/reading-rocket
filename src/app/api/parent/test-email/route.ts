import { NextResponse } from "next/server";
import { sendWeeklyEmail } from "@/lib/email";
import { errorResponse, parentOnly } from "@/lib/http";
import { isParent } from "@/lib/parent";

export const maxDuration = 60;

/** Send this week's summary now, marked [Test]. Doesn't count as the weekly send. */
export async function POST() {
  if (!(await isParent())) return parentOnly();
  try {
    return NextResponse.json(await sendWeeklyEmail({ force: true }));
  } catch (err) {
    return errorResponse(err);
  }
}
