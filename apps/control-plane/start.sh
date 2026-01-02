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
if [ -n "$TAILSCALE_AUTHKEY" ]; then
  echo "Authenticating with Tailscale..."
  tailscale up --authkey="$TAILSCALE_AUTHKEY" --hostname="control-plane-railway"
  echo "Tailscale authenticated successfully"
else
  echo "WARNING: TAILSCALE_AUTHKEY not set - terminal relay will not work!"
fi

# Show Tailscale status
tailscale status || echo "Tailscale status check failed"

# Start the Node.js application
echo "Starting control-plane..."
exec node apps/control-plane/dist/index.js
