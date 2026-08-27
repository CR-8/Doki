# Deploying to Vercel

Vercel gives you a public HTTPS origin, which is what Twilio needs for both
media fetches and status callbacks. It replaces the tunnel entirely.

## 1. Push to a Git remote

Vercel deploys from Git. From the repo root:

```bash
git add -A
git commit -m "Callwise: policy engine, dispatch, Sarvam TTS"
git push
```

## 2. Import the project

In Vercel, import the repository, then set:

| Setting | Value |
|---|---|
| Framework | Next.js |
| Root Directory | `apps/web` |
| Include files outside root | **enabled** (required — workspace packages live above it) |
| Install Command | `bun install` |
| Build Command | **leave empty / default** |
| Output Directory | **leave empty / default** |

Do not set a custom Build Command. With Root Directory pointed at `apps/web`,
`bun run build` resolves to that package's own script (`next build`), so any
root-style command such as `bun run build --filter=web` is passed through to
Next as an unknown flag and the build fails with:

```
error: unknown option '--filter=web'
```

There is deliberately no `vercel.json` in this repo. Vercel detects Turborepo
and Next.js on its own, and an extra config file only creates a second place
for these settings to disagree. If a Build Command was already saved in the
dashboard, clear it and redeploy.

## 3. Environment variables

Add every one of these in Project Settings > Environment Variables.
`APP_URL` and `BETTER_AUTH_URL` **must** be the deployment origin, not
localhost — auth cookies and Twilio signature verification both depend on it.

Required:

```
DATABASE_URL              Neon POOLED connection string
BETTER_AUTH_SECRET        32+ chars
BETTER_AUTH_URL           https://<your-app>.vercel.app
APP_URL                   https://<your-app>.vercel.app

VOICE_PROVIDER            twilio
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_FROM_NUMBER        a voice-capable number you own
TWILIO_RECORD             true

SARVAM_API_KEY
SARVAM_TTS_MODEL          bulbul:v2
SARVAM_TTS_SPEAKER        anushka

LLM_PROVIDER              openai
LLM_MODEL                 gpt-4o-mini
OPENAI_API_KEY
```

Optional cost model (defaults are in `packages/env/src/server.ts`):

```
COST_TELEPHONY_INR_PER_MIN, COST_STT_INR_PER_MIN,
COST_TTS_INR_PER_10K_CHARS, COST_LLM_INR_PER_1K_INPUT,
COST_LLM_INR_PER_1K_OUTPUT, COST_PLATFORM_INR_PER_MIN
```

### These are needed at BUILD time, not just at runtime

`@doki/env/server` validates on import, and server components pull it in while
Next collects page data. If `DATABASE_URL`, `BETTER_AUTH_SECRET` or
`BETTER_AUTH_URL` are missing, the build fails with:

```
Invalid environment variables
```

So set them *before* the first deploy, not after it.

### The URL chicken-and-egg

You do not know the deployment URL until the first build, but two variables
must equal it. Set them to a placeholder that still passes validation — both
are only checked for being valid URLs:

```
BETTER_AUTH_URL=https://placeholder.vercel.app
APP_URL=https://placeholder.vercel.app
```

Deploy, copy the assigned domain, update both, redeploy. Prefer this over
`SKIP_ENV_VALIDATION=1`, which would also hide genuinely missing variables.

A custom domain avoids repeating this on every preview deployment.

## 4. Push the schema

Migrations do not run during the Vercel build. From your machine, pointed at
the same database:

```bash
cd packages/db && bun run db:push
```

## 5. Point Twilio at the deployment

Status and recording callbacks are set per-call by the code, from `APP_URL` —
so there is nothing to configure in the Twilio console. Just make sure
`APP_URL` matches the deployment exactly. Twilio signs webhooks **over the
request URL**, so a mismatch appears as `401 Invalid signature`, not a
connection error.

## 6. Verify

```bash
cd apps/web && bun run preflight
```

Run it with the production values in your shell to confirm the same config
Vercel will use. It exits non-zero while anything is blocking.

---

## Serverless notes

Two things were changed specifically for this platform:

- **Connection pooling** — `packages/db/src/index.ts` drops to `max: 1` when
  `VERCEL` is set. Each serverless instance opens its own pool, so the default
  of 10 would exhaust the database's connection limit under mild concurrency.
  Use the **pooled** Neon string (the one with `-pooler` in the host).

- **Post-call analysis** — the instance is frozen the moment a response is
  returned, which would kill the fire-and-forget analysis mid-run. The webhook
  now hands it to `waitUntil` so it completes without making the carrier wait.

Known limitation: analysis is still not durable. If an instance dies while it
runs, that call gets no analysis and nothing retries it. The **Run analysis**
button on the call page is the recovery path. A queue removes this gap.
