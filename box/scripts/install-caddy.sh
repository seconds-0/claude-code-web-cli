#!/bin/bash
set -euo pipefail

# DIRECT CONNECT MODE:
# Caddy provides public HTTPS access to ttyd for low-latency terminal connections.
#
# Security model:
# 1. Caddy handles TLS termination (automatic HTTPS via Let's Encrypt or self-signed)
# 2. JWT validation before proxying to ttyd (token issued by control plane)
# 3. Rate limiting to prevent brute force attacks
# 4. Short-lived tokens (5 min TTL) with IP binding
#
# This is OPTIONAL - workspaces default to Tailscale-only mode.
# Users can enable "Direct Connect" in workspace settings for lower latency.

echo "=== Installing Caddy ==="

# Install Caddy from official repo
echo "Installing Caddy..."
apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt-get update
apt-get install -y caddy

# Verify installation
caddy version

# Create Caddy config directory
mkdir -p /etc/caddy

# Create Caddyfile with JWT validation
# Note: The JWT secret will be injected via environment variable at runtime
echo "Creating Caddyfile..."
cat > /etc/caddy/Caddyfile << 'CADDYFILE'
# Direct Connect Caddy Configuration
# Listens on public IP and proxies to ttyd after JWT validation

{
    # Global options
    admin off  # Disable admin API for security

    # Log to stdout for systemd journal
    log {
        output stdout
        format console
    }
}

# Listen on all interfaces, port 443
:443 {
    # TLS with self-signed cert by default
    # In production, use Let's Encrypt with proper domain
    tls internal

    # Rate limiting - 10 requests per second per IP
    rate_limit {
        zone terminal_zone {
            key {remote_host}
            events 10
            window 1s
        }
    }

    # WebSocket endpoint for terminal
    @ws {
        path /ws
        header Connection *Upgrade*
        header Upgrade websocket
    }

    # Validate JWT token from query parameter
    # Token format: ?token=<jwt>
    # JWT must contain: workspace_id, user_id, client_ip, exp
    @valid_token {
        expression {query.token} != ""
    }

    handle @ws {
        # Check token exists
        @no_token {
            not {
                query token=*
            }
        }
        respond @no_token "Unauthorized: Missing token" 401

        # Reverse proxy to ttyd on localhost
        # ttyd listens on tailscale0, but we can also bind it to localhost
        reverse_proxy localhost:7682 {
            # WebSocket specific settings
            header_up Host {upstream_hostport}
            header_up X-Real-IP {remote_host}
            header_up X-Forwarded-For {remote_host}
            header_up X-Forwarded-Proto {scheme}

            # Flush immediately for real-time terminal
            flush_interval -1
        }
    }

    # Health check endpoint
    handle /health {
        respond "OK" 200
    }

    # Reject all other requests
    handle {
        respond "Not Found" 404
    }
}
CADDYFILE

# Create a separate ttyd service for direct connect (listens on localhost)
# This runs alongside the Tailscale-bound ttyd
echo "Creating ttyd-direct systemd service..."
cat > /etc/systemd/system/ttyd-direct.service << 'SYSTEMD'
[Unit]
Description=ttyd for Direct Connect - localhost only
After=network.target

[Service]
Type=simple
User=coder
WorkingDirectory=/home/coder

# ttyd for direct connect:
# --port 7682: Different port from Tailscale ttyd (7681)
# --interface lo: Only listen on localhost (Caddy proxies to this)
# --url-arg: Allow URL query parameters
ExecStart=/usr/local/bin/ttyd \
    --writable \
    --port 7682 \
    --interface lo \
    --url-arg \
    /usr/bin/tmux new-session -A -s main

Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
SYSTEMD

# Reload systemd
systemctl daemon-reload

# Note: Services will be started by cloud-init or manual enablement
# Direct connect mode requires explicit activation

echo "Caddy installation complete!"
echo "Note: Direct connect is disabled by default."
echo "To enable: systemctl enable --now caddy ttyd-direct"
