import "server-only";
import { CommsError, createComms } from "./comms";
import { notifyTelegram } from "./notify";
import { getDb, type BookRow } from "./db";
import { getParent } from "./parent";
import { formatWords, milestoneProgress, parseDay, SENTENCE_LEVEL_LABELS, summarize, weekRange, type SentenceLevel } from "./progress";

export class EmailError extends Error {}

interface SentenceResult {
  kind: "sentence";
  word: string;
  sentence: string;
  level: SentenceLevel;
  used_word_correctly: boolean;
  points: number;
}

interface WeeklySummary {
  range: { start: string; end: string };
  booksThisWeek: (BookRow & { bestScore: number | null })[];
  weekWords: number;
  yearWords: number;
  pointsThisWeek: number;
  totalPoints: number;
  nextMilestone: number | null;
  sentences: SentenceResult[];
  awaitingQuiz: number;
}

export async function buildWeeklySummary(today = new Date()): Promise<WeeklySummary> {
  const db = await getDb();
  const range = weekRange(today);
  const books = await db.query<BookRow>("SELECT * FROM books ORDER BY finished_on, id");
  const totals = summarize(books, today);
  const inWeek = books.filter((b) => b.finished_on >= range.start && b.finished_on <= range.end);

  const attempts = await db.query<{ book_id: number; correct: number | null; results: unknown }>(
    "SELECT book_id, correct, results FROM quiz_attempts WHERE correct IS NOT NULL AND book_id = ANY($1::int[]) ORDER BY attempt",
    [inWeek.map((b) => b.id)],
  );
  const bestScore = new Map<number, number>();
  const sentences: SentenceResult[] = [];
  for (const a of attempts) {
    bestScore.set(a.book_id, Math.max(bestScore.get(a.book_id) ?? 0, Number(a.correct)));
    for (const r of (a.results as { kind?: string }[] | null) ?? []) if (r.kind === "sentence") sentences.push(r as SentenceResult);
  }

  const points = (b: BookRow) => (b.score_awarded ?? 0) + (b.vocab_points ?? 0);
  return {
    range,
    booksThisWeek: inWeek.map((b) => ({ ...b, bestScore: bestScore.get(b.id) ?? null })),
    weekWords: totals.week,
    yearWords: totals.year,
    pointsThisWeek: Math.round(inWeek.reduce((s, b) => s + points(b), 0) * 10) / 10,
    totalPoints: Math.round(books.reduce((s, b) => s + points(b), 0) * 10) / 10,
    nextMilestone: milestoneProgress(totals.year).next,
    sentences,
    awaitingQuiz: inWeek.filter((b) => b.credited_words === null).length,
  };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const fmtDay = (d: string) => parseDay(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

export function renderWeeklyEmail(s: WeeklySummary, siteUrl: string): { subject: string; html: string; text: string } {
  const period = `${fmtDay(s.range.start)} – ${fmtDay(s.range.end)}`;
  const subject = s.booksThisWeek.length
    ? `Reading Rocket: ${formatWords(s.weekWords)} words this week 🚀`
    : "Reading Rocket: a quiet reading week";

  const bookRows = s.booksThisWeek
    .map(
      (b) => `<tr>
        <td style="padding:8px 0;border-top:1px solid #f0e2cc"><strong>${esc(b.title)}</strong>${b.author ? `<br><span style="color:#7a6a5a">${esc(b.author)}</span>` : ""}${b.band_name ? `<br><span style="color:#16897f;font-size:13px">${esc(b.band_name)}</span>` : ""}</td>
        <td style="padding:8px 0;border-top:1px solid #f0e2cc;text-align:right;white-space:nowrap">${
          b.credited_words === null
            ? "<em>quiz to do</em>"
            : `${formatWords(b.credited_words)} words<br><span style="color:#7a6a5a;font-size:13px">quiz ${b.bestScore ?? "–"}/10</span>`
        }</td></tr>`,
    )
    .join("");

  const sentenceRows = s.sentences
    .map(
      (r) =>
        `<li style="margin-bottom:8px"><strong>${esc(r.word)}</strong>: “${esc(r.sentence || "(no sentence)")}”<br><span style="color:#16897f;font-size:13px">${
          r.used_word_correctly ? SENTENCE_LEVEL_LABELS[r.level] : "Word not used correctly yet"
        } · +${r.points} pts</span></li>`,
    )
    .join("");

  const html = `<!doctype html><html><body style="margin:0;background:#fff8ec;font-family:Arial,Helvetica,sans-serif;color:#2b2118">
  <div style="max-width:560px;margin:0 auto;padding:24px">
    <h1 style="margin:0 0 4px;font-size:24px">🚀 Weekly reading summary</h1>
    <p style="margin:0 0 20px;color:#7a6a5a">${period}</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff;border:2px solid #f0e2cc;border-radius:16px;padding:16px;margin-bottom:16px"><tr>
      <td style="text-align:center"><div style="font-size:28px;font-weight:bold">${formatWords(s.weekWords)}</div><div style="color:#7a6a5a;font-size:13px">words this week</div></td>
      <td style="text-align:center"><div style="font-size:28px;font-weight:bold">${s.booksThisWeek.length}</div><div style="color:#7a6a5a;font-size:13px">${s.booksThisWeek.length === 1 ? "book" : "books"}</div></td>
      <td style="text-align:center"><div style="font-size:28px;font-weight:bold">+${s.pointsThisWeek}</div><div style="color:#7a6a5a;font-size:13px">reading points</div></td>
    </tr></table>
    <div style="background:#fff;border:2px solid #f0e2cc;border-radius:16px;padding:16px;margin-bottom:16px">
      <h2 style="margin:0 0 8px;font-size:18px">📚 Books finished</h2>
      ${s.booksThisWeek.length ? `<table width="100%" cellpadding="0" cellspacing="0">${bookRows}</table>` : `<p style="margin:0;color:#7a6a5a">No books this week. Maybe pick one together for next week?</p>`}
      ${s.awaitingQuiz ? `<p style="margin:12px 0 0;color:#e07b00">${s.awaitingQuiz} book${s.awaitingQuiz > 1 ? "s are" : " is"} waiting for a quiz: the words count once it's done.</p>` : ""}
    </div>
    ${s.sentences.length ? `<div style="background:#fff;border:2px solid #f0e2cc;border-radius:16px;padding:16px;margin-bottom:16px"><h2 style="margin:0 0 8px;font-size:18px">✏️ New words he used</h2><ul style="margin:0;padding-left:18px">${sentenceRows}</ul></div>` : ""}
    <div style="background:#fff;border:2px solid #f0e2cc;border-radius:16px;padding:16px;margin-bottom:16px">
      <h2 style="margin:0 0 8px;font-size:18px">🏆 This year so far</h2>
      <p style="margin:0">${formatWords(s.yearWords)} words · ${s.totalPoints} reading points${s.nextMilestone ? `<br><span style="color:#7a6a5a">${formatWords(s.nextMilestone - s.yearWords)} words to the ${formatWords(s.nextMilestone)} milestone</span>` : ""}</p>
    </div>
    <p style="text-align:center"><a href="${esc(siteUrl)}" style="display:inline-block;background:#ff9f1c;color:#fff;text-decoration:none;font-weight:bold;padding:12px 24px;border-radius:12px">Open Reading Rocket</a></p>
    <p style="text-align:center;color:#7a6a5a;font-size:12px">You can turn these emails off on the Grown-ups page.</p>
  </div></body></html>`;

  const text = [
    `Weekly reading summary (${period})`,
    `${formatWords(s.weekWords)} words, ${s.booksThisWeek.length} books, +${s.pointsThisWeek} reading points this week.`,
    ...s.booksThisWeek.map((b) => `- ${b.title}: ${b.credited_words === null ? "quiz to do" : `${formatWords(b.credited_words)} words`}`),
    ...s.sentences.map((r) => `- ${r.word}: "${r.sentence}" (${SENTENCE_LEVEL_LABELS[r.level]})`),
    `This year: ${formatWords(s.yearWords)} words, ${s.totalPoints} points.`,
    siteUrl,
  ].join("\n");

  return { subject, html, text };
}

export function siteUrl(): string {
  const host = process.env.SITE_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : null);
  return host ?? "http://localhost:3000";
}

/** Build and send the weekly email to the parent. `force` skips the once-per-week guard (test sends). */
export async function sendWeeklyEmail({ force = false, today = new Date() } = {}) {
  const apiKey = process.env.COMMS_API_KEY;
  if (!apiKey) throw new EmailError("COMMS_API_KEY isn't set, so emails can't be sent yet.");
  const parent = await getParent();
  if (!parent) throw new EmailError("No parent account yet. Sign up on the Grown-ups page.");
  if (!force && !parent.weekly_email) return { skipped: "Weekly emails are turned off." };

  const summary = await buildWeeklySummary(today);
  const db = await getDb();
  if (!force) {
    const [already] = await db.query("SELECT 1 FROM email_log WHERE week_start = $1", [summary.range.start]);
    if (already) return { skipped: "Already sent this week." };
  }

  const { subject, html, text } = renderWeeklyEmail(summary, siteUrl());
  let message;
  try {
    message = await createComms({ apiKey }).send({
      channel: "email",
      to: parent.email,
      subject: force ? `[Test] ${subject}` : subject,
      body: text,
      html,
      metadata: { app: "reading-rocket", kind: "weekly-summary", week_start: summary.range.start },
      // Test sends are unique per click; real weekly sends are deduplicated per week.
      idempotency_key: force ? `weekly-test-${Date.now()}` : `weekly-${summary.range.start}`,
    });
  } catch (err) {
    const reason = err instanceof CommsError ? err.message : String(err);
    throw new EmailError(`The messaging service couldn't send the email: ${reason}`);
  }
  // Telegram copy of the summary: best-effort, the email still counts if it fails.
  const telegram = await notifyTelegram(
    `${force ? "[Test] " : ""}📖 ${subject}\n\n${text}`,
    force ? `weekly-tg-test-${Date.now()}` : `weekly-tg-${summary.range.start}`,
    { kind: "weekly-summary", week_start: summary.range.start },
  );
  if (!force) {
    await db.query("INSERT INTO email_log (week_start, email_id) VALUES ($1, $2) ON CONFLICT (week_start) DO NOTHING", [
      summary.range.start,
      message.id,
    ]);
  }
  return { sent: true, to: parent.email, id: message.id, telegram };
}
