#!/bin/bash
set -euo pipefail

echo "=== Installing Tailscale ==="

# Add Tailscale repository
echo "Adding Tailscale repository..."
curl -fsSL https://pkgs.tailscale.com/stable/ubuntu/jammy.noarmor.gpg | \
    tee /usr/share/keyrings/tailscale-archive-keyring.gpg > /dev/null

curl -fsSL https://pkgs.tailscale.com/stable/ubuntu/jammy.tailscale-keyring.list | \
    tee /etc/apt/sources.list.d/tailscale.list

# Install Tailscale
echo "Installing Tailscale..."
apt-get update
apt-get install -y tailscale

# Enable Tailscale service (but don't start - cloud-init will do that)
systemctl enable tailscaled

echo "Tailscale installation complete!"
echo "Note: Tailscale will be connected via cloud-init with an auth key"
