# Zerra Backend

Node API for payments, session keys, CCTP, PaymentRouter, and webhooks.

## Local development

```bash
cp .env.example .env
# Edit .env (see below)
npm install
npm run dev
```

Runs on `http://localhost:3001`. Uses SQLite by default (no `DATABASE_URL`).

## Deploy to Vercel

1. **Use Postgres on Vercel**  
   Set `DATABASE_URL` in the Vercel project (e.g. Supabase **Session** pooler URL). SQLite is not supported on serverless.

2. **Deploy from the backend directory**
   ```bash
   cd backend
   npx vercel
   ```
   Or link the repo and set **Root Directory** to `backend` in the Vercel dashboard.

3. **Environment variables**  
   Add all keys from `.env.example` in the Vercel project (RPC URLs, Circle, Pimlico, relayer key, etc.). No `PORT` needed.

4. **Cron**  
   Scheduled tasks (expire jobs, stuck jobs, subscriptions) run via Vercel Cron every 5 minutes (`vercel.json`). No extra config.

## Endpoints

- `GET /health` — health check  
- `POST /api/quote` — payment quote  
- `POST /api/pay` — create payment job  
- `GET /api/pay/:jobId/status` — job status  
- Plus merchant, storefront, subscriptions, webhooks — see `src/api/routes.js`.
