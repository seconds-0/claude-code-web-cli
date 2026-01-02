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
# CONTROL_PLANE_IPS should be set during cloud-init (runtime provisioning).
# Multiple IPs can be specified as a space-separated list.
#
# NOTE: This script runs during Packer build. The iptables rules are applied
# when CONTROL_PLANE_IPS is set. If running during Packer build without
# CONTROL_PLANE_IPS, we install iptables-persistent but skip rules.
# Cloud-init should call configure-ttyd-firewall.sh with CONTROL_PLANE_IPS.
# ============================================

echo "Installing iptables-persistent for firewall persistence..."

# Install iptables-persistent (non-interactive)
DEBIAN_FRONTEND=noninteractive apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y iptables-persistent

# Create firewall configuration script for cloud-init to call
cat > /usr/local/bin/configure-ttyd-firewall.sh << 'FIREWALL_SCRIPT'
#!/bin/bash
set -euo pipefail

# This script is called during cloud-init with CONTROL_PLANE_IPS set
CONTROL_PLANE_IPS="${CONTROL_PLANE_IPS:-}"

if [ -z "$CONTROL_PLANE_IPS" ]; then
  echo "ERROR: CONTROL_PLANE_IPS not set - cannot configure firewall"
  echo "ttyd port 7681 will be accessible from any IP!"
  exit 1
fi

echo "Configuring iptables firewall rules for ttyd..."

# Validate and apply firewall rules
# Use -I (insert) to ensure rules take precedence over any default ACCEPT
for IP in $CONTROL_PLANE_IPS; do
  # Validate IPv4 format (with optional CIDR)
  if ! echo "$IP" | grep -qE '^([0-9]{1,3}\.){3}[0-9]{1,3}(/[0-9]{1,2})?$'; then
    echo "ERROR: Invalid IP address format: $IP"
    exit 1
  fi

  echo "Allowing ttyd access from control plane IP: $IP"
  iptables -I INPUT 1 -p tcp --dport 7681 -s "$IP" -j ACCEPT
done

# Drop all other connections to ttyd port (append after ACCEPT rules)
iptables -A INPUT -p tcp --dport 7681 -j DROP

# Persist iptables rules across reboots
mkdir -p /etc/iptables
iptables-save > /etc/iptables/rules.v4
netfilter-persistent save

echo "ttyd firewall rules configured and persisted successfully"
iptables -L INPUT -n --line-numbers | grep 7681 || true
FIREWALL_SCRIPT

chmod +x /usr/local/bin/configure-ttyd-firewall.sh

# If CONTROL_PLANE_IPS is set now (unlikely during Packer), configure firewall
CONTROL_PLANE_IPS="${CONTROL_PLANE_IPS:-}"
if [ -n "$CONTROL_PLANE_IPS" ]; then
  echo "CONTROL_PLANE_IPS is set, configuring firewall now..."
  /usr/local/bin/configure-ttyd-firewall.sh
else
  echo "INFO: CONTROL_PLANE_IPS not set during image build (expected)"
  echo "Firewall will be configured during cloud-init provisioning"
  echo "Cloud-init should run: CONTROL_PLANE_IPS='x.x.x.x' /usr/local/bin/configure-ttyd-firewall.sh"
fi

echo "ttyd installation complete!"
echo "Note: ttyd listens on all interfaces (0.0.0.0:7681)"
