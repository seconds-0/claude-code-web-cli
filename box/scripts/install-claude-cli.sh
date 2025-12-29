#!/bin/bash
set -euo pipefail

echo "=== Installing Claude Code CLI ==="

# Install Claude Code CLI globally via npm
echo "Installing Claude Code CLI via npm..."
npm install -g @anthropic-ai/claude-code

# Verify installation
echo "Verifying installation..."
claude --version || echo "Claude CLI installed (version check may require API key)"

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

# Claude Code CLI
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
