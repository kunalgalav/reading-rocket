import { after, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/http";
import { submitQuiz } from "@/lib/service";
import { refreshSuggestions } from "@/lib/suggestions";

export const maxDuration = 120; // marking, then suggestions in after()

const Submit = z.object({
  attemptId: z.number().int(),
  answers: z.array(z.union([z.number().int(), z.string().max(1000), z.null()])).max(20),
});

export async function POST(request: Request) {
  const parsed = Submit.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Answers missing." }, { status: 400 });
  try {
    const result = await submitQuiz(parsed.data.attemptId, parsed.data.answers);
    // Next-book suggestions for the parent run after the response, so he sees his results straight away.
    // If this doesn't finish, the weekly email refreshes them anyway.
    after(() =>
      refreshSuggestions(parsed.data.attemptId).catch((err) =>
        console.error("Book suggestions failed", err instanceof Error ? err.message : err),
      ),
    );
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
