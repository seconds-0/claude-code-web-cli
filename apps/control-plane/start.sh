#!/bin/sh
# Control-plane startup script
# Tailscale is optional - only start if TAILSCALE_AUTHKEY is provided

echo "Starting control-plane..."

# Start Tailscale if auth key is provided (optional for private networking)
if [ -n "$TAILSCALE_AUTHKEY" ]; then
  echo "TAILSCALE_AUTHKEY provided - starting Tailscale..."
  # Start tailscaled in userspace networking mode
  tailscaled --tun=userspace-networking --socks5-server=localhost:1055 --state=/var/lib/tailscale/tailscaled.state &
  sleep 2

  # Authenticate with Tailscale
  HOSTNAME="control-plane-${RAILWAY_REPLICA_ID:-$(hostname)}"
  tailscale up --authkey="$TAILSCALE_AUTHKEY" --hostname="$HOSTNAME" || echo "Tailscale auth failed (non-fatal)"
  tailscale status || echo "Tailscale status check failed (non-fatal)"
else
  echo "No TAILSCALE_AUTHKEY - using public IP relay only (default mode)"
fi

# Start the Node.js application
exec node apps/control-plane/dist/index.js
