"use client";

import { useEffect, useState } from "react";
import type { Rubric } from "@/lib/agents";
import { api, getParentPin, setParentPin } from "@/lib/client";

export default function ParentPage() {
  const [pin, setPin] = useState("");
  const [saved, setSaved] = useState(false);
  const [rubric, setRubric] = useState<Rubric | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    setSaved(Boolean(getParentPin()));
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
      const r = await api<{ rubric: Rubric }>("/api/methodology", { method: "POST", parent: true });
      setRubric(r.rubric);
      setMessage("New methodology saved. It applies to books added from now on.");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-black">Grown-ups 🔒</h1>

      <section className="card space-y-3">
        <h2 className="text-xl font-black">Parent PIN</h2>
        <p className="text-muted">Needed to correct word counts or regenerate the methodology. Remembered until this tab closes.</p>
        {saved ? (
          <button
            className="btn-ghost"
            onClick={() => {
              setParentPin("");
              setSaved(false);
            }}
          >
            🔓 Forget PIN on this device
          </button>
        ) : (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setParentPin(pin);
              setSaved(true);
              setPin("");
            }}
          >
            <input type="password" inputMode="numeric" className="field" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="PIN" />
            <button className="btn-primary">Save</button>
          </form>
        )}
      </section>

      <section className="card space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="mr-auto text-xl font-black">Reading-level methodology</h2>
          <button className="btn-ghost min-h-11 text-base" onClick={regenerate} disabled={busy || !saved}>
            {busy ? "Generating… (up to a minute)" : confirming ? "Click again to confirm" : rubric ? "Regenerate" : "Generate now"}
          </button>
        </div>
        {message && <p className="font-bold text-sky">{message}</p>}
        {!rubric ? (
          <p className="text-muted">Not generated yet. It is created automatically when the first book is added.</p>
        ) : (
          <div className="space-y-4">
            <p>{rubric.summary}</p>
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
                      <td className="py-2 pr-2 whitespace-nowrap">{b.year_groups}</td>
                      <td className="py-2">{b.example_books.join(", ")}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
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
                Points are multiplied by the quiz result: ×1 for 8+, ×0.5 for 5–7, ×0 below 5.
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
    </div>
  );
}
