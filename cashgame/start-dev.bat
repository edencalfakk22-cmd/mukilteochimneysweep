@echo off
REM One-command development startup (Windows CMD)
cd /d "%~dp0"
echo == Cash-game dev startup ==

where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js is not installed. Install Node 20+ from https://nodejs.org
  exit /b 1
)

if not exist ".env" (
  echo No .env found - creating from .env.example. EDIT PASSWORDS BEFORE PRODUCTION!
  copy .env.example .env >nul
)

if not exist "node_modules" (
  echo Installing dependencies...
  call npm install
)

where docker >nul 2>nul
if not errorlevel 1 (
  echo Starting PostgreSQL via Docker if needed...
  docker compose -f docker-compose.dev.yml up -d
  timeout /t 3 /nobreak >nul
)

echo Applying migrations...
call npx prisma migrate deploy

echo Seeding demo data (skipped if data exists)...
call npm run db:seed

echo.
echo Starting the app: http://localhost:3000
echo Dev login: owner / Owner123!  (see README.md)
call npm run dev
