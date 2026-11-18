// Pure functions for word totals, milestones and quiz credit. No I/O, so they are unit tested.

export const MILESTONES = [1_000, 10_000, 100_000, 500_000, 1_000_000] as const;

export interface CreditedBook {
  finished_on: string; // YYYY-MM-DD
  credited_words: number | null; // null = quiz not taken yet
}

/** Parse YYYY-MM-DD as a UTC date so totals don't shift with the server's timezone. */
export function parseDay(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Monday of the week containing `date` (UK weeks start on Monday). */
export function startOfWeek(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const offset = (d.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  d.setUTCDate(d.getUTCDate() - offset);
  return d;
}

export interface WordTotals {
  week: number;
  month: number;
  year: number;
  booksThisYear: number;
  awaitingQuiz: number;
}

export function summarize(books: CreditedBook[], today: Date): WordTotals {
  const weekStart = startOfWeek(today).getTime();
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();
  const totals: WordTotals = { week: 0, month: 0, year: 0, booksThisYear: 0, awaitingQuiz: 0 };

  for (const book of books) {
    const day = parseDay(book.finished_on);
    if (day.getUTCFullYear() !== y || day.getTime() > today.getTime()) continue;
    totals.booksThisYear++;
    if (book.credited_words === null) {
      totals.awaitingQuiz++;
      continue;
    }
    const words = book.credited_words;
    totals.year += words;
    if (day.getUTCMonth() === m) totals.month += words;
    if (day.getTime() >= weekStart) totals.week += words;
  }
  return totals;
}

export interface MilestoneProgress {
  reached: number[];
  next: number | null;
  previous: number;
  /** 0..1 progress from the previous milestone to the next one. */
  fraction: number;
}

export function milestoneProgress(total: number): MilestoneProgress {
  const reached = MILESTONES.filter((m) => total >= m);
  const next = MILESTONES.find((m) => total < m) ?? null;
  const previous = reached.length ? reached[reached.length - 1] : 0;
  const fraction = next === null ? 1 : (total - previous) / (next - previous);
  return { reached: [...reached], next, previous, fraction: Math.max(0, Math.min(1, fraction)) };
}

/** Quiz score → share of the book's words credited. <5 none, 5–7 half, 8+ full (out of 10). */
/** Milestones crossed when the yearly total went from `before` to `after` (empty if none). */
export function newMilestones(before: number, after: number): number[] {
  return MILESTONES.filter((m) => before < m && after >= m);
}

export function creditMultiplier(correct: number, total = 10): number {
  const outOfTen = (correct / total) * 10;
  if (outOfTen >= 8) return 1;
  if (outOfTen >= 5) return 0.5;
  return 0;
}

export const MAX_QUIZ_ATTEMPTS = 2; // first try + one retry

/**
 * Sentence-writing levels, aligned to the National Curriculum in England writing expectations
 * (composition, vocabulary, grammar and punctuation, English Appendix 2).
 */
export const SENTENCE_LEVELS = ["not_yet", "year1", "year2", "year3", "year4_plus"] as const;
export type SentenceLevel = (typeof SENTENCE_LEVELS)[number];

export const SENTENCE_LEVEL_LABELS: Record<SentenceLevel, string> = {
  not_yet: "Keep practising",
  year1: "Year 1 level",
  year2: "Year 2 level",
  year3: "Year 3 level",
  year4_plus: "Year 4+ level",
};

/** Bonus reading points per sentence. Never affects word credit. Max 2 per sentence, 6 per quiz. */
export function sentencePoints(level: SentenceLevel, usedWordCorrectly: boolean): number {
  if (!usedWordCorrectly) return 0;
  return { not_yet: 0, year1: 0.5, year2: 1, year3: 1.5, year4_plus: 2 }[level];
}

/** Monday..Sunday range (inclusive) of the week containing `date`. */
export function weekRange(date: Date): { start: string; end: string } {
  const start = startOfWeek(date);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  return { start: toDay(start), end: toDay(end) };
}

export const formatWords = (n: number) => n.toLocaleString("en-GB");
