#!/bin/bash
# Test cloud API credentials before running full provisioning

set -e

# Load env file
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

echo "=== Testing Cloud Credentials ==="
echo

# Test Hetzner
echo "1. Testing Hetzner API..."
if [ -z "$HETZNER_API_TOKEN" ]; then
  echo "   ❌ HETZNER_API_TOKEN not set"
  HETZNER_OK=false
else
  RESPONSE=$(curl -s -w "\n%{http_code}" -H "Authorization: Bearer $HETZNER_API_TOKEN" \
    https://api.hetzner.cloud/v1/servers)
  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
  BODY=$(echo "$RESPONSE" | sed '$d')

  if [ "$HTTP_CODE" = "200" ]; then
    echo "   ✅ Hetzner API works! (HTTP $HTTP_CODE)"
    HETZNER_OK=true
  else
    echo "   ❌ Hetzner API failed (HTTP $HTTP_CODE)"
    echo "   Response: $BODY"
    HETZNER_OK=false
  fi
fi
echo

# Test Tailscale
echo "2. Testing Tailscale API..."
if [ -z "$TAILSCALE_API_KEY" ]; then
  echo "   ❌ TAILSCALE_API_KEY not set"
  TAILSCALE_OK=false
else
  RESPONSE=$(curl -s -w "\n%{http_code}" -H "Authorization: Bearer $TAILSCALE_API_KEY" \
    https://api.tailscale.com/api/v2/tailnet/-/devices)
  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
  BODY=$(echo "$RESPONSE" | sed '$d')

  if [ "$HTTP_CODE" = "200" ]; then
    echo "   ✅ Tailscale API works! (HTTP $HTTP_CODE)"
    TAILSCALE_OK=true

    # Extract tailnet name from response
    TAILNET=$(echo "$BODY" | grep -o '"name":"[^"]*"' | head -1 | sed 's/"name":"//;s/"//')
    if [ -n "$TAILNET" ]; then
      echo "   Found device: $TAILNET"
    fi
  else
    echo "   ❌ Tailscale API failed (HTTP $HTTP_CODE)"
    echo "   Response: $BODY"
    TAILSCALE_OK=false
  fi
fi
echo

# Summary
echo "=== Summary ==="
if [ "$HETZNER_OK" = true ] && [ "$TAILSCALE_OK" = true ]; then
  echo "✅ All credentials valid! Ready to provision."
  echo
  echo "Next steps:"
  echo "  1. cd box/packer && packer build ."
  echo "  2. Add HETZNER_PACKER_IMAGE_ID to .env"
  echo "  3. pnpm dev"
  echo "  4. Create and start a workspace"
  exit 0
else
  echo "❌ Some credentials missing or invalid."
  echo
  echo "Add to .env:"
  [ "$HETZNER_OK" != true ] && echo "  HETZNER_API_TOKEN=your-token-here"
  [ "$TAILSCALE_OK" != true ] && echo "  TAILSCALE_API_KEY=tskey-api-xxx"
  [ -z "$TAILSCALE_TAILNET" ] && echo "  TAILSCALE_TAILNET=your-tailnet-name"
  exit 1
fi
