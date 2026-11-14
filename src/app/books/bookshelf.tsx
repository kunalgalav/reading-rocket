"use client";

import Link from "next/link";
import { useState } from "react";
import type { BookRow } from "@/lib/db";
import { formatWords } from "@/lib/progress";
import { WordEditor } from "./word-editor";

export function Bookshelf({ initial }: { initial: BookRow[] }) {
  const [books, setBooks] = useState(initial);

  if (!books.length) {
    return (
      <div className="card text-center">
        <p className="text-lg">No books yet. Add your first one!</p>
        <Link href="/add" className="btn-primary mt-4">
          ➕ Add a book
        </Link>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {books.map((book) => (
        <li key={book.id} className="card space-y-2">
          <div className="flex flex-wrap items-start gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-black">{book.title}</h2>
              <p className="text-muted">
                {book.author ? `by ${book.author} · ` : ""}
                finished {new Date(book.finished_on + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
              </p>
              {book.band_name && <p className="text-sm font-bold text-leaf-deep">Level: {book.band_name}</p>}
            </div>
            <div className="text-right">
              {book.credited_words === null ? (
                <Link href={`/quiz/${book.id}`} className="btn-secondary min-h-11 text-base">
                  📝 Take quiz
                </Link>
              ) : (
                <>
                  <p className="text-2xl font-black tabular-nums">{formatWords(book.credited_words)}</p>
                  <p className="text-sm text-muted">
                    of {formatWords(book.words)} words
                    {book.credited_words < book.words && (
                      <>
                        {" · "}
                        <Link href={`/quiz/${book.id}`} className="font-bold text-sky underline">
                          try again
                        </Link>
                      </>
                    )}
                  </p>
                </>
              )}
            </div>
          </div>
          <WordEditor book={book} onSaved={(b) => setBooks((all) => all.map((x) => (x.id === b.id ? b : x)))} />
        </li>
      ))}
    </ul>
  );
}
