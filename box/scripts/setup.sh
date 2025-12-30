#!/bin/bash
set -euo pipefail

echo "=== CCC Workspace Base Setup ==="

# Update and install base packages
echo "Installing base packages..."
apt-get update
apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    git \
    htop \
    jq \
    less \
    locales \
    man-db \
    openssh-client \
    software-properties-common \
    sudo \
    tmux \
    unzip \
    vim \
    wget \
    zsh

# Set up locale
echo "Setting up locale..."
locale-gen en_US.UTF-8
update-locale LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8

# Create coder user
echo "Creating coder user..."
if ! id coder &>/dev/null; then
    useradd -m -s /bin/bash coder
    echo "coder ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/coder
    chmod 0440 /etc/sudoers.d/coder
fi

# Create workspace mount point
echo "Setting up workspace mount point..."
mkdir -p /mnt/workspace
chown coder:coder /mnt/workspace

# Install Node.js 20.x LTS
echo "Installing Node.js 20.x LTS..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Install Python 3.11 (alongside system Python 3.10 - don't change defaults to avoid breaking apt)
echo "Installing Python 3.11..."
add-apt-repository -y ppa:deadsnakes/ppa
apt-get update
apt-get install -y python3.11 python3.11-venv python3.11-dev python3-pip
# Make python3.11 available but don't break system Python
ln -sf /usr/bin/python3.11 /usr/local/bin/python
ln -sf /usr/bin/python3.11 /usr/local/bin/python3.11

# Install pnpm
echo "Installing pnpm..."
npm install -g pnpm

# Set up SSH config directory for coder user
mkdir -p /home/coder/.ssh
chmod 700 /home/coder/.ssh
chown coder:coder /home/coder/.ssh

# Set up git defaults
sudo -u coder git config --global init.defaultBranch main
sudo -u coder git config --global pull.rebase false

# Create default tmux config
cat > /home/coder/.tmux.conf << 'TMUXCONF'
# Enable mouse support
set -g mouse on

# Set better prefix
set -g prefix C-a
unbind C-b
bind C-a send-prefix

# Start windows and panes at 1
set -g base-index 1
setw -g pane-base-index 1

# Improve colors
set -g default-terminal "screen-256color"

# Increase history limit
set -g history-limit 50000

# Enable pipe-pane for output capture
# Usage: tmux pipe-pane -o 'cat >> /tmp/pane-output.log'
TMUXCONF
chown coder:coder /home/coder/.tmux.conf

echo "Base setup complete!"
