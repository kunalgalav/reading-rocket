import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, parentOnly } from "@/lib/http";
import { getParent, isParent, updateSettings } from "@/lib/parent";

export const dynamic = "force-dynamic";

/** Account status for the Grown-ups page. The email is only revealed to the logged-in parent. */
export async function GET() {
  try {
    const [parent, loggedIn] = await Promise.all([getParent(), isParent()]);
    return NextResponse.json({
      exists: Boolean(parent),
      loggedIn,
      parent: loggedIn ? parent : null,
      emailConfigured: Boolean(process.env.COMMS_API_KEY),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

const Settings = z.object({
  email: z.email().max(200).optional(),
  weekly_email: z.boolean().optional(),
  password: z.string().min(8).max(200).optional(),
});

export async function PATCH(request: Request) {
  if (!(await isParent())) return parentOnly();
  const parsed = Settings.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Check the email address (and passwords need 8+ characters)." }, { status: 400 });
  try {
    return NextResponse.json({ parent: await updateSettings(parsed.data) });
  } catch (err) {
    return errorResponse(err);
  }
}
