# Deployment Guide - Free Setup

This app is designed to run on:

| Service | Purpose | Notes |
|---|---|---|
| Vercel | Next.js hosting and cron | Use native GitHub integration |
| Turso | Hosted SQLite/LibSQL database | Required for production |
| Google Gemini | AI question generation and scoring | Required for AI features |
| Cloudflare R2 or MinIO-compatible storage | Candidate recordings and resumes | Recommended for production |
| Resend SMTP | Email delivery | Optional |
| Upstash Redis | Instant rating queue | Optional; cron can handle rating |

## 1. Create Required Accounts

### Turso Database

1. Go to `https://app.turso.tech`.
2. Create a database, for example `interview-portal`.
3. Copy the database URL. It looks like:

```text
libsql://interview-portal-yourname.turso.io
```

4. Create/copy a database auth token.

### Gemini API Key

1. Go to `https://aistudio.google.com/app/apikey`.
2. Create an API key.
3. Save it as `GEMINI_API_KEY`.

### Object Storage For Videos

Production deployments should not rely on local `public/uploads`, because serverless files are not permanent.

Use Cloudflare R2 or another S3-compatible service and set the `MINIO_*` variables listed below.

## 2. Deploy On Vercel

1. Push this repo to GitHub.
2. Go to `https://vercel.com/new`.
3. Import the GitHub repo.
4. Framework preset should be `Next.js`.
5. Add the environment variables below before the final redeploy.

## 3. Vercel Environment Variables

Required:

| Name | Value |
|---|---|
| `DATABASE_URL` | Turso URL, e.g. `libsql://...turso.io` |
| `DATABASE_AUTH_TOKEN` | Turso token |
| `AUTH_SECRET` | Strong random string |
| `NEXTAUTH_URL` | Your Vercel URL, e.g. `https://your-app.vercel.app` |
| `AUTH_TRUST_HOST` | `true` |
| `APP_DOMAIN` | Same public app URL |
| `GEMINI_API_KEY` | Gemini API key |
| `CRON_SECRET` | Strong random string |
| `COMPANY_NAME` | Your company name |

Recommended for video/resume storage:

| Name | Example |
|---|---|
| `MINIO_ENDPOINT` | `<account-id>.r2.cloudflarestorage.com` |
| `MINIO_PORT` | `443` |
| `MINIO_USE_SSL` | `true` |
| `MINIO_ACCESS_KEY` | R2/S3 access key |
| `MINIO_SECRET_KEY` | R2/S3 secret key |
| `MINIO_BUCKET_RECORDINGS` | `recordings` |
| `MINIO_BUCKET_RESUMES` | `resumes` |

Optional email:

| Name | Example |
|---|---|
| `SMTP_HOST` | `smtp.resend.com` |
| `SMTP_PORT` | `465` |
| `SMTP_SECURE` | `true` |
| `SMTP_USER` | `resend` |
| `SMTP_PASS` | Resend API key |
| `SMTP_FROM` | `Your Company <noreply@yourdomain.com>` |

Optional Redis:

| Name | Value |
|---|---|
| `REDIS_URL` | Upstash `rediss://...` URL |

## 4. Run Turso Migrations

For Turso, use the included migration script instead of `prisma migrate deploy`.

In PowerShell:

```powershell
$env:DATABASE_URL="libsql://interview-portal-xxx.turso.io"
$env:DATABASE_AUTH_TOKEN="your-turso-token"
npm run db:migrate
```

## 5. Create The First Admin User

In PowerShell:

```powershell
$env:DATABASE_URL="libsql://interview-portal-xxx.turso.io"
$env:DATABASE_AUTH_TOKEN="your-turso-token"
$env:ADMIN_EMAIL="you@example.com"
$env:ADMIN_PASSWORD="your-strong-password"
npm run db:seed
```

## 6. Verify Deployment

1. Open:

```text
https://your-app.vercel.app/api/health
```

It should return `"ok": true`.

2. Open:

```text
https://your-app.vercel.app/login
```

3. Log in with the admin account you seeded.
4. Create a candidate and interview.
5. Complete an interview.
6. Wait up to 60 seconds for the Vercel cron to rate it.

## 7. Cron Rating

The cron is configured in `vercel.json`:

```json
{
  "path": "/api/cron/rate-interviews",
  "schedule": "* * * * *"
}
```

The route checks `CRON_SECRET`, finds the oldest completed interview without an overall score, rates it, and stores the result.

## 8. GitHub Deploys

This repo uses Vercel's native GitHub integration. You do not need `VERCEL_TOKEN`, `VERCEL_ORG_ID`, or `VERCEL_PROJECT_ID` GitHub secrets for normal deploys.

The GitHub Actions workflow only runs CI checks.
