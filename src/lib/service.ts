import "server-only";
import { assessLevel, estimateWords, generateMethodology, generateQuiz, markFreeText, Rubric, type QuizQuestion } from "./agents";
import { getDb, type BookRow } from "./db";
import { creditMultiplier, MAX_QUIZ_ATTEMPTS, milestoneProgress, summarize, toDay } from "./progress";

// ---------- Methodology ----------

export async function latestRubric(): Promise<Rubric | null> {
  const db = await getDb();
  const [row] = await db.query<{ rubric: unknown }>("SELECT rubric FROM methodology ORDER BY id DESC LIMIT 1");
  return row ? Rubric.parse(row.rubric) : null;
}

export async function regenerateRubric(): Promise<Rubric> {
  const rubric = await generateMethodology();
  const db = await getDb();
  await db.query("INSERT INTO methodology (rubric) VALUES ($1)", [JSON.stringify(rubric)]);
  return rubric;
}

async function ensureRubric(): Promise<Rubric> {
  return (await latestRubric()) ?? regenerateRubric();
}

// ---------- Books ----------

export async function listBooks(): Promise<BookRow[]> {
  const db = await getDb();
  return db.query<BookRow>("SELECT * FROM books ORDER BY finished_on DESC, id DESC");
}

export async function getBook(id: number): Promise<BookRow | null> {
  const db = await getDb();
  const [row] = await db.query<BookRow>("SELECT * FROM books WHERE id = $1", [id]);
  return row ?? null;
}

export async function addBook(input: { title: string; author: string | null; finished_on: string }): Promise<BookRow> {
  const estimate = await estimateWords(input.title, input.author);
  const db = await getDb();
  const [book] = await db.query<BookRow>(
    `INSERT INTO books (title, author, finished_on, estimated_words, words, word_confidence, word_notes)
     VALUES ($1, $2, $3, $4, $4, $5, $6) RETURNING *`,
    [input.title, input.author, input.finished_on, estimate.estimated_words, estimate.confidence, estimate.notes],
  );

  // Level scoring is best-effort: the book is still saved if it fails, and can be re-scored later.
  try {
    return await scoreLevel(book);
  } catch (err) {
    console.error("Level assessment failed", err);
    return book;
  }
}

async function scoreLevel(book: BookRow): Promise<BookRow> {
  const db = await getDb();
  const rubric = await ensureRubric();
  const recent = await db.query<{ title: string; band_name: string | null }>(
    "SELECT title, band_name FROM books WHERE id <> $1 AND band_id IS NOT NULL ORDER BY finished_on DESC, id DESC LIMIT 5",
    [book.id],
  );
  const level = await assessLevel(rubric, book, recent);
  const [updated] = await db.query<BookRow>(
    `UPDATE books SET band_id = $2, band_name = $3, level_rationale = $4, level_delta = $5 WHERE id = $1 RETURNING *`,
    [book.id, level.band_id, level.band_name, level.rationale, level.score_delta],
  );
  return updated;
}

export async function setWords(id: number, words: number): Promise<BookRow | null> {
  const db = await getDb();
  const [best] = await db.query<{ multiplier: number }>(
    "SELECT multiplier FROM quiz_attempts WHERE book_id = $1 AND multiplier IS NOT NULL ORDER BY multiplier DESC LIMIT 1",
    [id],
  );
  const [row] = await db.query<BookRow>(
    `UPDATE books SET words = $2::int, words_edited_by_parent = true,
       credited_words = CASE WHEN $3::real IS NULL THEN credited_words ELSE ROUND($2::int * $3::real)::int END
     WHERE id = $1 RETURNING *`,
    [id, words, best?.multiplier ?? null],
  );
  return row ?? null;
}

export async function deleteBook(id: number): Promise<void> {
  const db = await getDb();
  await db.query("DELETE FROM books WHERE id = $1", [id]);
}

// ---------- Stats ----------

export async function getStats(today = new Date()) {
  const books = await listBooks();
  const totals = summarize(books, today);
  const readingScore = books.reduce((sum, b) => sum + (b.score_awarded ?? 0), 0);
  return {
    today: toDay(today),
    totals,
    milestones: milestoneProgress(totals.year),
    readingScore: Math.round(readingScore * 10) / 10,
    currentBand: books.find((b) => b.band_name && b.credited_words)?.band_name ?? null,
    recent: books.slice(0, 5),
  };
}

// ---------- Quiz ----------

/** What the child's browser sees: no correct answers. */
export type PublicQuestion = Pick<QuizQuestion, "id" | "kind" | "question" | "options">;

interface AttemptRow {
  id: number;
  book_id: number;
  attempt: number;
  questions: QuizQuestion[];
  answers: unknown;
  correct: number | null;
  multiplier: number | null;
}

const toPublic = (qs: QuizQuestion[]): PublicQuestion[] =>
  qs.map(({ id, kind, question, options }) => ({ id, kind, question, options }));

export class QuizError extends Error {}

export async function startQuiz(bookId: number) {
  const book = await getBook(bookId);
  if (!book) throw new QuizError("Book not found.");
  const db = await getDb();
  const attempts = await db.query<AttemptRow>("SELECT * FROM quiz_attempts WHERE book_id = $1 ORDER BY attempt", [bookId]);

  const open = attempts.find((a) => a.correct === null);
  if (open) return { book, attemptId: open.id, attempt: open.attempt, questions: toPublic(open.questions) };

  if (attempts.some((a) => a.multiplier === 1)) throw new QuizError("You already got full marks on this book!");
  if (attempts.length >= MAX_QUIZ_ATTEMPTS) throw new QuizError("You've used both tries for this book.");

  const questions = await generateQuiz(book);
  const [row] = await db.query<AttemptRow>(
    "INSERT INTO quiz_attempts (book_id, attempt, questions) VALUES ($1, $2, $3) RETURNING *",
    [bookId, attempts.length + 1, JSON.stringify(questions)],
  );
  return { book, attemptId: row.id, attempt: row.attempt, questions: toPublic(questions) };
}

export async function submitQuiz(attemptId: number, answers: (number | string | null)[]) {
  const db = await getDb();
  const [attempt] = await db.query<AttemptRow>("SELECT * FROM quiz_attempts WHERE id = $1", [attemptId]);
  if (!attempt) throw new QuizError("Quiz not found.");
  if (attempt.correct !== null) throw new QuizError("This quiz has already been marked.");
  const book = await getBook(attempt.book_id);
  if (!book) throw new QuizError("Book not found.");

  const questions = attempt.questions;
  const freeText = questions
    .map((q, i) => ({ q, answer: answers[i] }))
    .filter(({ q }) => q.kind === "free_text")
    .map(({ q, answer }) => ({ id: q.id, question: q.question, model_answer: q.model_answer, answer: String(answer ?? "").trim() }));
  const marked = new Map((await markFreeText(book, freeText)).map((r) => [r.id, r]));

  const results = questions.map((q, i) => {
    if (q.kind === "multiple_choice") {
      const correct = answers[i] === q.correct_index;
      return {
        id: q.id,
        correct,
        feedback: correct ? "Well done!" : `The answer was: ${q.options[q.correct_index] ?? q.model_answer}`,
      };
    }
    const m = marked.get(q.id);
    return { id: q.id, correct: m?.correct ?? false, feedback: m?.feedback ?? q.model_answer };
  });

  const correct = results.filter((r) => r.correct).length;
  const multiplier = creditMultiplier(correct, questions.length);
  await db.query("UPDATE quiz_attempts SET answers = $2, results = $3, correct = $4, multiplier = $5 WHERE id = $1", [
    attemptId,
    JSON.stringify(answers),
    JSON.stringify(results),
    correct,
    multiplier,
  ]);

  // The book keeps its best attempt.
  const [best] = await db.query<{ multiplier: number }>(
    "SELECT MAX(multiplier) AS multiplier FROM quiz_attempts WHERE book_id = $1",
    [book.id],
  );
  const bestMultiplier = Number(best.multiplier);
  const [updated] = await db.query<BookRow>(
    "UPDATE books SET credited_words = $2, score_awarded = $3 WHERE id = $1 RETURNING *",
    [book.id, Math.round(book.words * bestMultiplier), (book.level_delta ?? 0) * bestMultiplier],
  );

  return {
    correct,
    total: questions.length,
    multiplier,
    results,
    book: updated,
    canRetry: multiplier < 1 && attempt.attempt < MAX_QUIZ_ATTEMPTS,
  };
}
