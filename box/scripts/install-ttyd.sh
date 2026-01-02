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
After=network.target tailscaled.service

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

[Install]
WantedBy=multi-user.target
SYSTEMD

# Reload systemd but don't enable yet (cloud-init will start it)
systemctl daemon-reload

# ============================================
# SECURITY: Firewall rules for ttyd
# ============================================
# Restrict port 7681 to only accept connections from control plane IPs.
# The control plane relays terminal connections - direct access is not allowed.
#
# CONTROL_PLANE_IPS should be set in the provisioning environment.
# Multiple IPs can be specified as a space-separated list.
# ============================================

echo "Configuring iptables firewall rules for ttyd..."

# Control plane IPs (Railway static egress IPs)
# These should be updated if Railway infrastructure changes
CONTROL_PLANE_IPS="${CONTROL_PLANE_IPS:-}"

if [ -n "$CONTROL_PLANE_IPS" ]; then
  for IP in $CONTROL_PLANE_IPS; do
    echo "Allowing ttyd access from control plane IP: $IP"
    iptables -A INPUT -p tcp --dport 7681 -s "$IP" -j ACCEPT
  done

  # Drop all other connections to ttyd port
  iptables -A INPUT -p tcp --dport 7681 -j DROP

  # Persist iptables rules
  if command -v iptables-save >/dev/null 2>&1; then
    mkdir -p /etc/iptables
    iptables-save > /etc/iptables/rules.v4
    echo "iptables rules saved to /etc/iptables/rules.v4"
  fi

  echo "ttyd firewall rules configured successfully"
else
  echo "WARNING: CONTROL_PLANE_IPS not set - ttyd accessible from any IP!"
  echo "Set CONTROL_PLANE_IPS environment variable during provisioning."
fi

echo "ttyd installation complete!"
echo "Note: ttyd listens on all interfaces (0.0.0.0:7681)"
