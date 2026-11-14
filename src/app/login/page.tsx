"use client";

import { useState } from "react";
import { api } from "@/lib/client";

export default function Login() {
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/login", { method: "POST", json: { passcode } });
      window.location.href = "/";
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card mx-auto max-w-sm space-y-4 text-center">
      <div className="text-6xl">🚀</div>
      <h1 className="text-2xl font-black">Enter the family passcode</h1>
      <input type="password" className="field text-center" value={passcode} onChange={(e) => setPasscode(e.target.value)} autoFocus />
      {error && <p className="font-bold text-berry">{error}</p>}
      <button className="btn-primary w-full" disabled={busy || !passcode}>
        Let&apos;s read!
      </button>
    </form>
  );
}
