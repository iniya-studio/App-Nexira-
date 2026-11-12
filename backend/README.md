# NEXIRA Backend

NestJS + TypeScript modular monolith for NEXIRA.

## Requirements

- Node.js 24+
- PostgreSQL 16+
- npm

## Local setup

From the repository root:

```bash
cd backend
npm install
cp .env.example .env
```

Set `DATABASE_URL` and the other required environment values in `.env`. Never commit the real `.env` file.

Validate the Prisma schema and generate the client:

```bash
npx prisma validate
npm run prisma:generate
```

Run the API:

```bash
npm run start:dev
```

## Health endpoints

- `GET http://localhost:3000/api/v1/health` — liveness check; confirms that the API process is responding.
- `GET http://localhost:3000/api/v1/health/ready` — readiness check; verifies PostgreSQL connectivity through Prisma.

The API can start while PostgreSQL is temporarily unavailable. In that case, liveness remains available and readiness returns HTTP 503 until the database connection succeeds.

## Quality checks

```bash
npm run prisma:validate
npm run build
npm test -- --runInBand
npm run lint
```

Backend CI runs these checks against a temporary PostgreSQL 16 service and applies the committed migrations before integration tests.

## Architecture boundaries

- This backend is isolated from the React/Vite/Capacitor client in `../app`.
- The server is authoritative for online match state, timing, adjudication, scoring, XP and ranking.
- Modules are organized as a modular monolith; do not introduce microservices for V1.
- Room and multiplayer contracts support future V2 expansion without enabling every V2 feature in V1.
- XP progression and competitive ranking are separate systems.
- AI integrations remain behind backend ports/adapters so providers can be changed without rewriting match-domain logic.
- Preserve the existing Prisma migration history. Never edit an already-applied migration to repair schema drift; add a new forward migration instead.

## Implementation

The current backend includes identity and guest-session foundations, authentication and email verification, match lifecycle and synchronized rounds, AI judging and question generation adapters/workers, room and ranking foundations, companion profile support, health checks and Prisma integration. See `../docs` and `backend/docs` for the detailed contracts and architecture decisions.