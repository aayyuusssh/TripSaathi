ALTER TABLE "StatusObservation" ADD COLUMN "providerId" TEXT, ADD COLUMN "providerFlightId" TEXT, ADD COLUMN "estimatedArrivalAt" TIMESTAMP(3), ADD COLUMN "disposition" TEXT NOT NULL DEFAULT 'ACCEPTED';
ALTER TABLE "AgentTask" ADD COLUMN "context" JSONB, ADD COLUMN "expiresAt" TIMESTAMP(3), ADD COLUMN "callbackToken" TEXT;
CREATE TABLE "MonitoringSubscription" (
 "id" TEXT NOT NULL, "tripId" TEXT NOT NULL, "itemId" TEXT NOT NULL, "itemRevision" INTEGER NOT NULL,
 "providerId" TEXT NOT NULL DEFAULT 'FLIGHTAWARE', "providerFlightId" TEXT, "state" TEXT NOT NULL DEFAULT 'ACTIVE',
 "nextCheckAt" TIMESTAMP(3) NOT NULL, "windowEndsAt" TIMESTAMP(3) NOT NULL, "leaseUntil" TIMESTAMP(3), "leaseToken" TEXT,
 "lastCheckedAt" TIMESTAMP(3), "lastSuccessAt" TIMESTAMP(3), "lastError" TEXT, "failures" INTEGER NOT NULL DEFAULT 0,
 "dailyLimit" INTEGER NOT NULL DEFAULT 24, "usageDay" TEXT, "callsToday" INTEGER NOT NULL DEFAULT 0,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "MonitoringSubscription_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "MonitoringSubscription_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "MonitoringSubscription_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "TripItem"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "MonitoringSubscription_itemId_providerId_key" ON "MonitoringSubscription"("itemId","providerId");
CREATE INDEX "MonitoringSubscription_state_nextCheckAt_idx" ON "MonitoringSubscription"("state","nextCheckAt");
CREATE TABLE "ProviderUsage" ("id" TEXT NOT NULL, "providerId" TEXT NOT NULL, "day" TEXT NOT NULL, "calls" INTEGER NOT NULL DEFAULT 0, CONSTRAINT "ProviderUsage_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "ProviderUsage_providerId_day_key" ON "ProviderUsage"("providerId","day");
