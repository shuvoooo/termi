-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dhKey" TEXT NOT NULL,
    "authKey" TEXT NOT NULL,
    "deviceLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServerMonitorConfig" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "checkIntervalMinutes" INTEGER NOT NULL DEFAULT 5,
    "alertEmail" BOOLEAN NOT NULL DEFAULT true,
    "alertPush" BOOLEAN NOT NULL DEFAULT true,
    "failureThreshold" INTEGER NOT NULL DEFAULT 3,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "alertSent" BOOLEAN NOT NULL DEFAULT false,
    "lastCheckedAt" TIMESTAMP(3),
    "lastStatus" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServerMonitorConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServerHealthRecord" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "reachable" BOOLEAN NOT NULL,
    "latencyMs" INTEGER,
    "cpuPercent" DOUBLE PRECISION,
    "ramPercent" DOUBLE PRECISION,
    "diskPercent" DOUBLE PRECISION,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServerHealthRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ServerMonitorConfig_serverId_key" ON "ServerMonitorConfig"("serverId");

-- CreateIndex
CREATE INDEX "ServerMonitorConfig_userId_idx" ON "ServerMonitorConfig"("userId");

-- CreateIndex
CREATE INDEX "ServerMonitorConfig_enabled_idx" ON "ServerMonitorConfig"("enabled");

-- CreateIndex
CREATE INDEX "ServerHealthRecord_serverId_checkedAt_idx" ON "ServerHealthRecord"("serverId", "checkedAt");

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServerMonitorConfig" ADD CONSTRAINT "ServerMonitorConfig_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServerMonitorConfig" ADD CONSTRAINT "ServerMonitorConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServerHealthRecord" ADD CONSTRAINT "ServerHealthRecord_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;
