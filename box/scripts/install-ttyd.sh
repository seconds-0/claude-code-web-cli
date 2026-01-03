#!/bin/bash
set -euo pipefail

# SECURITY MODEL:
# ttyd runs on all interfaces (0.0.0.0) for public IP access.
# Security is provided by:
# 1. Gateway validates session tokens before proxying WebSocket requests
# 2. Port 7681 is not commonly scanned and URL path is specific
# 3. Session tokens are short-lived and workspace-scoped
#
# TODO: Add iptables firewall rules to limit access to known gateway IPs
# or add basic auth credentials passed through the relay.

echo "=== Installing ttyd ==="

# ttyd version
TTYD_VERSION="1.7.7"
TTYD_URL="https://github.com/tsl0922/ttyd/releases/download/${TTYD_VERSION}/ttyd.x86_64"

# Download ttyd
echo "Downloading ttyd ${TTYD_VERSION}..."
curl -fsSL "${TTYD_URL}" -o /usr/local/bin/ttyd
chmod +x /usr/local/bin/ttyd

# Verify installation
ttyd --version

# Create ttyd systemd service
echo "Creating ttyd systemd service..."
cat > /etc/systemd/system/ttyd.service << 'SYSTEMD'
[Unit]
Description=ttyd - Share terminal over HTTP
# Only depend on network - tailscale is optional for direct connect mode
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=coder
WorkingDirectory=/home/coder

# ttyd configuration:
# --writable: Allow terminal input (not read-only)
# --port 7681: Listen on port 7681
# --url-arg: Allow URL query parameters for customization
ExecStart=/usr/local/bin/ttyd \
    --writable \
    --port 7681 \
    --url-arg \
    /usr/bin/tmux new-session -A -s main

Restart=on-failure
RestartSec=5

# Ensure service starts even if startup is slow
TimeoutStartSec=30

[Install]
WantedBy=multi-user.target
SYSTEMD

# Reload and enable ttyd to start on boot
# This ensures ttyd runs even if cloud-init fails
systemctl daemon-reload
systemctl enable ttyd

# ============================================
# SECURITY: Firewall rules for ttyd
# ============================================
# Firewall rules are now configured at runtime via cloud-init.
# The control plane sets CONTROL_PLANE_IPS and configures iptables
# when the workspace is provisioned. This allows dynamic IP configuration.
# ============================================

echo "ttyd installation complete!"
echo "Note: ttyd listens on all interfaces (0.0.0.0:7681)"
echo "Note: ttyd is enabled to start on boot"
echo "Note: Firewall rules will be configured at runtime via cloud-init"
