#!/bin/bash
set -euo pipefail

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
# --interface tailscale0: Only listen on Tailscale interface (private)
# --url-arg: Allow URL query parameters for customization
# --credential <user>:<pass>: Can be added for basic auth (optional)
ExecStart=/usr/local/bin/ttyd \
    --writable \
    --port 7681 \
    --interface tailscale0 \
    --url-arg \
    /usr/bin/tmux new-session -A -s main

Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
SYSTEMD

# Reload systemd but don't enable yet (cloud-init will start it)
systemctl daemon-reload

echo "ttyd installation complete!"
echo "Note: ttyd will start on Tailscale interface only (tailscale0)"
