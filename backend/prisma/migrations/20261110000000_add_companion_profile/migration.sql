CREATE TABLE "CompanionProfile" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "guestIdentityId" UUID,
    "activeCharacterStoreItemId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "CompanionProfile_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CompanionProfile_exactly_one_owner_check"
      CHECK (("userId" IS NOT NULL AND "guestIdentityId" IS NULL)
          OR ("userId" IS NULL AND "guestIdentityId" IS NOT NULL))
);

CREATE UNIQUE INDEX "CompanionProfile_userId_key" ON "CompanionProfile"("userId");
CREATE UNIQUE INDEX "CompanionProfile_guestIdentityId_key" ON "CompanionProfile"("guestIdentityId");
CREATE INDEX "CompanionProfile_activeCharacterStoreItemId_idx"
  ON "CompanionProfile"("activeCharacterStoreItemId");

ALTER TABLE "CompanionProfile"
  ADD CONSTRAINT "CompanionProfile_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompanionProfile"
  ADD CONSTRAINT "CompanionProfile_guestIdentityId_fkey"
  FOREIGN KEY ("guestIdentityId") REFERENCES "GuestIdentity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompanionProfile"
  ADD CONSTRAINT "CompanionProfile_activeCharacterStoreItemId_fkey"
  FOREIGN KEY ("activeCharacterStoreItemId") REFERENCES "StoreItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
