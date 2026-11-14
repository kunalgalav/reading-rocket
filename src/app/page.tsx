import Link from "next/link";
import { getStats } from "@/lib/service";
import { formatWords, MILESTONES } from "@/lib/progress";

export const dynamic = "force-dynamic";

const milestoneLabel = (m: number) => (m >= 1_000_000 ? "1 million" : m >= 1000 ? `${m / 1000}k` : String(m));
const milestoneIcon = ["⭐", "🌟", "🏅", "🏆", "👑"];

export default async function Home() {
  const stats = await getStats();
  const { totals, milestones } = stats;
  const percent = Math.round(milestones.fraction * 100);

  return (
    <div className="space-y-6">
      <section className="card bg-gradient-to-br from-sun/15 to-card">
        <p className="text-lg font-bold text-muted">Words read this year</p>
        <p className="text-6xl font-black tabular-nums">{formatWords(totals.year)}</p>
        {milestones.next ? (
          <>
            <div className="mt-4 h-6 overflow-hidden rounded-full bg-line" aria-label={`${percent}% of the way`}>
              <div className="h-full rounded-full bg-sun transition-all" style={{ width: `${Math.max(percent, 3)}%` }} />
            </div>
            <p className="mt-2 text-lg font-bold">
              {formatWords(milestones.next - totals.year)} more words to reach{" "}
              <span className="text-sun-deep">{milestoneLabel(milestones.next)}</span>! 🚀
            </p>
          </>
        ) : (
          <p className="mt-3 text-2xl font-black text-sun-deep">You reached ONE MILLION words! 👑🎉</p>
        )}
      </section>

      <section className="grid grid-cols-3 gap-3">
        {[
          { label: "This week", value: totals.week },
          { label: "This month", value: totals.month },
          { label: "Books this year", value: totals.booksThisYear, plain: true },
        ].map((s) => (
          <div key={s.label} className="card p-4 text-center">
            <p className="text-sm font-bold text-muted">{s.label}</p>
            <p className="text-2xl font-black tabular-nums sm:text-3xl">{s.plain ? s.value : formatWords(s.value)}</p>
          </div>
        ))}
      </section>

      <section className="card">
        <h2 className="mb-3 text-xl font-black">Milestones</h2>
        <ol className="grid grid-cols-5 gap-2 text-center">
          {MILESTONES.map((m, i) => {
            const done = totals.year >= m;
            return (
              <li key={m} className={`rounded-2xl p-2 ${done ? "bg-sun/20" : "bg-paper opacity-60"}`}>
                <div className={`text-3xl ${done ? "" : "grayscale"}`}>{milestoneIcon[i]}</div>
                <div className="text-sm font-extrabold">{milestoneLabel(m)}</div>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="card flex items-center gap-4 bg-gradient-to-br from-leaf/15 to-card">
        <div className="text-5xl">🧠</div>
        <div>
          <p className="text-lg font-bold text-muted">Reading points</p>
          <p className="text-4xl font-black tabular-nums">{stats.readingScore}</p>
          {stats.currentBand && <p className="font-bold text-leaf-deep">Reading level: {stats.currentBand}</p>}
        </div>
      </section>

      {totals.awaitingQuiz > 0 && (
        <p className="card border-sky bg-sky/10 text-lg font-bold">
          📝 {totals.awaitingQuiz} book{totals.awaitingQuiz > 1 ? "s are" : " is"} waiting for a quiz. Finish the quiz to
          add the words!
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <Link href="/add" className="btn-primary flex-1">
          ➕ I finished a book!
        </Link>
        <Link href="/books" className="btn-ghost flex-1">
          📚 My bookshelf
        </Link>
      </div>
    </div>
  );
}
