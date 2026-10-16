CREATE TABLE "DocumentImport" (
 "id" TEXT NOT NULL, "ownerId" TEXT NOT NULL, "fileName" TEXT NOT NULL, "mimeType" TEXT NOT NULL, "byteLength" INTEGER NOT NULL,
 "ciphertext" BYTEA, "status" TEXT NOT NULL DEFAULT 'STORED', "version" INTEGER NOT NULL DEFAULT 1,
 "draft" JSONB, "error" TEXT, "consentedAt" TIMESTAMP(3), "extractionAttempts" INTEGER NOT NULL DEFAULT 0,
 "confirmedTripId" TEXT, "confirmationDigest" TEXT, "expiresAt" TIMESTAMP(3) NOT NULL, "purgedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "DocumentImport_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "DocumentImport_confirmedTripId_fkey" FOREIGN KEY ("confirmedTripId") REFERENCES "Trip"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "DocumentImport_ownerId_createdAt_idx" ON "DocumentImport"("ownerId","createdAt");
CREATE INDEX "DocumentImport_status_updatedAt_idx" ON "DocumentImport"("status","updatedAt");
CREATE TABLE "NotificationPreference" ("ownerId" TEXT NOT NULL,"inAppEnabled" BOOLEAN NOT NULL DEFAULT true,"includeReplay" BOOLEAN NOT NULL DEFAULT false,"updatedAt" TIMESTAMP(3) NOT NULL,CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY("ownerId"));
CREATE TABLE "Notification" ("id" TEXT NOT NULL,"ownerId" TEXT NOT NULL,"tripId" TEXT,"sourceKey" TEXT NOT NULL,"kind" TEXT NOT NULL,"title" TEXT NOT NULL,"message" TEXT NOT NULL,"readAt" TIMESTAMP(3),"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "Notification_pkey" PRIMARY KEY("id"),CONSTRAINT "Notification_tripId_fkey" FOREIGN KEY("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE);
CREATE UNIQUE INDEX "Notification_sourceKey_key" ON "Notification"("sourceKey");
CREATE INDEX "Notification_ownerId_createdAt_idx" ON "Notification"("ownerId","createdAt");
CREATE TABLE "WorkerCursor" ("id" TEXT NOT NULL,"cursor" INTEGER NOT NULL DEFAULT 0,CONSTRAINT "WorkerCursor_pkey" PRIMARY KEY("id"));
