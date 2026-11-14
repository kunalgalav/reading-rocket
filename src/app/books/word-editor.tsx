"use client";

import { useState } from "react";
import type { BookRow } from "@/lib/db";
import { api, getParentPin } from "@/lib/client";

/** Parent-only control to correct the estimated word count. Needs the PIN entered on the Grown-ups page. */
export function WordEditor({ book, onSaved }: { book: BookRow; onSaved: (b: BookRow) => void }) {
  const [open, setOpen] = useState(false);
  const [words, setWords] = useState(String(book.words));
  const [error, setError] = useState("");

  if (!open) {
    return (
      <button type="button" className="text-sm font-bold text-muted underline" onClick={() => setOpen(true)}>
        ✏️ Grown-up: change word count
      </button>
    );
  }

  async function save() {
    setError("");
    if (!getParentPin()) return setError("Enter the parent PIN on the Grown-ups page first.");
    try {
      const { book: saved } = await api<{ book: BookRow }>(`/api/books/${book.id}`, {
        method: "PATCH",
        parent: true,
        json: { words: Number(words) },
      });
      onSaved(saved);
      setOpen(false);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input type="number" min={0} className="field w-40 py-2" value={words} onChange={(e) => setWords(e.target.value)} />
      <button type="button" className="btn-ghost min-h-11 text-base" onClick={save}>
        Save
      </button>
      <button type="button" className="text-sm text-muted underline" onClick={() => setOpen(false)}>
        Cancel
      </button>
      {error && <p className="w-full text-sm font-bold text-berry">{error}</p>}
    </div>
  );
}
