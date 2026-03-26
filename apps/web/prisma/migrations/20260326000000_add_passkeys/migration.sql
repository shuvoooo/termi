-- AlterTable: add passkeyEnabled to User
ALTER TABLE "User" ADD COLUMN "passkeyEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable: Passkey (WebAuthn credentials)
CREATE TABLE "Passkey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Passkey',
    "credentialID" TEXT NOT NULL,
    "credentialPublicKey" BYTEA NOT NULL,
    "counter" BIGINT NOT NULL DEFAULT 0,
    "deviceType" TEXT NOT NULL,
    "backedUp" BOOLEAN NOT NULL DEFAULT false,
    "transports" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "Passkey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Passkey_credentialID_key" ON "Passkey"("credentialID");
CREATE INDEX "Passkey_userId_idx" ON "Passkey"("userId");

-- AddForeignKey
ALTER TABLE "Passkey" ADD CONSTRAINT "Passkey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterEnum: add passkey audit actions
ALTER TYPE "AuditAction" ADD VALUE 'PASSKEY_REGISTERED';
ALTER TYPE "AuditAction" ADD VALUE 'PASSKEY_REMOVED';
ALTER TYPE "AuditAction" ADD VALUE 'PASSKEY_USED';
