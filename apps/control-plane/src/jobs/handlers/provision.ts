/**
 * Provision Job Handler
 *
 * Handles the provisioning of new workspaces:
 * 1. Create Tailscale auth key
 * 2. Create/verify Hetzner volume
 * 3. Create Hetzner server with cloud-init
 * 4. Wait for server to be running
 * 5. Wait for Tailscale device to appear
 * 6. Update database with provisioned resources
 *
 * TRADE-OFF: Database operations are not wrapped in a transaction.
 * This is acceptable because:
 * 1. Provisioning is idempotent - failed jobs can be safely retried
 * 2. Partial state is captured in workspace status ("provisioning", "error")
 * 3. Cloud resources are tracked by hetznerServerId/hetznerVolumeId for cleanup
 * 4. The job queue provides retry semantics with max attempts
 * 5. Adding transactions would complicate error handling without clear benefit
 *
 * If strict atomicity becomes needed, use db.transaction() with proper rollback.
 */

import { eq } from "drizzle-orm";
import { getDb } from "../../db.js";
import { workspaces, workspaceVolumes, workspaceInstances } from "@ccc/db";
import { createHetznerService, type HetznerServer } from "../../services/hetzner.js";
import { createTailscaleService, type TailscaleDevice } from "../../services/tailscale.js";
import type { ProvisionJob } from "../queue.js";
import { generateCaptureToken, getTokensForUser } from "../../routes/anthropic.js";
import type { TokenBlob } from "../../services/encryption.js";

// Cloud-init template for user boxes
function generateCloudInit(params: {
  tailscaleAuthKey: string;
  hostname: string;
  volumeDevice?: string;
  sshPublicKey?: string;
  // Anthropic OAuth tokens (if user already authenticated)
  anthropicTokens?: TokenBlob;
  // Capture token for VM to send new tokens back to API
  captureToken?: string;
  // API URL for token capture
  apiUrl?: string;
}): string {
  const {
    tailscaleAuthKey,
    hostname,
    volumeDevice,
    sshPublicKey,
    anthropicTokens,
    captureToken,
    apiUrl,
  } = params;

  // Generate Claude credentials injection if user has tokens
  // Use JSON.stringify to safely escape any special characters in tokens
  const credentialsJson = anthropicTokens
    ? JSON.stringify({ claudeAiOauth: anthropicTokens }, null, 2)
    : "";

  const claudeCredsBlock = anthropicTokens
    ? `
  # Inject pre-existing Claude Code OAuth credentials
  - mkdir -p /home/coder/.claude
  - |
    cat > /home/coder/.claude/.credentials.json << 'CLAUDE_CREDS_EOF'
${credentialsJson
  .split("\n")
  .map((line) => "    " + line)
  .join("\n")}
    CLAUDE_CREDS_EOF
  - chmod 600 /home/coder/.claude/.credentials.json
  - chown -R coder:coder /home/coder/.claude
  `
    : "";

  // Generate capture token setup for new authentications
  const captureTokenBlock =
    captureToken && apiUrl
      ? `
  # Set up auth capture service for OAuth token capture
  - echo '${captureToken}' > /var/run/ccc-capture-token
  - chmod 600 /var/run/ccc-capture-token
  - mkdir -p /etc/systemd/system/claude-auth-capture.service.d
  - |
    cat > /etc/systemd/system/claude-auth-capture.service.d/env.conf << 'CAPTURE_ENV_EOF'
    [Service]
    Environment=CCC_API_URL=${apiUrl}
    CAPTURE_ENV_EOF
  - systemctl daemon-reload
  - systemctl start claude-auth-capture
  `
      : "";

  return `#cloud-config
hostname: ${hostname}

package_update: false
package_upgrade: false
${
  sshPublicKey
    ? `
users:
  - name: coder
    sudo: ALL=(ALL) NOPASSWD:ALL
    shell: /bin/bash
    ssh_authorized_keys:
      - ${sshPublicKey}
`
    : ""
}
runcmd:
  # Connect to Tailscale
  - tailscale up --authkey=${tailscaleAuthKey} --hostname=${hostname}

  # Wait for Tailscale interface to be ready (ttyd binds to tailscale0)
  - for i in $(seq 1 30); do tailscale status && break || sleep 2; done

  # Mount persistent volume if attached
  ${
    volumeDevice
      ? `
  - mkdir -p /mnt/workspace
  - mount ${volumeDevice} /mnt/workspace || echo "Volume mount failed, will retry"
  - chown coder:coder /mnt/workspace
  `
      : ""
  }
${claudeCredsBlock}
${captureTokenBlock}
  # Start ttyd terminal service
  - systemctl start ttyd

  # Signal that provisioning is complete
  - touch /var/run/ccc-provisioned
`;
}

/**
 * Generate a hostname for the workspace
 */
function generateHostname(workspaceId: string): string {
  // Use first 8 chars of workspace ID for hostname
  const shortId = workspaceId.replace(/-/g, "").slice(0, 8);
  return `ccc-${shortId}`;
}

/**
 * Main provision handler
 */
export async function handleProvisionJob(job: ProvisionJob): Promise<void> {
  const { workspaceId, userId } = job;
  const db = getDb();

  console.log(`[provision] Starting job ${job.id} for workspace ${workspaceId}`);

  // Load workspace with relations
  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, workspaceId),
    with: {
      volume: true,
      instance: true,
    },
  });

  if (!workspace) {
    throw new Error(`Workspace ${workspaceId} not found`);
  }

  if (workspace.userId !== userId) {
    throw new Error(`Workspace ${workspaceId} does not belong to user ${userId}`);
  }

  // Initialize services
  const hetzner = createHetznerService();
  const tailscale = createTailscaleService();

  const hostname = generateHostname(workspaceId);
  let hetznerServer: HetznerServer | null = null;
  let tailscaleDevice: TailscaleDevice | null = null;
  let volumeId: number | null = null;

  try {
    // Step 1: Update status to provisioning
    console.log(`[provision] Updating workspace status to provisioning`);
    await db
      .update(workspaces)
      .set({ status: "provisioning", updatedAt: new Date() })
      .where(eq(workspaces.id, workspaceId));

    await db
      .update(workspaceInstances)
      .set({ status: "starting", startedAt: new Date() })
      .where(eq(workspaceInstances.workspaceId, workspaceId));

    // Step 2: Create Tailscale auth key
    // Note: Tags require ACL configuration in Tailscale - omitting for now
    console.log(`[provision] Creating Tailscale auth key`);
    const authKey = await tailscale.createAuthKey({
      description: `ccc-workspace-${workspaceId}`,
      expirySeconds: 3600, // 1 hour
      ephemeral: true,
      preauthorized: true,
    });
    console.log(`[provision] Created Tailscale auth key: ${authKey.id}`);

    // Step 3: Create or verify Hetzner volume
    if (!workspace.volume?.hetznerVolumeId) {
      console.log(`[provision] Creating Hetzner volume`);
      const volumeResult = await hetzner.createVolume({
        name: `ccc-vol-${hostname}`,
        size: workspace.volume?.sizeGb || 20,
        location: process.env["HETZNER_LOCATION"] || "nbg1",
        format: "ext4",
        labels: {
          "ccc-workspace": workspaceId,
          "ccc-user": userId,
        },
      });

      volumeId = volumeResult.volume.id;

      // Wait for volume to be available
      await hetzner.waitForAction(volumeResult.action.id);
      console.log(`[provision] Created Hetzner volume: ${volumeId}`);

      // Update volume record
      await db
        .update(workspaceVolumes)
        .set({ hetznerVolumeId: String(volumeId), status: "available" })
        .where(eq(workspaceVolumes.workspaceId, workspaceId));
    } else {
      volumeId = parseInt(workspace.volume.hetznerVolumeId, 10);
      console.log(`[provision] Using existing Hetzner volume: ${volumeId}`);
    }

    // Step 4: Get volume details for device path
    const volume = await hetzner.getVolume(volumeId);
    const volumeDevice = volume?.linux_device;

    // Step 5: Get user's Anthropic tokens (if they have any)
    console.log(`[provision] Checking for existing Anthropic credentials`);
    const anthropicTokens = await getTokensForUser(userId);
    if (anthropicTokens) {
      console.log(`[provision] User has existing Anthropic credentials, will inject`);
    }

    // Step 6: Generate capture token for new authentications
    console.log(`[provision] Generating capture token for OAuth`);
    const captureToken = await generateCaptureToken(userId, workspaceId);
    const apiUrl = process.env["PUBLIC_API_URL"] || process.env["API_URL"];

    // Step 7: Create Hetzner server
    console.log(`[provision] Creating Hetzner server`);
    const imageId = process.env["HETZNER_PACKER_IMAGE_ID"];
    if (!imageId) {
      throw new Error("HETZNER_PACKER_IMAGE_ID environment variable is required");
    }

    const cloudInit = generateCloudInit({
      tailscaleAuthKey: authKey.key,
      hostname,
      volumeDevice,
      sshPublicKey: process.env["SSH_PUBLIC_KEY"],
      anthropicTokens: anthropicTokens || undefined,
      captureToken,
      apiUrl,
    });

    const serverResult = await hetzner.createServer({
      name: hostname,
      serverType: (process.env["HETZNER_SERVER_TYPE"] as "cpx11") || "cpx11",
      location: process.env["HETZNER_LOCATION"] || "nbg1",
      image: parseInt(imageId, 10),
      userData: cloudInit,
      volumes: [volumeId],
      labels: {
        "ccc-workspace": workspaceId,
        "ccc-user": userId,
      },
    });

    hetznerServer = serverResult.server;
    console.log(`[provision] Created Hetzner server: ${hetznerServer.id}`);

    // Step 6: Wait for server to be running
    console.log(`[provision] Waiting for server to be running`);
    await hetzner.waitForAction(serverResult.action.id);
    hetznerServer = await hetzner.waitForServerStatus(hetznerServer.id, "running");
    console.log(`[provision] Server is running`);

    // Update instance with Hetzner server ID and public IP
    const publicIp = hetznerServer.public_net.ipv4.ip;
    console.log(`[provision] Server public IP: ${publicIp}`);
    await db
      .update(workspaceInstances)
      .set({ hetznerServerId: String(hetznerServer.id), publicIp })
      .where(eq(workspaceInstances.workspaceId, workspaceId));

    // Step 7: Wait for Tailscale device to appear
    console.log(`[provision] Waiting for Tailscale device`);
    tailscaleDevice = await tailscale.waitForDevice(hostname, {
      timeoutMs: 180_000, // 3 minutes
      pollIntervalMs: 5000,
    });

    const tailscaleIp = tailscale.getDeviceIp(tailscaleDevice);
    console.log(`[provision] Tailscale device connected: ${tailscaleDevice.id} (${tailscaleIp})`);

    // Step 8: Update database with final state
    await db
      .update(workspaceInstances)
      .set({
        tailscaleIp,
        status: "running",
      })
      .where(eq(workspaceInstances.workspaceId, workspaceId));

    await db
      .update(workspaces)
      .set({ status: "ready", updatedAt: new Date() })
      .where(eq(workspaces.id, workspaceId));

    console.log(`[provision] Workspace ${workspaceId} provisioned successfully`);
  } catch (error) {
    console.error(`[provision] Error provisioning workspace ${workspaceId}:`, error);

    // Update status to error
    await db
      .update(workspaces)
      .set({ status: "error", updatedAt: new Date() })
      .where(eq(workspaces.id, workspaceId));

    await db
      .update(workspaceInstances)
      .set({ status: "stopped", stoppedAt: new Date() })
      .where(eq(workspaceInstances.workspaceId, workspaceId));

    // Clean up resources on error (best effort)
    try {
      if (hetznerServer) {
        console.log(`[provision] Cleaning up server ${hetznerServer.id}`);
        await hetzner.deleteServer(hetznerServer.id);
      }
      if (tailscaleDevice) {
        console.log(`[provision] Cleaning up Tailscale device ${tailscaleDevice.id}`);
        await tailscale.deleteDevice(tailscaleDevice.id);
      }
    } catch (cleanupError) {
      console.error(`[provision] Error during cleanup:`, cleanupError);
    }

    throw error;
  }
}
