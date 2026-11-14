"use client";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="card space-y-4 text-center">
      <div className="text-6xl">🛠️</div>
      <h1 className="text-2xl font-black">Oops, the rocket hit a bump</h1>
      <p className="text-lg">Please try again. If it keeps happening, ask a grown-up to check the app&apos;s setup.</p>
      <p className="text-sm text-muted">
        Grown-ups: open <code>/api/health</code> on this site to see what&apos;s missing.
        {error.digest && <> Error code: {error.digest}</>}
      </p>
      <button className="btn-primary" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
