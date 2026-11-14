# NEXIRA staging deployment

Provider-neutral single-host setup: Linux + Docker Compose, a DNS name pointing to the host, and inbound TCP 80/443. Caddy provisions and renews HTTPS. PostgreSQL is private to the Docker network and persists in a named volume.

## Prepare

1. Install Docker Engine and the Compose plugin.
2. Point the staging API hostname to the host and allow inbound 80/443.
3. Copy .env.staging.example to .env.staging; replace all placeholders. Generate independent secrets. Never reuse JWT and refresh-encryption keys.
4. Set JWT_ISSUER to the exact public HTTPS API URL. Add real AI, Google and SMTP credentials only on the host.
5. Do not publish PostgreSQL port 5432. The sample session and refresh lifetime is 30 days; approve it before use.

## Start

From the repository root on the staging host:

```bash
cp .env.staging.example .env.staging
# Edit .env.staging before continuing.
docker compose --env-file .env.staging -f compose.staging.yml config --quiet
docker compose --env-file .env.staging -f compose.staging.yml up -d --build
```

Backend waits for PostgreSQL health, applies Prisma migrations, then starts NestJS. Keep this first deployment single-instance: in-memory rate limits and worker coordination are not designed for horizontal scaling.

## Verify

```bash
docker compose --env-file .env.staging -f compose.staging.yml ps
curl --fail https://YOUR_REAL_HOST/api/v1/health
curl --fail https://YOUR_REAL_HOST/api/v1/health/ready
```

Readiness succeeds only when PostgreSQL is reachable. Check backend and Caddy logs if startup or certificate issuance fails.

## Backups and limits

Back up PostgreSQL before migrations on a database with data, and test restore. A named volume is persistence, not a backup. Schedule encrypted off-host backups before production. This is a single-host staging baseline, not high availability or disaster recovery. Configure OS updates, firewall, SSH keys, monitoring, backup retention and provider-side secret storage before production.
