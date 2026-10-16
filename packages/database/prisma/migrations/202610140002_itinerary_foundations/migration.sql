ALTER TABLE "TripItem" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1,
 ADD COLUMN "validationVersion" INTEGER NOT NULL DEFAULT 1,
 ADD COLUMN "origin" JSONB,
 ADD COLUMN "destination" JSONB;
ALTER TABLE "Dependency" ADD COLUMN "bufferSource" TEXT NOT NULL DEFAULT 'ASSUMED',
 ADD COLUMN "protection" TEXT NOT NULL DEFAULT 'UNKNOWN',
 ADD COLUMN "evidenceUrl" TEXT;
ALTER TABLE "StatusObservation" ADD COLUMN "itemRevision" INTEGER NOT NULL DEFAULT 1,
 ADD COLUMN "serviceStatus" TEXT NOT NULL DEFAULT 'SCHEDULED',
 ADD COLUMN "actualArrivalAt" TIMESTAMP(3),
 ADD COLUMN "arrivalLocation" TEXT;
UPDATE "StatusObservation" SET "serviceStatus" = 'DELAYED' WHERE "delayMinutes" > 0;
CREATE INDEX "Trip_ownerId_createdAt_idx" ON "Trip"("ownerId", "createdAt");
CREATE TABLE "TripMutation" (
 "id" TEXT NOT NULL,
 "tripId" TEXT NOT NULL,
 "requestKey" TEXT NOT NULL,
 "fingerprint" TEXT NOT NULL,
 "revision" INTEGER NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "TripMutation_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "TripMutation_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "TripMutation_tripId_requestKey_key" ON "TripMutation"("tripId", "requestKey");
