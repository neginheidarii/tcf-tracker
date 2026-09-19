# TCF Canada Study Tracker

A study tracker for the TCF Canada exam. React and TypeScript on the front, Postgres behind an account, so your phone and your laptop look at one record and changes cross between them in about a second.

It still works with no connection. Reads come from a copy on the device and writes queue up until there's a network, which is the point of using it on a train.

## Getting it running

You need Node 20 or newer, and Docker if you want the database on your own machine.

```bash
npm install
cp .env.example .env.local     # then fill in the two values
npm run db:start               # local Postgres, auth and realtime, via Docker
npm run dev                    # http://localhost:5173
```

`npm run db:start` prints an API URL and a publishable key — those are the two values `.env.local` wants. It applies `supabase/migrations/` to a fresh database on the way up.

Working against a hosted project instead: create one at supabase.com, copy the URL and publishable key from **Project Settings → API**, and push the schema with `npx supabase link --project-ref <ref>` then `npx supabase db push`.

Nothing secret belongs in this repository. `.env.local` is ignored by git, and the publishable key is meant to be in the browser bundle — row level security is what actually protects the data, not the key.

## How it fits together

```
src/domain/     the rules: banks, templates, dates, drift arithmetic. Pure, no React
src/state/      changes as small operations, and the intents that build them
src/sync/       the local-first store: cache, offline queue, realtime
src/features/   one folder per screen
src/styles/     tokens, then base, then components
supabase/       schema and migrations
e2e/            browser tests, including two devices at once
```

The shape worth knowing about is in `src/sync/store.ts`. The screen always reads the local snapshot, so it never waits on the network. A change is applied to that snapshot immediately and appended to a queue, which drains to Postgres in order when it can. Other devices arrive through Postgres realtime. Conflicts settle as last-write-wins per row, and since a task is its own row, two devices working on different tasks never contend.

A task being its own row is also why the database looks the way it does. `plans` carries the small fixed maps — targets, baselines, templates — as jsonb, because they're always read and written together from one screen. `days` and `tasks` are proper rows, because that's where the daily churn is.

Every table carries `user_id` and has row level security on, so a policy is a direct comparison against `auth.uid()` rather than a join. `tasks` and `days` are set to `replica identity full`; without it Postgres puts only the primary key in a delete's old record, a realtime filter on `user_id` can never match one, and other devices never learn that a task was removed.

## Tests

```bash
npm test           # the rules and the sync engine, in Node
npm run test:e2e   # a real browser, against the built app
```

The unit tests cover the arithmetic and the offline queue. The browser tests cover what they can't: creating an account, two devices watching one account, losing the network mid-session and getting it back. They need `npm run db:start` up, and they build the app first because the service worker only exists in a real build. They run against desktop Chromium and an iPhone-sized WebKit.

## Deploying

The front end is a static bundle, so anything that serves files will do.

```bash
npx vercel --prod
```

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the host's environment variables. The database is wherever your Supabase project lives; `npx supabase db push` sends schema changes to it.

## Installing on your phone

**iPhone, in Safari** — Share, then Add to Home Screen. Chrome on iOS can't install home-screen apps.

**Android** — Chrome's menu offers Install app.

Installing matters for more than appearance: Safari clears stored data for sites you haven't opened in a week or so, and home-screen apps are treated as far more durable. Your record is on the server either way, but the offline copy is what makes it open instantly.

## Changing things

Question bank totals and the default Chill and Productive templates are at the top of `src/domain/banks.ts` and `src/domain/templates.ts`, in plain readable objects.

Changing the database means a new file in `supabase/migrations/`, then `npm run db:reset` locally and `npm run db:types` to bring the TypeScript definitions back in line.

There's no cache version to bump any more. The service worker is generated at build time and updates itself.
