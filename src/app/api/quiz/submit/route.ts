import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/http";
import { submitQuiz } from "@/lib/service";

export const maxDuration = 60;

const Submit = z.object({
  attemptId: z.number().int(),
  answers: z.array(z.union([z.number().int(), z.string().max(1000), z.null()])).max(20),
});

export async function POST(request: Request) {
  const parsed = Submit.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Answers missing." }, { status: 400 });
  try {
    return NextResponse.json(await submitQuiz(parsed.data.attemptId, parsed.data.answers));
  } catch (err) {
    return errorResponse(err);
  }
}
