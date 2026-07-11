# One-command development startup (Windows PowerShell)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "== Cash-game dev startup ==" -ForegroundColor Cyan

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Error "Node.js is not installed. Install Node 20+ from https://nodejs.org"
  exit 1
}

if (-not (Test-Path ".env")) {
  Write-Host "No .env found - creating from .env.example (edit passwords before production!)"
  Copy-Item ".env.example" ".env"
  $secret = -join ((1..64) | ForEach-Object { '{0:x}' -f (Get-Random -Max 16) })
  (Get-Content ".env") -replace "CHANGE_ME_TO_A_LONG_RANDOM_STRING", $secret | Set-Content ".env"
}

if (-not (Test-Path "node_modules")) {
  Write-Host "Installing dependencies..."
  npm install
}

# Start dev database via Docker if available and port 5432 is free
$docker = Get-Command docker -ErrorAction SilentlyContinue
if ($docker) {
  $portOpen = Test-NetConnection -ComputerName localhost -Port 5432 -InformationLevel Quiet -WarningAction SilentlyContinue
  if (-not $portOpen) {
    Write-Host "Starting PostgreSQL via Docker..."
    docker compose -f docker-compose.dev.yml up -d
    Start-Sleep -Seconds 3
  }
}

Write-Host "Applying migrations..."
npx prisma migrate deploy

Write-Host "Seeding demo data (skipped if data exists)..."
npm run db:seed

Write-Host ""
Write-Host "Starting the app: http://localhost:3000" -ForegroundColor Green
Write-Host "Dev login: owner / Owner123!  (see README.md)"
npm run dev
