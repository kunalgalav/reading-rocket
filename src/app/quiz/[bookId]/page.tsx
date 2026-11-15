"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import type { BookRow } from "@/lib/db";
import type { PublicQuestion } from "@/lib/service";
import { api, speak } from "@/lib/client";
import { formatWords, SENTENCE_LEVEL_LABELS, type SentenceLevel } from "@/lib/progress";

interface QuizStart {
  book: BookRow;
  attemptId: number;
  attempt: number;
  questions: PublicQuestion[];
}
interface QuizResult {
  correct: number;
  total: number;
  multiplier: number;
  vocabPoints: number;
  results: {
    id: number;
    kind: "multiple_choice" | "free_text" | "sentence";
    correct: boolean;
    feedback: string;
    word?: string;
    sentence?: string;
    level?: SentenceLevel;
    used_word_correctly?: boolean;
    points?: number;
  }[];
  book: BookRow;
  canRetry: boolean;
}
type Answer = number | string | null;

export default function QuizPage({ params }: { params: Promise<{ bookId: string }> }) {
  const bookId = Number(use(params).bookId);
  const [quiz, setQuiz] = useState<QuizStart | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [index, setIndex] = useState(0);
  const [result, setResult] = useState<QuizResult | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "marking" | "error">("loading");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setStatus("loading");
    setResult(null);
    setIndex(0);
    try {
      const q = await api<QuizStart>("/api/quiz", { method: "POST", json: { bookId } });
      setQuiz(q);
      setAnswers(q.questions.map(() => null));
      setStatus("ready");
    } catch (err) {
      setError((err as Error).message);
      setStatus("error");
    }
  }, [bookId]);

  useEffect(() => {
    load();
  }, [load]);

  async function submit() {
    if (!quiz) return;
    setStatus("marking");
    try {
      setResult(await api<QuizResult>("/api/quiz/submit", { method: "POST", json: { attemptId: quiz.attemptId, answers } }));
      setStatus("ready");
    } catch (err) {
      setError((err as Error).message);
      setStatus("error");
    }
  }

  if (status === "loading") return <Centered emoji="✍️" text="Making your quiz… this takes a few seconds." pulse />;
  if (status === "marking") return <Centered emoji="🧐" text="Checking your answers…" pulse />;
  if (status === "error" || !quiz) {
    return (
      <div className="card space-y-4 text-center">
        <div className="text-5xl">🙈</div>
        <p className="text-lg font-bold">{error || "Something went wrong."}</p>
        <Link href="/books" className="btn-ghost">
          Back to my books
        </Link>
      </div>
    );
  }

  if (result) return <Results quiz={quiz} result={result} onRetry={load} />;

  const q = quiz.questions[index];
  const answer = answers[index];
  const answered = q.kind === "multiple_choice" ? answer !== null : typeof answer === "string" && answer.trim().length > 0;
  const isSentence = q.kind === "sentence";
  const setAnswer = (value: Answer) => setAnswers((all) => all.map((a, i) => (i === index ? value : a)));
  const isLast = index === quiz.questions.length - 1;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-muted">
        <p className="font-bold">
          {quiz.book.title} {quiz.attempt > 1 && "· second try"}
        </p>
        <p className="font-black">
          {index + 1} / {quiz.questions.length}
        </p>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-line">
        <div className="h-full bg-leaf transition-all" style={{ width: `${((index + 1) / quiz.questions.length) * 100}%` }} />
      </div>

      <div className="card space-y-5">
        <div className="flex items-start gap-3">
          <h1 className="flex-1 text-2xl font-black leading-snug">{q.question}</h1>
          <button
            type="button"
            aria-label="Read the question aloud"
            className="btn-ghost min-h-12 shrink-0 px-4"
            onClick={() =>
              speak(
                isSentence
                  ? `${q.question} ${q.word} means ${q.meaning}.`
                  : [q.question, ...q.options.map((o, i) => `${String.fromCharCode(65 + i)}: ${o}`)].join(". "),
              )
            }
          >
            🔊
          </button>
        </div>

        {q.kind === "multiple_choice" ? (
          <div className="grid gap-3">
            {q.options.map((option, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setAnswer(i)}
                className={`btn justify-start border-2 text-left ${answer === i ? "border-sun bg-sun/20" : "border-line bg-card hover:border-sun/60"}`}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-paper font-black">
                  {String.fromCharCode(65 + i)}
                </span>
                {option}
              </button>
            ))}
          </div>
        ) : (
          <label className="block">
            {isSentence && (
              <span className="mb-3 block rounded-2xl bg-sun/15 p-4">
                <span className="block text-3xl font-black text-sun-deep">{q.word}</span>
                <span className="block text-lg">means: {q.meaning}</span>
              </span>
            )}
            <span className="text-muted">
              {isSentence
                ? "Try to use capital letters, full stops and joining words like because, when or but. Spelling doesn't matter!"
                : "Write your answer. Spelling doesn't matter! A grown-up can help you type."}
            </span>
            <textarea
              className="field mt-2 min-h-32"
              value={typeof answer === "string" ? answer : ""}
              onChange={(e) => setAnswer(e.target.value)}
              maxLength={1000}
            />
          </label>
        )}
      </div>

      <div className="flex gap-3">
        <button type="button" className="btn-ghost" disabled={index === 0} onClick={() => setIndex(index - 1)}>
          ⬅️
        </button>
        {isLast ? (
          <button
            type="button"
            className="btn-primary flex-1"
            disabled={answers.some((a) => a === null || (typeof a === "string" && !a.trim()))}
            onClick={submit}
          >
            ✅ Finish the quiz
          </button>
        ) : (
          <button type="button" className="btn-secondary flex-1" disabled={!answered} onClick={() => setIndex(index + 1)}>
            Next ➡️
          </button>
        )}
      </div>
    </div>
  );
}

function Results({ quiz, result, onRetry }: { quiz: QuizStart; result: QuizResult; onRetry: () => void }) {
  const credited = result.book.credited_words ?? 0;
  const sentenceResults = result.results.filter((r) => r.kind === "sentence");
  const mood = result.multiplier === 1 ? "🏆" : result.multiplier > 0 ? "👍" : "💪";
  const message =
    result.multiplier === 1
      ? "Amazing! You get ALL the words!"
      : result.multiplier > 0
        ? "Good job! You get half the words."
        : "Nice try! Have another read and try again.";

  return (
    <div className="space-y-4">
      <div className="card text-center">
        <div className="text-7xl">{mood}</div>
        <p className="mt-2 text-5xl font-black tabular-nums">
          {result.correct} / {result.total}
        </p>
        <p className="mt-2 text-xl font-bold">{message}</p>
        <p className="mt-3 text-lg">
          Words added for <strong>{quiz.book.title}</strong>:{" "}
          <span className="font-black text-sun-deep">{formatWords(credited)}</span>
        </p>
      </div>

      {sentenceResults.length > 0 && (
        <div className="card space-y-3 bg-gradient-to-br from-leaf/15 to-card">
          <h2 className="text-xl font-black">✏️ Your sentences: +{result.vocabPoints} reading points</h2>
          {sentenceResults.map((r) => (
            <div key={r.id} className="rounded-2xl bg-card p-3">
              <p className="text-lg">
                <strong className="text-sun-deep">{r.word}</strong>: “{r.sentence}”
              </p>
              <p className="font-bold text-leaf-deep">
                {r.used_word_correctly ? SENTENCE_LEVEL_LABELS[r.level ?? "not_yet"] : "Not quite the right meaning yet"} · +{r.points ?? 0}
              </p>
              <p className="text-muted">{r.feedback}</p>
            </div>
          ))}
        </div>
      )}

      <ol className="space-y-2">
        {quiz.questions.filter((q) => q.kind !== "sentence").map((q) => {
          const r = result.results.find((x) => x.id === q.id)!;
          return (
            <li key={q.id} className={`card p-4 ${r.correct ? "border-leaf/50" : "border-berry/40"}`}>
              <p className="font-bold">
                {r.correct ? "✅" : "❌"} {q.question}
              </p>
              <p className="text-muted">{r.feedback}</p>
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap gap-3">
        {result.canRetry && (
          <button type="button" className="btn-secondary flex-1" onClick={onRetry}>
            🔁 Try a new quiz
          </button>
        )}
        {/* Plain link so Home reloads with fresh totals */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/" className="btn-primary flex-1">
          🏠 See my total
        </a>
      </div>
    </div>
  );
}

function Centered({ emoji, text, pulse }: { emoji: string; text: string; pulse?: boolean }) {
  return (
    <div className="card py-12 text-center">
      <div className={`text-6xl ${pulse ? "animate-bounce" : ""}`}>{emoji}</div>
      <p className="mt-4 text-xl font-bold">{text}</p>
    </div>
  );
}
