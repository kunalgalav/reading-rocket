"use client";

import Link from "next/link";
import { useState } from "react";
import type { BookRow } from "@/lib/db";
import { api } from "@/lib/client";
import { formatWords } from "@/lib/progress";
import { WordEditor } from "../books/word-editor";

const todayLocal = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

export default function AddBook() {
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [finishedOn, setFinishedOn] = useState(todayLocal);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [book, setBook] = useState<BookRow | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { book } = await api<{ book: BookRow }>("/api/books", {
        method: "POST",
        json: { title, author, finished_on: finishedOn },
      });
      setBook(book);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (book) {
    return (
      <div className="space-y-5">
        <div className="card text-center">
          <div className="text-6xl">📖</div>
          <h1 className="mt-2 text-3xl font-black">{book.title}</h1>
          {book.author && <p className="text-lg text-muted">by {book.author}</p>}
          <p className="mt-4 text-lg">That&apos;s about</p>
          <p className="text-5xl font-black text-sun-deep tabular-nums">{formatWords(book.words)}</p>
          <p className="text-lg">words! 🎉</p>
          {book.band_name && <p className="mt-3 font-bold text-leaf-deep">Level: {book.band_name}</p>}
        </div>

        <div className="card space-y-2">
          <p className="text-sm text-muted">
            <strong>For grown-ups:</strong> {book.word_notes}{" "}
            {book.word_confidence === "low" && "⚠️ Low confidence: please check the word count."}
          </p>
          <WordEditor book={book} onSaved={setBook} />
        </div>

        <div className="card bg-sky/10 text-center">
          <p className="text-lg font-bold">Now take the quiz to add these words to your total!</p>
          <p className="text-muted">Get 8 or more right for all the words, or 5 to 7 for half.</p>
          <Link href={`/quiz/${book.id}`} className="btn-secondary mt-4 w-full">
            📝 Start the quiz
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card space-y-4">
      <h1 className="text-3xl font-black">Which book did you finish? 📚</h1>
      <label className="block">
        <span className="text-lg font-bold">Book title</span>
        <input className="field mt-1" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} placeholder="e.g. The Twits" />
      </label>
      <label className="block">
        <span className="text-lg font-bold">Who wrote it? (if you know)</span>
        <input className="field mt-1" value={author} onChange={(e) => setAuthor(e.target.value)} maxLength={200} placeholder="e.g. Roald Dahl" />
      </label>
      <label className="block">
        <span className="text-lg font-bold">When did you finish it?</span>
        <input type="date" className="field mt-1" value={finishedOn} max={todayLocal()} onChange={(e) => setFinishedOn(e.target.value)} required />
      </label>
      {error && <p className="rounded-2xl bg-berry/10 p-3 font-bold text-berry">{error}</p>}
      <button className="btn-primary w-full" disabled={busy || !title.trim()}>
        {busy ? "Counting the words… 🔍" : "Add my book ➕"}
      </button>
    </form>
  );
}
