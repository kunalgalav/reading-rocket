import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/http";
import { getStats } from "@/lib/service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getStats());
  } catch (err) {
    return errorResponse(err);
  }
}
