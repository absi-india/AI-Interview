# Local development bootstrap for Windows (PowerShell)
# Run: .\scripts\dev.ps1
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

# ── 1. Prerequisites ─────────────────────────────────────────────────────────
foreach ($cmd in @("node", "npm", "docker")) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
        Write-Error "ERROR: '$cmd' not found. Please install it first."
        exit 1
    }
}

$nodeVer = [int](node -e "process.stdout.write(process.version.replace('v','').split('.')[0])")
if ($nodeVer -lt 20) {
    Write-Error "ERROR: Node.js 20+ required (found v$nodeVer)."
    exit 1
}

# ── 2. .env setup ────────────────────────────────────────────────────────────
if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "  Created .env from .env.example — fill in ANTHROPIC_API_KEY before running."
}

# ── 3. Clear stale Turbopack cache ───────────────────────────────────────────
if (Test-Path ".next") {
    Write-Host ""
    Write-Host "▶ Clearing stale .next cache..."
    Remove-Item -Recurse -Force ".next"
}

# ── 4. npm install ───────────────────────────────────────────────────────────
Write-Host ""
Write-Host "▶ Installing dependencies..."
npm install

# ── 5. Start infrastructure (Redis + MinIO) via Docker ───────────────────────
Write-Host ""
Write-Host "▶ Starting Redis and MinIO..."
docker compose up -d redis minio
Write-Host "  Waiting for services..."
Start-Sleep -Seconds 3

# ── 6. Prisma ────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "▶ Generating Prisma client..."
npx prisma generate

Write-Host ""
Write-Host "▶ Running database migrations..."
try {
    npx prisma migrate dev --name init
} catch {
    npx prisma migrate deploy
}

# ── 7. Seed ──────────────────────────────────────────────────────────────────
$seed = if ($env:SEED) { $env:SEED } else { "true" }
if ($seed -eq "true" -and (Test-Path "prisma/seed.ts")) {
    Write-Host ""
    Write-Host "▶ Seeding database..."
    npx tsx prisma/seed.ts
}

# ── 8. Done ──────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "Setup complete. Starting dev server..."
Write-Host ""
npm run dev
