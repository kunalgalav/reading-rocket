# 🚀 Reading Rocket

A reading tracker for a 7-year-old. He adds the books he finishes, takes a short quiz on each one, and watches his word count climb towards 1k / 10k / 100k / 500k / 1 million words. See `Claude.md` for the original brief.

## How it works

| Step | Model | What happens |
|---|---|---|
| Add a book | `claude-haiku-5-5` | Estimates the book's word count from its title and author. A grown-up can correct it (parent login required). |
| Reading level | `claude-sonnet-5-5` | A one-off **methodology** maps difficulty bands to the National Curriculum in England (KS1 to lower KS2) and sets points rules. Each book is then placed in a band: a similar level keeps the score flat, harder books raise it, and easier books never lower it. |
| Quiz | `claude-sonnet-5-5` | 10 questions (7 multiple choice, 3 free text), each with a 🔊 read-aloud button. Sonnet marks free-text answers generously. |
| Tricky words | `claude-sonnet-5-5` | Picks 3 ambitious words from each book, with child-friendly meanings and examples. |
| Sentences | `claude-sonnet-5-5` | Quiz questions 11–13: write a sentence with each tricky word. Sonnet levels each one against National Curriculum writing expectations (Year 1 to Year 4+). Bonus reading points: 0.5 / 1 / 1.5 / 2; never affects word credit. |
| Credit | none | **8+ correct** gives all the words, **5–7** gives half, **under 5** gives none. The same multiplier applies to the reading points. He gets one retry per book, and the best attempt counts. |

Words count towards the totals only after the quiz. Weeks start on Monday.

## Run locally

```bash
cp .env.example .env.local   # add ANTHROPIC_API_KEY
npm install
npm run dev                  # http://localhost:3000
```

Locally, data goes in an embedded Postgres (PGlite) under `./.data`. The passcode and PIN are optional locally.

```bash
npm test         # unit tests: totals, milestones, quiz credit
npm run lint && npm run typecheck && npm run build
```

## Deploy (Vercel, being retired)

The old copy at reading-rocket-five.vercel.app uses the same database. Its weekly schedule was removed on 2026-11-20 (AWS sends it now).

1. Push this repo to GitHub and import it in Vercel.
2. Add **Storage → Neon Postgres** to the project (this sets `DATABASE_URL`). Tables are created automatically.
3. Set `ANTHROPIC_API_KEY`, `FAMILY_PASSCODE` and `PARENT_PIN`. In production the site won't run without a passcode.
4. On the Grown-ups page, create the parent account (email + password, using `PARENT_PIN` once to prove it's you). Grown-up actions need this login.
5. Weekly emails: set `COMMS_API_KEY` (from the messaging service) and `CRON_SECRET` (see `.env.example`). Use "Send me this week's summary now" on the Grown-ups page to test.

Health check: `/api/health` shows which settings and the database are in place (no secret values).

## Deploy (AWS Amplify, reading.kunalgalav.com: the live site)

Same code, same Neon database. Every push to `master` deploys (Amplify app `reading-rocket`, us-east-1). `amplify.yml` builds it: the Amplify service role reads the JSON secret `reading-rocket/prod` (all the settings above plus `SITE_URL`) and `scripts/write-env.mjs` writes it to `.env.production`. An EventBridge rule calls `/api/cron/weekly` on Sundays at 18:00 UTC with the `CRON_SECRET` header (rule `reading-rocket-prod-weekly`). Server logs: CloudWatch `/aws/amplify/<app id>`.

## Notifications

Everything goes through the messaging service (`COMMS_API_KEY`): the weekly summary by email **and** Telegram, plus Telegram pings when a book is finished or a word milestone is reached (`src/lib/notify.ts`). Telegram is best-effort and never blocks the app; without `COMMS_API_KEY` (local dev) nothing is sent.

**What to read next:** after each marked quiz, `src/lib/suggestions.ts` asks Sonnet for 4 books (2 at his level, 1 stretch, 1 non-fiction/new genre) based on his recent bands and per-skill quiz results (KS1/KS2 reading content domains), plus 1–2 skills to work on and a tip for reading together. It runs after the quiz response (`after()`), is stored in `book_suggestions`, sent on Telegram, and shown in the weekly email (refreshed first if a newer quiz exists).

## Layout

- `src/lib/progress.ts`: pure logic (totals, milestones, credit rule), with tests in `progress.test.ts`
- `src/lib/agents.ts`: the Claude calls (structured JSON output via Zod)
- `src/lib/parent.ts`: parent account (scrypt-hashed password, session cookie)
- `src/lib/email.ts`: weekly summary, email template, sending via the messaging service (`src/lib/comms.ts`, downloaded client, don't edit)
- `src/lib/service.ts`: book, quiz and methodology flows on top of the database
- `src/lib/db.ts`: SQL layer (Neon in production, PGlite locally) and the schema
- `src/app/api/*`: route handlers; `src/middleware.ts`: passcode gate
