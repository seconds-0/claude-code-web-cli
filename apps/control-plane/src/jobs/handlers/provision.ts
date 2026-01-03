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
import { createCostService } from "../../services/costs.js";
import type { ProvisionJob } from "../queue.js";
import { generateCaptureToken, getTokensForUser } from "../../routes/anthropic.js";
import type { TokenBlob } from "../../services/encryption.js";

// Cloud-init template for user boxes
// Exported for testing
export function generateCloudInit(params: {
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
  // Control plane IPs for firewall allowlist (space-separated)
  controlPlaneIps?: string;
  // Private mode - if false, direct connect is used and Tailscale wait is optional
  privateMode?: boolean;
}): string {
  const {
    tailscaleAuthKey,
    hostname,
    volumeDevice,
    sshPublicKey,
    anthropicTokens,
    captureToken,
    apiUrl,
    controlPlaneIps,
    privateMode = false,
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

  // Generate firewall configuration block if control plane IPs are provided
  // Uses inline iptables rules instead of external script for reliability
  const firewallBlock = controlPlaneIps
    ? `
  # Configure ttyd firewall to restrict access to control plane only
  - |
    echo "Configuring ttyd firewall with inline iptables..."
    # Drop all traffic to ttyd port by default
    iptables -A INPUT -p tcp --dport 7681 -j DROP
    # Allow traffic from specified control plane IPs
    for ip in ${controlPlaneIps}; do
      iptables -I INPUT -p tcp --dport 7681 -s "$ip" -j ACCEPT
      echo "Allowed ttyd access from $ip"
    done
    # Also allow localhost for debugging
    iptables -I INPUT -p tcp --dport 7681 -s 127.0.0.1 -j ACCEPT
  `
    : `
  # WARNING: CONTROL_PLANE_IPS not set - ttyd accessible from any IP
  - echo "WARNING: ttyd port 7681 is accessible from any IP (CONTROL_PLANE_IPS not configured)"
  `;

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
  # Connect to Tailscale (non-blocking in direct connect mode)
  ${
    privateMode
      ? `
  - tailscale up --authkey=${tailscaleAuthKey} --hostname=${hostname}
  # Wait for Tailscale interface in private mode (required for connectivity)
  - for i in $(seq 1 30); do tailscale status && break || sleep 2; done
  `
      : `
  # Direct connect mode: start Tailscale but don't wait - we have public IP
  - tailscale up --authkey=${tailscaleAuthKey} --hostname=${hostname} || echo "Tailscale optional in direct mode"
  `
  }

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
  # Wait for network interface to be ready before starting ttyd
  - |
    echo "Waiting for network interface..."
    for i in $(seq 1 30); do
      if ip addr show | grep -q 'scope global'; then
        echo "Network interface ready"
        break
      fi
      sleep 1
    done
${firewallBlock}
  # Start ttyd terminal service
  - systemctl start ttyd

  # Verify ttyd is running
  - |
    sleep 2
    if systemctl is-active --quiet ttyd; then
      echo "ttyd started successfully"
    else
      echo "ttyd failed to start, checking status..."
      systemctl status ttyd || true
      journalctl -u ttyd --no-pager -n 20 || true
    fi

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
  const costs = createCostService(db);

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

      // Record volume cost event
      await costs.recordVolumeCreate({
        workspaceId,
        userId,
        volumeId: String(volumeId),
        sizeGb: workspace.volume?.sizeGb || 20,
      });
      console.log(`[provision] Recorded volume create cost event`);
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

    // Security warning if CONTROL_PLANE_IPS is not configured
    const controlPlaneIps = process.env["CONTROL_PLANE_IPS"];
    if (!controlPlaneIps) {
      console.warn(
        `[provision] WARNING: CONTROL_PLANE_IPS not set - ttyd port 7681 will be open to any IP!`
      );
    } else {
      console.log(`[provision] Firewall will restrict ttyd to: ${controlPlaneIps}`);
    }

    const cloudInit = generateCloudInit({
      tailscaleAuthKey: authKey.key,
      hostname,
      volumeDevice,
      sshPublicKey: process.env["SSH_PUBLIC_KEY"],
      anthropicTokens: anthropicTokens || undefined,
      captureToken,
      apiUrl,
      controlPlaneIps: process.env["CONTROL_PLANE_IPS"],
      privateMode: workspace.privateMode,
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

    // Update instance with Hetzner server ID, public IP, and server type
    const publicIp = hetznerServer.public_net.ipv4.ip;
    const serverType = process.env["HETZNER_SERVER_TYPE"] || "cpx11";
    console.log(`[provision] Server public IP: ${publicIp}, type: ${serverType}`);
    await db
      .update(workspaceInstances)
      .set({ hetznerServerId: String(hetznerServer.id), publicIp, serverType })
      .where(eq(workspaceInstances.workspaceId, workspaceId));

    // Record server start cost event
    await costs.recordServerStart({
      workspaceId,
      userId,
      serverId: String(hetznerServer.id),
      serverType,
    });
    console.log(`[provision] Recorded server start cost event`);

    // Step 7: Wait for Tailscale device (optional for direct connect mode)
    // If we have a public IP, we can use direct connect and Tailscale is not required
    let tailscaleIp: string | null = null;
    console.log(`[provision] Waiting for Tailscale device (optional, have public IP: ${publicIp})`);
    try {
      tailscaleDevice = await tailscale.waitForDevice(hostname, {
        timeoutMs: publicIp ? 60_000 : 180_000, // Shorter timeout if we have direct connect
        pollIntervalMs: 5000,
      });
      tailscaleIp = tailscale.getDeviceIp(tailscaleDevice);
      console.log(`[provision] Tailscale device connected: ${tailscaleDevice.id} (${tailscaleIp})`);
    } catch (tailscaleError) {
      if (publicIp) {
        console.warn(
          `[provision] Tailscale device did not appear, but direct connect available via ${publicIp}`
        );
      } else {
        // No public IP and no Tailscale - this is a real failure
        throw tailscaleError;
      }
    }

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

    console.log(
      `[provision] Workspace ${workspaceId} provisioned successfully (direct: ${!!publicIp}, tailscale: ${!!tailscaleIp})`
    );
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
      // Use type assertion to help TypeScript understand tailscaleDevice may have been assigned
      const deviceToCleanup = tailscaleDevice as TailscaleDevice | null;
      if (deviceToCleanup) {
        console.log(`[provision] Cleaning up Tailscale device ${deviceToCleanup.id}`);
        await tailscale.deleteDevice(deviceToCleanup.id);
      }
    } catch (cleanupError) {
      console.error(`[provision] Error during cleanup:`, cleanupError);
    }

    throw error;
  }
}
