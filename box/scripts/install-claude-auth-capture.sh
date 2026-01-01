#!/bin/bash
set -euo pipefail

echo "=== Installing Claude Auth Capture Service ==="

# Install inotify-tools for file watching
apt-get update && apt-get install -y inotify-tools jq

# Create the auth capture script
cat > /usr/local/bin/claude-auth-capture << 'SCRIPT'
#!/bin/bash
# Claude Auth Capture - sends OAuth credentials to control plane
# Called when ~/.claude/.credentials.json is created/modified

set -euo pipefail

CREDENTIALS_FILE="$HOME/.claude/.credentials.json"
CAPTURE_TOKEN_FILE="/var/run/ccc-capture-token"
API_URL="${CCC_API_URL:-}"

log() {
    echo "[claude-auth-capture] $*" | logger -t claude-auth-capture
}

send_credentials() {
    if [ ! -f "$CREDENTIALS_FILE" ]; then
        log "No credentials file found"
        return 1
    fi

    if [ ! -f "$CAPTURE_TOKEN_FILE" ]; then
        log "No capture token found"
        return 1
    fi

    if [ -z "$API_URL" ]; then
        log "No API URL configured"
        return 1
    fi

    CAPTURE_TOKEN=$(cat "$CAPTURE_TOKEN_FILE")
    CREDENTIALS=$(cat "$CREDENTIALS_FILE")

    log "Sending credentials to API..."

    RESPONSE=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $CAPTURE_TOKEN" \
        -d "{\"credentials\": $CREDENTIALS}" \
        "${API_URL}/api/v1/anthropic/capture" 2>&1) || true

    if echo "$RESPONSE" | grep -q '"success":true'; then
        log "Credentials captured successfully"
        # Remove capture token after successful capture (one-time use)
        rm -f "$CAPTURE_TOKEN_FILE"
        return 0
    else
        log "Failed to capture credentials: $RESPONSE"
        return 1
    fi
}

watch_credentials() {
    log "Starting credential watcher..."

    WATCH_DIR="$HOME/.claude"
    mkdir -p "$WATCH_DIR"

    # Send immediately if file exists
    if [ -f "$CREDENTIALS_FILE" ]; then
        send_credentials
    fi

    # Watch for file creation/modification
    inotifywait -m -e create -e modify "$WATCH_DIR" 2>/dev/null | while read -r dir event file; do
        if [ "$file" = ".credentials.json" ]; then
            log "Credentials file changed ($event)"
            sleep 1  # Brief delay for file to be fully written
            send_credentials
        fi
    done
}

# Command interface
case "${1:-watch}" in
    watch)
        watch_credentials
        ;;
    send)
        send_credentials
        ;;
    *)
        echo "Usage: claude-auth-capture [watch|send]"
        exit 1
        ;;
esac
SCRIPT

chmod +x /usr/local/bin/claude-auth-capture

# Create systemd service for the watcher
cat > /etc/systemd/system/claude-auth-capture.service << 'SERVICE'
[Unit]
Description=Claude OAuth Credential Capture Service
After=network.target tailscaled.service

[Service]
Type=simple
User=coder
Group=coder
Environment=HOME=/home/coder
ExecStart=/usr/local/bin/claude-auth-capture watch
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
SERVICE

# Create drop-in directory for environment overrides
mkdir -p /etc/systemd/system/claude-auth-capture.service.d

# Enable but don't start (cloud-init will start it with proper config)
systemctl daemon-reload
systemctl enable claude-auth-capture

echo "Claude auth capture service installed!"
echo "Service will be started by cloud-init with proper API URL"
