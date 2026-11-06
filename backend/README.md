# NEXIRA Backend

NestJS + TypeScript modular monolith for NEXIRA.

## Requirements

- Node.js 24+
- PostgreSQL 16+
- npm

## Local setup

```bash
cd backend
npm install
cp .env.example .env
```

Set a local PostgreSQL connection string in `.env`, then run:

```bash
npm run start:dev
```

## Health endpoints

- `GET http://localhost:3000/api/v1/health` — liveness check; confirms that the API process is responding.
- `GET http://localhost:3000/api/v1/health/ready` — readiness check; verifies that PostgreSQL is reachable through Prisma.

The API can start while PostgreSQL is temporarily unavailable. In that case, the liveness endpoint remains available and the readiness endpoint returns HTTP 503 until the database connection succeeds.

## Architecture boundaries

- This backend is isolated from the existing React/Vite/Capacitor client.
- The server will become authoritative for match state, timing, adjudication, scoring, XP, and ranking.
- Modules are organized as a modular monolith; do not introduce microservices for v1.
- Room and multiplayer contracts must support future v2 expansion without enabling every v2 feature in v1.
- XP progression and competitive ranking are separate systems.
- Never commit real environment files, secrets, or production credentials.

## Current implementation status

This is the initial application foundation. It includes application bootstrap, health checks, Prisma integration, and the initial domain schema. Authentication, match workflows, ranking operations, AI adapters, WebSocket gateways, and database migrations are added in subsequent implementation stages.
