# NEXIRA

NEXIRA is a mobile-first competitive game project. The repository is organized as a monorepo with a React/Vite/Capacitor application and a NestJS modular-monolith backend.

## Repository layout

- `app/` — React + Vite client and Capacitor Android project.
- `backend/` — NestJS + TypeScript API, Prisma schema and database migrations.
- `docs/` — product, architecture, UI/UX and implementation documentation.
- `.github/workflows/` — independent Android and backend CI workflows.

## Application

Requirements: Node.js 22, JDK 21 for Android builds, Android SDK Platform 35 and Build Tools 35.0.0.

```sh
cd app
npm ci
npm test
npm run build
```

Build an Android debug APK:

```sh
cd app
npm ci
npm run android:apk
```

The generated APK is copied to `app/build/NEXIRA-Android.apk`.

## Backend

Requirements: Node.js 24+ and PostgreSQL 16+.

```sh
cd backend
npm install
cp .env.example .env
```

Set `DATABASE_URL` and the other required environment values in `.env`. Then:

```sh
npx prisma validate
npm run build
npm test -- --runInBand
npm run start:dev
```

See [backend/README.md](backend/README.md) for backend setup, health endpoints and architecture notes.

## Engineering boundaries

- The backend remains a modular monolith for V1; do not split it into microservices.
- The backend is authoritative for online match state, timing, judging, scoring, XP and ranking.
- The app's current local match adapter is a client-side prototype boundary; it is not a substitute for the online API.
- Keep app and backend dependencies, environment files and CI workflows isolated.
- Never commit real credentials, production secrets or local environment files.
- Preserve database migration history; do not edit already-applied migrations to repair schema drift.

## Workflows

- **NEXIRA Android APK** builds and tests the app from `app/`.
- **Backend CI** validates Prisma, applies migrations to a temporary PostgreSQL service, builds the API, runs tests and lint from `backend/`.

The recovery/monorepo branch is the integration workspace while the existing historical branches remain available as recovery sources. Do not delete historical branches until the consolidated project has passed sustained validation.