#!/usr/bin/env bash
# Local development bootstrap — run once after cloning, or to reset state.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# ── 1. Check prerequisites ───────────────────────────────────────────────────
for cmd in node npm docker; do
  command -v "$cmd" &>/dev/null || { echo "ERROR: '$cmd' not found. Please install it first."; exit 1; }
done

NODE_VER=$(node -e "process.stdout.write(process.version.replace('v','').split('.')[0])")
if [ "$NODE_VER" -lt 20 ]; then
  echo "ERROR: Node.js 20+ required (found v$NODE_VER)."
  exit 1
fi

# ── 2. .env setup ────────────────────────────────────────────────────────────
if [ ! -f .env ]; then
  cp .env.example .env
  echo "  Created .env from .env.example — fill in ANTHROPIC_API_KEY and other secrets before running."
fi

# ── 3. npm install ───────────────────────────────────────────────────────────
echo ""
echo "▶ Installing dependencies..."
npm install

# ── 4. Start infrastructure (Redis + MinIO) via Docker ───────────────────────
echo ""
echo "▶ Starting Redis and MinIO..."
docker compose up -d redis minio
echo "  Waiting for services to be ready..."
sleep 3

# ── 5. Prisma ────────────────────────────────────────────────────────────────
echo ""
echo "▶ Generating Prisma client..."
npx prisma generate

echo ""
echo "▶ Running database migrations..."
npx prisma migrate dev --name init 2>/dev/null || npx prisma migrate deploy

# ── 6. Seed (optional) ───────────────────────────────────────────────────────
if [ "${SEED:-true}" = "true" ] && [ -f prisma/seed.ts ]; then
  echo ""
  echo "▶ Seeding database..."
  npx tsx prisma/seed.ts
fi

# ── 7. Done ──────────────────────────────────────────────────────────────────
echo ""
echo "✓ Setup complete. Starting dev server..."
echo ""
exec npm run dev
