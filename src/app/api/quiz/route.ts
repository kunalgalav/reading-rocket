import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/http";
import { startQuiz } from "@/lib/service";

export const maxDuration = 120;

export async function POST(request: Request) {
  const parsed = z.object({ bookId: z.number().int() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Missing book." }, { status: 400 });
  try {
    return NextResponse.json(await startQuiz(parsed.data.bookId));
  } catch (err) {
    return errorResponse(err);
  }
}
