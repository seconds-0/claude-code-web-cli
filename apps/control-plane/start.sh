#!/bin/sh
# Control-plane startup script with Tailscale

set -e

# Start tailscaled in userspace networking mode (no kernel support needed)
# Use STATE_DIRECTORY for persistent state
tailscaled --tun=userspace-networking --socks5-server=localhost:1055 --state=/var/lib/tailscale/tailscaled.state &
TAILSCALED_PID=$!

# Wait for tailscaled to be ready
sleep 2

# Authenticate with Tailscale using auth key from environment
# Note: Tailscale is optional - public IP relay is the primary method
if [ -n "$TAILSCALE_AUTHKEY" ]; then
  echo "Authenticating with Tailscale..."
  # Use unique hostname to avoid collisions when multiple replicas exist
  HOSTNAME="control-plane-${RAILWAY_REPLICA_ID:-$(hostname)}"
  tailscale up --authkey="$TAILSCALE_AUTHKEY" --hostname="$HOSTNAME"
  echo "Tailscale authenticated successfully as $HOSTNAME"
else
  echo "INFO: TAILSCALE_AUTHKEY not set - using public IP relay only"
fi

# Show Tailscale status
tailscale status || echo "Tailscale status check failed"

# Start the Node.js application
echo "Starting control-plane..."
exec node apps/control-plane/dist/index.js
