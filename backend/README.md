# NEXIRA Backend

NestJS + TypeScript modular monolith for NEXIRA.

## Requirements

- Node.js 20.19+
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

The initial health endpoint is:

```
GET http://localhost:3000/api/v1/health
```

## Architecture boundaries

- This backend is isolated from the existing React/Vite/Capacitor client.
- The server will become authoritative for match state, timing, adjudication, scoring, XP, and ranking.
- Modules are organized as a modular monolith; do not introduce microservices for v1.
- Room and multiplayer contracts must support future v2 expansion without enabling every v2 feature in v1.
- XP progression and competitive ranking are separate systems.
- Never commit real environment files, secrets, or production credentials.

## Current implementation status

This is the initial application foundation only. Domain models, migrations, authentication, match workflows, ranking, AI adapters, and WebSocket gateways are added in subsequent implementation stages.
