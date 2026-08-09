CREATE TABLE "DeploymentIdentity" (
    "key" TEXT NOT NULL,
    "installId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeploymentIdentity_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "TelemetryInstallation" (
    "id" TEXT NOT NULL,
    "product" TEXT NOT NULL,
    "installId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "deploymentType" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "heartbeatCount" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "TelemetryInstallation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DeploymentIdentity_installId_key" ON "DeploymentIdentity"("installId");
CREATE UNIQUE INDEX "TelemetryInstallation_product_installId_key" ON "TelemetryInstallation"("product", "installId");
CREATE INDEX "TelemetryInstallation_lastSeenAt_idx" ON "TelemetryInstallation"("lastSeenAt");
CREATE INDEX "TelemetryInstallation_product_lastSeenAt_idx" ON "TelemetryInstallation"("product", "lastSeenAt");
