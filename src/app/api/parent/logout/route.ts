import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/http";
import { logOut } from "@/lib/parent";

export async function POST() {
  try {
    await logOut();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
