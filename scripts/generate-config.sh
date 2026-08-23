#!/usr/bin/env bash
# Generate web/public/config.json from CDK stack outputs.
# Usage: ./scripts/generate-config.sh [--stage dev|prod]

set -euo pipefail

STAGE="${1:-dev}"
# Strip --stage prefix if passed as flag
if [[ "$STAGE" == "--stage" ]]; then
  STAGE="${2:-dev}"
fi

STACK_PREFIX="InvoiceIQ"
REGION="${AWS_DEFAULT_REGION:-eu-west-2}"

echo "[generate-config] Reading stack outputs for stage=$STAGE region=$REGION"

# Query Compute stack for Cognito outputs
COMPUTE_STACK="${STACK_PREFIX}-Compute-${STAGE}"

get_output() {
  local stack="$1"
  local key="$2"
  aws cloudformation describe-stacks \
    --stack-name "$stack" \
    --region "$REGION" \
    --query "Stacks[0].Outputs[?OutputKey=='${key}'].OutputValue" \
    --output text 2>/dev/null || echo ""
}

USER_POOL_ID=$(get_output "$COMPUTE_STACK" "UserPoolId")
USER_POOL_CLIENT_ID=$(get_output "$COMPUTE_STACK" "UserPoolClientId")

# Fallback: try the Network stack if Compute doesn't have Cognito outputs
if [[ -z "$USER_POOL_ID" ]]; then
  NETWORK_STACK="${STACK_PREFIX}-Network-${STAGE}"
  USER_POOL_ID=$(get_output "$NETWORK_STACK" "UserPoolId")
  USER_POOL_CLIENT_ID=$(get_output "$NETWORK_STACK" "UserPoolClientId")
fi

# Fallback: try a dedicated Auth stack
if [[ -z "$USER_POOL_ID" ]]; then
  AUTH_STACK="${STACK_PREFIX}-Auth-${STAGE}"
  USER_POOL_ID=$(get_output "$AUTH_STACK" "UserPoolId")
  USER_POOL_CLIENT_ID=$(get_output "$AUTH_STACK" "UserPoolClientId")
fi

if [[ -z "$USER_POOL_ID" || -z "$USER_POOL_CLIENT_ID" ]]; then
  echo "[generate-config] WARNING: Could not find Cognito outputs. Config will have empty values."
  USER_POOL_ID="${USER_POOL_ID:-}"
  USER_POOL_CLIENT_ID="${USER_POOL_CLIENT_ID:-}"
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="${SCRIPT_DIR}/../web/public/config.json"

cat > "$CONFIG_FILE" <<EOF
{
  "apiBasePath": "/api",
  "cognitoUserPoolId": "${USER_POOL_ID}",
  "cognitoClientId": "${USER_POOL_CLIENT_ID}",
  "cognitoRegion": "${REGION}",
  "appRegion": "${REGION}"
}
EOF

echo "[generate-config] Written $CONFIG_FILE"
echo "[generate-config]   cognitoUserPoolId = ${USER_POOL_ID}"
echo "[generate-config]   cognitoClientId   = ${USER_POOL_CLIENT_ID}"
echo "[generate-config]   region            = ${REGION}"
