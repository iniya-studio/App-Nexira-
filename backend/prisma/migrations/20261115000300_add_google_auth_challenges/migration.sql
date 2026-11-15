CREATE TABLE "GoogleAuthChallenge" (
    "id" UUID NOT NULL,
    "nonceHash" VARCHAR(64) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "consumedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GoogleAuthChallenge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GoogleAuthChallenge_nonceHash_key" ON "GoogleAuthChallenge"("nonceHash");
CREATE INDEX "GoogleAuthChallenge_expiresAt_consumedAt_idx" ON "GoogleAuthChallenge"("expiresAt", "consumedAt");
