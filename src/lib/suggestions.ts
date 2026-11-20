import "server-only";
import { BookSuggestions, suggestBooks } from "./agents";
import { getDb, type BookRow } from "./db";
import { notifyTelegram } from "./notify";
import { normaliseTitle, skillProfile, type MarkedAttempt } from "./progress";
import { latestRubric, regenerateRubric } from "./service";

// Next-book suggestions: after each marked quiz, Sonnet looks at his recent books, bands and per-skill quiz
// results (KS1/KS2 reading content domains) and suggests 4 books to help him progress. Stored, sent to the
// parent on Telegram, and included in the weekly email.

export interface StoredSuggestions {
  id: number;
  attempt_id: number | null;
  data: BookSuggestions;
  created_at: string;
}

const RECENT_BOOKS = 8;
const RECENT_QUIZZES = 6;

export async function latestSuggestions(): Promise<StoredSuggestions | null> {
  const db = await getDb();
  const [row] = await db.query<StoredSuggestions>("SELECT * FROM book_suggestions ORDER BY id DESC LIMIT 1");
  return row ? { ...row, data: BookSuggestions.parse(row.data) } : null;
}

/**
 * Makes new suggestions based on everything up to quiz attempt `attemptId`, stores them and sends them to
 * Telegram. Runs once per attempt (the attempt id is unique), so a repeat call returns the stored result.
 */
export async function refreshSuggestions(attemptId: number, { notify = true } = {}): Promise<StoredSuggestions> {
  const db = await getDb();
  const [existing] = await db.query<StoredSuggestions>("SELECT * FROM book_suggestions WHERE attempt_id = $1", [attemptId]);
  if (existing) return { ...existing, data: BookSuggestions.parse(existing.data) };

  const rubric = (await latestRubric()) ?? (await regenerateRubric());
  const books = await db.query<BookRow>("SELECT * FROM books ORDER BY finished_on DESC, id DESC");
  const attempts = await db.query<MarkedAttempt & { book_id: number; correct: number }>(
    "SELECT book_id, questions, results, correct FROM quiz_attempts WHERE correct IS NOT NULL AND id <= $1 ORDER BY id DESC LIMIT $2",
    [attemptId, RECENT_QUIZZES],
  );
  const bestQuiz = new Map<number, number>();
  for (const a of await db.query<{ book_id: number; best: number }>(
    "SELECT book_id, MAX(correct) AS best FROM quiz_attempts WHERE correct IS NOT NULL GROUP BY book_id",
  )) {
    bestQuiz.set(a.book_id, Number(a.best));
  }

  const data = await suggestBooks({
    rubric,
    recentBooks: books.slice(0, RECENT_BOOKS).map((b) => ({
      title: b.title,
      author: b.author,
      band_name: b.band_name,
      quiz: bestQuiz.has(b.id) ? `${bestQuiz.get(b.id)}/10` : "not taken",
    })),
    profile: skillProfile(attempts),
    alreadyRead: books.map((b) => b.title),
  });

  // Belt and braces: drop anything he's already read, even if the model slipped.
  const read = new Set(books.map((b) => normaliseTitle(b.title)));
  data.suggestions = data.suggestions.filter((s) => !read.has(normaliseTitle(s.title)));

  const [row] = await db.query<StoredSuggestions>(
    `INSERT INTO book_suggestions (attempt_id, data) VALUES ($1, $2)
     ON CONFLICT (attempt_id) DO UPDATE SET attempt_id = EXCLUDED.attempt_id RETURNING *`,
    [attemptId, JSON.stringify(data)],
  );
  const stored = { ...row, data: BookSuggestions.parse(row.data) };

  if (notify) {
    const [quiz] = await db.query<{ title: string; correct: number }>(
      "SELECT b.title, q.correct FROM quiz_attempts q JOIN books b ON b.id = q.book_id WHERE q.id = $1",
      [attemptId],
    );
    const heading = quiz ? `📖 What to read next (after the "${quiz.title}" quiz, ${quiz.correct}/10)` : "📖 What to read next";
    await notifyTelegram(`${heading}\n\n${suggestionsText(stored.data)}`, `suggestions-${attemptId}`, {
      kind: "book-suggestions",
      attempt_id: attemptId,
    });
  }
  return stored;
}

/** Latest suggestions, refreshed first if a quiz has been marked since they were made. Never throws. */
export async function freshSuggestions(): Promise<StoredSuggestions | null> {
  try {
    const db = await getDb();
    const [last] = await db.query<{ id: number }>("SELECT id FROM quiz_attempts WHERE correct IS NOT NULL ORDER BY id DESC LIMIT 1");
    const current = await latestSuggestions();
    if (last && (!current || (current.attempt_id ?? 0) < last.id)) return await refreshSuggestions(last.id, { notify: false });
    return current;
  } catch (err) {
    console.error("Book suggestions failed", err instanceof Error ? err.message : err);
    return latestSuggestions().catch(() => null);
  }
}

const KIND_LABEL = { consolidate: "At his level", stretch: "Stretch", broaden: "Something different" } as const;

/** Plain-text version for Telegram and the email's text part. */
export function suggestionsText(s: BookSuggestions): string {
  return [
    `Level: ${s.level.band_name}. ${s.level.expectation}`,
    ...s.focus.map((f) => `Work on ${f.skill}: ${f.why}`),
    "",
    ...s.suggestions.map((b, i) => `${i + 1}. ${b.title} by ${b.author} (${KIND_LABEL[b.kind]}, ${b.band_name})\n   ${b.why}`),
    "",
    `Tip: ${s.parent_tip}`,
  ].join("\n");
}

export { KIND_LABEL };
