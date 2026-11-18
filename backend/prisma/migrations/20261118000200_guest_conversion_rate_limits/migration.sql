-- Database-backed fixed-window counters are shared by every API instance.
CREATE TABLE "GuestConversionRateLimit" (
    "bucketKey" VARCHAR(64) NOT NULL,
    "windowStartedAt" TIMESTAMPTZ(3) NOT NULL,
    "attemptCount" INTEGER NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "GuestConversionRateLimit_pkey" PRIMARY KEY ("bucketKey"),
    CONSTRAINT "GuestConversionRateLimit_attemptCount_check" CHECK ("attemptCount" >= 0)
);

CREATE INDEX "GuestConversionRateLimit_updatedAt_idx"
  ON "GuestConversionRateLimit"("updatedAt");
