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
| Build Command | *(leave default)* |

The repo-level `vercel.json` covers the monorepo build if you deploy from the
root instead; if you set Root Directory to `apps/web`, Vercel's own Turborepo
detection handles it and you can ignore that file.

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

Chicken-and-egg: you do not know the URL until the first deploy. Deploy once
with placeholders, copy the assigned domain, update both URL variables, then
redeploy. A custom domain avoids repeating this on every preview.

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
