"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Methodology } from "./methodology";

interface Status {
  exists: boolean;
  loggedIn: boolean;
  parent: { email: string; weekly_email: boolean } | null;
  emailConfigured: boolean;
}

export default function ParentPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState("");

  const refresh = useCallback(() => {
    api<Status>("/api/parent")
      .then(setStatus)
      .catch((e) => setError(e.message));
  }, []);
  useEffect(refresh, [refresh]);

  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-black">Grown-ups 🔒</h1>
      {error && <p className="card font-bold text-berry">{error}</p>}
      {!status ? (
        <p className="text-muted">Loading…</p>
      ) : !status.exists ? (
        <SignUp onDone={refresh} />
      ) : !status.loggedIn ? (
        <LogIn onDone={refresh} />
      ) : (
        <Account status={status} onChange={refresh} />
      )}
      <Methodology canEdit={Boolean(status?.loggedIn)} />
    </div>
  );
}

function useSubmit(action: () => Promise<unknown>, onDone: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    setError("");
    try {
      await action();
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, submit };
}

function SignUp({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [setupPin, setSetupPin] = useState("");
  const { busy, error, submit } = useSubmit(
    () => api("/api/parent/signup", { method: "POST", json: { email, password, setupPin } }),
    onDone,
  );
  return (
    <form onSubmit={submit} className="card space-y-3">
      <h2 className="text-xl font-black">Create the parent account</h2>
      <p className="text-muted">
        One-time setup. Your email is used for the weekly progress summary and to log in here. To prove it&apos;s you, enter
        the current parent PIN (the <code>PARENT_PIN</code> setting in Vercel).
      </p>
      <input type="email" className="field" placeholder="Your email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
      <input type="password" className="field" placeholder="Choose a password (8+ characters)" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required autoComplete="new-password" />
      <input type="password" inputMode="numeric" className="field" placeholder="Parent PIN" value={setupPin} onChange={(e) => setSetupPin(e.target.value)} autoComplete="off" />
      {error && <p className="font-bold text-berry">{error}</p>}
      <button className="btn-primary w-full" disabled={busy}>
        {busy ? "Creating…" : "Create account"}
      </button>
    </form>
  );
}

function LogIn({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { busy, error, submit } = useSubmit(() => api("/api/parent/login", { method: "POST", json: { email, password } }), onDone);
  return (
    <form onSubmit={submit} className="card space-y-3">
      <h2 className="text-xl font-black">Parent log in</h2>
      <input type="email" className="field" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
      <input type="password" className="field" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
      {error && <p className="font-bold text-berry">{error}</p>}
      <button className="btn-primary w-full" disabled={busy}>
        {busy ? "Logging in…" : "Log in"}
      </button>
    </form>
  );
}

function Account({ status, onChange }: { status: Status; onChange: () => void }) {
  const parent = status.parent!;
  const [email, setEmail] = useState(parent.email);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<"" | "email" | "toggle" | "test" | "logout">("");

  async function run(kind: typeof busy, action: () => Promise<string | void>) {
    setBusy(kind);
    setMessage("");
    try {
      const msg = await action();
      if (msg) setMessage(msg);
      onChange();
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="card space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-xl font-black">Your account</h2>
        <button
          className="text-sm font-bold text-muted underline"
          disabled={busy !== ""}
          onClick={() => run("logout", async () => void (await api("/api/parent/logout", { method: "POST" })))}
        >
          Log out
        </button>
      </div>
      <p className="text-muted">You&apos;re logged in, so you can correct word counts on the bookshelf and regenerate the methodology.</p>

      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          run("email", async () => {
            await api("/api/parent", { method: "PATCH", json: { email } });
            return "Email updated.";
          });
        }}
      >
        <input type="email" className="field min-w-0 flex-1" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <button className="btn-ghost min-h-12 text-base" disabled={busy !== "" || email === parent.email}>
          Save email
        </button>
      </form>

      <label className="flex items-center gap-3 text-lg font-bold">
        <input
          type="checkbox"
          className="h-6 w-6 accent-[var(--sun)]"
          checked={parent.weekly_email}
          disabled={busy !== ""}
          onChange={(e) => run("toggle", async () => void (await api("/api/parent", { method: "PATCH", json: { weekly_email: e.target.checked } })))}
        />
        Weekly progress email (Sundays, 6pm)
      </label>

      {!status.emailConfigured && (
        <p className="rounded-2xl bg-sun/15 p-3 text-sm">
          ⚠️ Emails can&apos;t be sent yet: add <code>COMMS_API_KEY</code> in Vercel → Settings → Environment Variables, then redeploy.
        </p>
      )}

      <button
        className="btn-secondary w-full"
        disabled={busy !== "" || !status.emailConfigured}
        onClick={() =>
          run("test", async () => {
            const r = await api<{ to: string }>("/api/parent/test-email", { method: "POST" });
            return `Test email sent to ${r.to}. Check your inbox (and spam folder).`;
          })
        }
      >
        {busy === "test" ? "Sending…" : "📧 Send me this week's summary now"}
      </button>

      <a href="/api/parent/email-preview" target="_blank" rel="noreferrer" className="block text-center font-bold text-sky underline">
        👀 Preview this week&apos;s email
      </a>

      {message && <p className="font-bold text-sky">{message}</p>}
    </section>
  );
}
