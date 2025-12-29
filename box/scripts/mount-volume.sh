#!/bin/bash
set -euo pipefail

# Mount volume script for CCC workspaces
# This is called by cloud-init to mount the persistent volume

DEVICE="${1:-/dev/sdb}"
MOUNT_POINT="${2:-/mnt/workspace}"
OWNER="${3:-coder}"

echo "=== Mounting workspace volume ==="
echo "Device: ${DEVICE}"
echo "Mount point: ${MOUNT_POINT}"
echo "Owner: ${OWNER}"

# Wait for device to be available (up to 30 seconds)
echo "Waiting for device ${DEVICE}..."
for i in {1..30}; do
    if [ -b "${DEVICE}" ]; then
        echo "Device ${DEVICE} is available"
        break
    fi
    sleep 1
done

if [ ! -b "${DEVICE}" ]; then
    echo "ERROR: Device ${DEVICE} not found after 30 seconds"
    exit 1
fi

# Check if device has a filesystem
if ! blkid "${DEVICE}" | grep -q TYPE; then
    echo "Device has no filesystem, creating ext4..."
    mkfs.ext4 -L ccc-workspace "${DEVICE}"
fi

# Create mount point if needed
mkdir -p "${MOUNT_POINT}"

# Mount the device
echo "Mounting ${DEVICE} to ${MOUNT_POINT}..."
mount "${DEVICE}" "${MOUNT_POINT}"

# Set ownership
chown "${OWNER}:${OWNER}" "${MOUNT_POINT}"
chmod 755 "${MOUNT_POINT}"

# Add to fstab for persistence across reboots
if ! grep -q "${DEVICE}" /etc/fstab; then
    echo "${DEVICE} ${MOUNT_POINT} ext4 defaults,nofail 0 2" >> /etc/fstab
fi

echo "Volume mounted successfully!"
df -h "${MOUNT_POINT}"
