#!/bin/bash
set -euo pipefail

echo "=== Installing Claude Wrapper with Enhanced Auth UX ==="

# Install qrencode for terminal QR codes
apt-get update && apt-get install -y qrencode

# Create the enhanced claude wrapper
cat > /usr/local/bin/claude-enhanced << 'WRAPPER'
#!/bin/bash
# Enhanced Claude wrapper with better OAuth UX
# Shows QR codes, clickable links, and detects auth completion

CREDENTIALS_FILE="$HOME/.claude/.credentials.json"
REAL_CLAUDE="/usr/local/bin/claude-real"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# Check if already authenticated
check_auth() {
    if [ -f "$CREDENTIALS_FILE" ]; then
        # Check if tokens are valid (not expired)
        if command -v jq &> /dev/null; then
            EXPIRES_AT=$(jq -r '.claudeAiOauth.expiresAt // empty' "$CREDENTIALS_FILE" 2>/dev/null)
            if [ -n "$EXPIRES_AT" ]; then
                EXPIRES_TS=$(date -d "$EXPIRES_AT" +%s 2>/dev/null || echo "0")
                NOW_TS=$(date +%s)
                if [ "$EXPIRES_TS" -gt "$NOW_TS" ]; then
                    return 0  # Authenticated and not expired
                fi
            fi
        else
            return 0  # Assume valid if jq not available
        fi
    fi
    return 1  # Not authenticated
}

# Show welcome banner
show_banner() {
    echo ""
    echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║${NC}  ${BOLD}Claude Code Cloud${NC}                                          ${CYAN}║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

# Show auth required message with QR code
show_auth_prompt() {
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "  ${BOLD}Authentication Required${NC}"
    echo ""
    echo -e "  Claude Code needs to connect to your Anthropic account."
    echo -e "  This is a one-time setup - future workspaces will be pre-authenticated."
    echo ""
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "  ${BOLD}How to authenticate:${NC}"
    echo ""
    echo -e "  ${GREEN}1.${NC} Press Enter to start authentication"
    echo -e "  ${GREEN}2.${NC} A browser will open (or you'll see a URL to copy)"
    echo -e "  ${GREEN}3.${NC} Sign in with your Anthropic account"
    echo -e "  ${GREEN}4.${NC} Return here when complete"
    echo ""
}

# Show clickable URL and QR code
show_oauth_url() {
    local url="$1"

    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "  ${BOLD}Open this URL to authenticate:${NC}"
    echo ""
    # Make URL clickable in terminal (OSC 8 hyperlink)
    echo -e "  \e]8;;${url}\e\\${CYAN}${url}\e]8;;\e\\"
    echo ""

    # Show QR code if qrencode is available
    if command -v qrencode &> /dev/null; then
        echo -e "  ${BOLD}Or scan this QR code with your phone:${NC}"
        echo ""
        qrencode -t ANSIUTF8 -m 2 "$url" | sed 's/^/    /'
        echo ""
    fi

    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
}

# Show auth success message
show_auth_success() {
    echo ""
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "  ${GREEN}✓${NC} ${BOLD}Authentication Successful!${NC}"
    echo ""
    echo -e "  Your credentials have been saved. Future workspaces will"
    echo -e "  be automatically authenticated."
    echo ""
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
}

# Main logic
main() {
    show_banner

    if check_auth; then
        echo -e "  ${GREEN}✓${NC} Already authenticated"
        echo ""
        exec "$REAL_CLAUDE" "$@"
    fi

    show_auth_prompt

    echo -e "  Press ${BOLD}Enter${NC} to continue or ${BOLD}Ctrl+C${NC} to cancel..."
    read -r

    # Watch for credentials file in background
    (
        while true; do
            if [ -f "$CREDENTIALS_FILE" ]; then
                # Trigger auth capture service
                /usr/local/bin/claude-auth-capture send 2>/dev/null || true
                break
            fi
            sleep 1
        done
    ) &
    WATCHER_PID=$!

    # Run real claude (which will trigger OAuth)
    echo ""
    echo -e "  Starting Claude Code authentication..."
    echo ""

    # Capture OAuth URL from claude output
    "$REAL_CLAUDE" "$@" 2>&1 | while IFS= read -r line; do
        # Check if line contains OAuth URL
        if [[ "$line" == *"claude.ai/oauth"* ]] || [[ "$line" == *"console.anthropic.com"* ]]; then
            # Extract URL
            URL=$(echo "$line" | grep -oP 'https://[^\s]+' | head -1)
            if [ -n "$URL" ]; then
                show_oauth_url "$URL"
            fi
        fi
        echo "$line"
    done

    CLAUDE_EXIT=$?

    # Kill watcher
    kill $WATCHER_PID 2>/dev/null || true

    # Check if auth succeeded
    if check_auth; then
        show_auth_success
    fi

    return $CLAUDE_EXIT
}

main "$@"
WRAPPER

chmod +x /usr/local/bin/claude-enhanced

# Move real claude binary and create symlink
if [ -f /usr/local/bin/claude ] && [ ! -f /usr/local/bin/claude-real ]; then
    # Find actual claude binary location
    CLAUDE_BIN=$(which claude 2>/dev/null || echo "/usr/local/bin/claude")
    if [ -L "$CLAUDE_BIN" ]; then
        # It's a symlink, get the real path
        REAL_PATH=$(readlink -f "$CLAUDE_BIN")
        mv "$REAL_PATH" /usr/local/bin/claude-real
        ln -sf /usr/local/bin/claude-real "$REAL_PATH"
    else
        mv "$CLAUDE_BIN" /usr/local/bin/claude-real
    fi
    ln -sf /usr/local/bin/claude-enhanced /usr/local/bin/claude
fi

echo "Claude wrapper installed!"
echo "Users will see QR codes and clickable links during OAuth"
