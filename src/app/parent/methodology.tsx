"use client";

import { useEffect, useState } from "react";
import type { Rubric } from "@/lib/agents";
import { api } from "@/lib/client";

export function Methodology({ canEdit }: { canEdit: boolean }) {
  const [rubric, setRubric] = useState<Rubric | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    api<{ rubric: Rubric | null }>("/api/methodology")
      .then((r) => setRubric(r.rubric))
      .catch((e) => setMessage(e.message));
  }, []);

  async function regenerate() {
    if (rubric && !confirming) {
      setConfirming(true); // ask for a second click instead of a browser dialog
      setTimeout(() => setConfirming(false), 4000);
      return;
    }
    setConfirming(false);
    setBusy(true);
    setMessage("");
    try {
      const r = await api<{ rubric: Rubric }>("/api/methodology", { method: "POST" });
      setRubric(r.rubric);
      setMessage("New methodology saved. It applies to books added from now on.");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="mr-auto text-xl font-black">Reading-level methodology</h2>
        {canEdit && (
          <button className="btn-ghost min-h-11 text-base" onClick={regenerate} disabled={busy}>
            {busy ? "Generating… (up to a minute)" : confirming ? "Click again to confirm" : rubric ? "Regenerate" : "Generate now"}
          </button>
        )}
      </div>
      {message && <p className="font-bold text-sky">{message}</p>}
      {!rubric ? (
        <p className="text-muted">Not generated yet. It is created automatically when the first book is added.</p>
      ) : (
        <div className="space-y-4">
          <p>{rubric.summary}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-muted">
                <tr>
                  <th className="py-1 pr-2">Band</th>
                  <th className="py-1 pr-2">Years</th>
                  <th className="py-1">Examples</th>
                </tr>
              </thead>
              <tbody>
                {[...rubric.bands]
                  .sort((a, b) => a.order - b.order)
                  .map((b) => (
                    <tr key={b.id} className="border-t border-line align-top">
                      <td className="py-2 pr-2">
                        <strong>{b.name}</strong>
                        <div className="text-muted">{b.curriculum_link}</div>
                      </td>
                      <td className="whitespace-nowrap py-2 pr-2">{b.year_groups}</td>
                      <td className="py-2">{b.example_books.join(", ")}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <div>
            <h3 className="font-black">Points per book</h3>
            <ul className="list-disc pl-5 text-sm">
              <li>Same level: {rubric.scoring_rules.same_band}</li>
              <li>One level up: {rubric.scoring_rules.one_band_up}</li>
              <li>Two or more levels up: {rubric.scoring_rules.two_or_more_bands_up}</li>
              <li>Easier book: {rubric.scoring_rules.lower_band}</li>
              <li>New genre bonus: {rubric.scoring_rules.breadth_bonus}</li>
            </ul>
            <p className="mt-2 text-sm text-muted">
              Book points are multiplied by the quiz result: ×1 for 8+, ×0.5 for 5–7, ×0 below 5. Each tricky-word
              sentence adds up to 2 bonus points (Year 1 level 0.5, Year 2 1, Year 3 1.5, Year 4+ 2).
            </p>
          </div>
          {rubric.notes.length > 0 && (
            <ul className="list-disc pl-5 text-sm text-muted">
              {rubric.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
