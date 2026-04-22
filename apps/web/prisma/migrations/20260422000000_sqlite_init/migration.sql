-- Termi SQLite Schema — initial consolidated migration
-- Replaces all previous PostgreSQL migrations

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ============================================================
-- User
-- ============================================================
CREATE TABLE "User" (
    "id"                           TEXT    NOT NULL PRIMARY KEY,
    "email"                        TEXT    NOT NULL,
    "passwordHash"                 TEXT    NOT NULL,
    "totpSecret"                   TEXT,
    "totpEnabled"                  BOOLEAN NOT NULL DEFAULT false,
    "emailOtpEnabled"              BOOLEAN NOT NULL DEFAULT false,
    "twoFactorMethod"              TEXT    NOT NULL DEFAULT 'NONE',
    "masterKeyHash"                TEXT,
    "masterKeySalt"                TEXT,
    "isActive"                     BOOLEAN NOT NULL DEFAULT true,
    "isVerified"                   BOOLEAN NOT NULL DEFAULT false,
    "emailVerificationToken"       TEXT,
    "emailVerificationExpiresAt"   DATETIME,
    "failedLoginCount"             INTEGER NOT NULL DEFAULT 0,
    "lockoutUntil"                 DATETIME,
    "createdAt"                    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"                    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt"                  DATETIME,
    "passkeyEnabled"               BOOLEAN NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "User_email_idx"        ON "User"("email");

-- ============================================================
-- Session
-- ============================================================
CREATE TABLE "Session" (
    "id"            TEXT    NOT NULL PRIMARY KEY,
    "userId"        TEXT    NOT NULL,
    "tokenHash"     TEXT    NOT NULL,
    "deviceInfo"    TEXT    NOT NULL,
    "ipAddress"     TEXT    NOT NULL,
    "createdAt"     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt"     DATETIME NOT NULL,
    "lastActiveAt"  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isRevoked"     BOOLEAN NOT NULL DEFAULT false,
    "revokedAt"     DATETIME,
    "revokedReason" TEXT,
    CONSTRAINT "Session_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");
CREATE INDEX "Session_userId_idx"    ON "Session"("userId");
CREATE INDEX "Session_tokenHash_idx" ON "Session"("tokenHash");
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- ============================================================
-- ServerGroup
-- ============================================================
CREATE TABLE "ServerGroup" (
    "id"          TEXT    NOT NULL PRIMARY KEY,
    "userId"      TEXT    NOT NULL,
    "name"        TEXT    NOT NULL,
    "description" TEXT,
    "color"       TEXT,
    "icon"        TEXT,
    "sortOrder"   INTEGER NOT NULL DEFAULT 0,
    "createdAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ServerGroup_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ServerGroup_userId_name_key" ON "ServerGroup"("userId", "name");
CREATE INDEX "ServerGroup_userId_idx" ON "ServerGroup"("userId");

-- ============================================================
-- Server
-- ============================================================
CREATE TABLE "Server" (
    "id"            TEXT    NOT NULL PRIMARY KEY,
    "userId"        TEXT    NOT NULL,
    "groupId"       TEXT,
    "name"          TEXT    NOT NULL,
    "description"   TEXT,
    "tags"          TEXT    NOT NULL DEFAULT '[]',
    "color"         TEXT,
    "icon"          TEXT,
    "host"          TEXT    NOT NULL,
    "port"          INTEGER NOT NULL,
    "protocol"      TEXT    NOT NULL,
    "username"      TEXT    NOT NULL,
    "password"      TEXT,
    "privateKey"    TEXT,
    "passphrase"    TEXT,
    "notes"         TEXT,
    "sshOptions"    TEXT,
    "displayWidth"  INTEGER DEFAULT 1920,
    "displayHeight" INTEGER DEFAULT 1080,
    "colorDepth"    INTEGER DEFAULT 24,
    "isFavorite"    BOOLEAN NOT NULL DEFAULT false,
    "lastUsedAt"    DATETIME,
    "useCount"      INTEGER NOT NULL DEFAULT 0,
    "createdAt"     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Server_userId_fkey"
        FOREIGN KEY ("userId")  REFERENCES "User"("id")        ON DELETE CASCADE  ON UPDATE CASCADE,
    CONSTRAINT "Server_groupId_fkey"
        FOREIGN KEY ("groupId") REFERENCES "ServerGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "Server_userId_idx"    ON "Server"("userId");
CREATE INDEX "Server_groupId_idx"   ON "Server"("groupId");
CREATE INDEX "Server_protocol_idx"  ON "Server"("protocol");
CREATE INDEX "Server_isFavorite_idx" ON "Server"("isFavorite");

-- ============================================================
-- Connection
-- ============================================================
CREATE TABLE "Connection" (
    "id"           TEXT    NOT NULL PRIMARY KEY,
    "serverId"     TEXT    NOT NULL,
    "sessionId"    TEXT    NOT NULL,
    "protocol"     TEXT    NOT NULL,
    "status"       TEXT    NOT NULL,
    "startedAt"    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt"      DATETIME,
    "bytesIn"      INTEGER NOT NULL DEFAULT 0,
    "bytesOut"     INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    CONSTRAINT "Connection_serverId_fkey"
        FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "Connection_serverId_idx"  ON "Connection"("serverId");
CREATE INDEX "Connection_sessionId_idx" ON "Connection"("sessionId");
CREATE INDEX "Connection_startedAt_idx" ON "Connection"("startedAt");

-- ============================================================
-- AuditLog
-- ============================================================
CREATE TABLE "AuditLog" (
    "id"        TEXT    NOT NULL PRIMARY KEY,
    "userId"    TEXT,
    "action"    TEXT    NOT NULL,
    "resource"  TEXT,
    "details"   TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "AuditLog_userId_idx"    ON "AuditLog"("userId");
CREATE INDEX "AuditLog_action_idx"    ON "AuditLog"("action");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- ============================================================
-- RecoveryCode
-- ============================================================
CREATE TABLE "RecoveryCode" (
    "id"        TEXT    NOT NULL PRIMARY KEY,
    "userId"    TEXT    NOT NULL,
    "codeHash"  TEXT    NOT NULL,
    "usedAt"    DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RecoveryCode_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "RecoveryCode_userId_idx" ON "RecoveryCode"("userId");

-- ============================================================
-- EmailOTP
-- ============================================================
CREATE TABLE "EmailOTP" (
    "id"        TEXT    NOT NULL PRIMARY KEY,
    "userId"    TEXT    NOT NULL,
    "codeHash"  TEXT    NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "usedAt"    DATETIME,
    "ipAddress" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailOTP_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "EmailOTP_userId_idx" ON "EmailOTP"("userId");

-- ============================================================
-- Passkey
-- ============================================================
CREATE TABLE "Passkey" (
    "id"                   TEXT    NOT NULL PRIMARY KEY,
    "userId"               TEXT    NOT NULL,
    "name"                 TEXT    NOT NULL DEFAULT 'Passkey',
    "credentialID"         TEXT    NOT NULL,
    "credentialPublicKey"  BLOB    NOT NULL,
    "counter"              INTEGER NOT NULL DEFAULT 0,
    "deviceType"           TEXT    NOT NULL,
    "backedUp"             BOOLEAN NOT NULL DEFAULT false,
    "transports"           TEXT    NOT NULL DEFAULT '[]',
    "createdAt"            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt"           DATETIME,
    CONSTRAINT "Passkey_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Passkey_credentialID_key" ON "Passkey"("credentialID");
CREATE INDEX "Passkey_userId_idx"              ON "Passkey"("userId");

-- ============================================================
-- PushSubscription
-- ============================================================
CREATE TABLE "PushSubscription" (
    "id"          TEXT    NOT NULL PRIMARY KEY,
    "userId"      TEXT    NOT NULL,
    "endpoint"    TEXT    NOT NULL,
    "p256dhKey"   TEXT    NOT NULL,
    "authKey"     TEXT    NOT NULL,
    "deviceLabel" TEXT,
    "createdAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PushSubscription_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");
CREATE INDEX "PushSubscription_userId_idx"          ON "PushSubscription"("userId");

-- ============================================================
-- ServerMonitorConfig
-- ============================================================
CREATE TABLE "ServerMonitorConfig" (
    "id"                   TEXT    NOT NULL PRIMARY KEY,
    "serverId"             TEXT    NOT NULL,
    "userId"               TEXT    NOT NULL,
    "enabled"              BOOLEAN NOT NULL DEFAULT false,
    "checkIntervalMinutes" INTEGER NOT NULL DEFAULT 5,
    "alertEmail"           BOOLEAN NOT NULL DEFAULT true,
    "alertPush"            BOOLEAN NOT NULL DEFAULT true,
    "failureThreshold"     INTEGER NOT NULL DEFAULT 3,
    "consecutiveFailures"  INTEGER NOT NULL DEFAULT 0,
    "alertSent"            BOOLEAN NOT NULL DEFAULT false,
    "lastCheckedAt"        DATETIME,
    "lastStatus"           BOOLEAN NOT NULL DEFAULT true,
    "createdAt"            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ServerMonitorConfig_serverId_fkey"
        FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ServerMonitorConfig_userId_fkey"
        FOREIGN KEY ("userId")   REFERENCES "User"("id")   ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ServerMonitorConfig_serverId_key" ON "ServerMonitorConfig"("serverId");
CREATE INDEX "ServerMonitorConfig_userId_idx"          ON "ServerMonitorConfig"("userId");
CREATE INDEX "ServerMonitorConfig_enabled_idx"         ON "ServerMonitorConfig"("enabled");

-- ============================================================
-- ServerHealthRecord
-- ============================================================
CREATE TABLE "ServerHealthRecord" (
    "id"          TEXT    NOT NULL PRIMARY KEY,
    "serverId"    TEXT    NOT NULL,
    "reachable"   BOOLEAN NOT NULL,
    "latencyMs"   INTEGER,
    "cpuPercent"  REAL,
    "ramPercent"  REAL,
    "diskPercent" REAL,
    "checkedAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ServerHealthRecord_serverId_fkey"
        FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ServerHealthRecord_serverId_checkedAt_idx" ON "ServerHealthRecord"("serverId", "checkedAt");
