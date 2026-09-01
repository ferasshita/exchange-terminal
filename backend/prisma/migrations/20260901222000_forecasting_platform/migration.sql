-- AlterTable
ALTER TABLE "whatsapp_sources" ADD COLUMN "inviteCode" TEXT;
ALTER TABLE "whatsapp_sources" ADD COLUMN "channelJid" TEXT;
ALTER TABLE "whatsapp_sources" ADD COLUMN "syncEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "whatsapp_sources" ADD COLUMN "lastSyncAt" DATETIME;
ALTER TABLE "whatsapp_sources" ADD COLUMN "lastError" TEXT;

-- CreateTable
CREATE TABLE "ImportedFile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fileName" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "contentType" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "recordsIn" INTEGER NOT NULL DEFAULT 0,
    "recordsOut" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ForecastRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "sourceTypes" JSONB,
    "modelVersion" TEXT,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ForecastPrediction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "pair" TEXT NOT NULL,
    "horizonHours" INTEGER NOT NULL,
    "pointForecast" DECIMAL NOT NULL,
    "confidenceLow" DECIMAL NOT NULL,
    "confidenceHigh" DECIMAL NOT NULL,
    "confidenceLabel" TEXT NOT NULL,
    "currentRate" DECIMAL,
    "predictionFor" DATETIME NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ForecastPrediction_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ForecastRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ForecastPrediction_pair_predictionFor_idx" ON "ForecastPrediction"("pair", "predictionFor");
