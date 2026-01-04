#!/bin/bash
set -euo pipefail

echo "=== Installing Claude Code CLI (Native) ==="

# Install Claude Code CLI using the official native installer
# This is the recommended installation method - no Node.js dependency
# https://code.claude.com/docs/en/setup
echo "Installing Claude Code CLI via native installer..."

# Run as coder user since the native installer installs to ~/.local/bin
sudo -u coder bash -c 'curl -fsSL https://claude.ai/install.sh | bash'

# Verify installation
echo "Verifying installation..."
sudo -u coder /home/coder/.local/bin/claude --version || echo "Claude CLI installed (version check may require API key)"

# Create claude config directory for coder user
mkdir -p /home/coder/.config/claude
chown -R coder:coder /home/coder/.config

# Create a placeholder config (API key will be provided at runtime)
cat > /home/coder/.config/claude/config.json << 'CONFIG'
{
  "theme": "dark",
  "editor": "vim"
}
CONFIG
chown coder:coder /home/coder/.config/claude/config.json

# Add claude to coder's path profile
cat >> /home/coder/.bashrc << 'BASHRC'

# Claude Code CLI (native installation)
export PATH="$HOME/.local/bin:$PATH"
export ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-}"

# Alias for quick access
alias cc='claude'

# Welcome message
if [ -n "$ANTHROPIC_API_KEY" ]; then
    echo "Claude Code CLI is ready. Run 'claude' to start."
else
    echo "Set ANTHROPIC_API_KEY to use Claude Code CLI."
fi
BASHRC

echo "Claude Code CLI installation complete!"
echo "Note: Users need to set ANTHROPIC_API_KEY environment variable"
echo "Note: Claude binary installed to /home/coder/.local/bin/claude"
