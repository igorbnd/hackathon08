#!/usr/bin/env bash
# Full deployment script for InvoiceIQ.
# Builds the SPA, deploys CDK stacks, generates runtime config,
# syncs assets to S3, and invalidates CloudFront.
#
# Usage: ./scripts/deploy.sh [--stage dev|prod]

set -euo pipefail

STAGE="dev"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --stage)
      STAGE="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="${SCRIPT_DIR}/.."
REGION="${AWS_DEFAULT_REGION:-eu-west-2}"
STACK_PREFIX="InvoiceIQ"

echo "============================================"
echo " InvoiceIQ Deploy - stage=$STAGE region=$REGION"
echo "============================================"

# ─── Step 1: Build the SPA ────────────────────────────────────────────────────
echo ""
echo "[1/5] Building web application..."
cd "$ROOT_DIR"
npm run build --workspace web

# ─── Step 2: Deploy CDK stacks ────────────────────────────────────────────────
echo ""
echo "[2/5] Deploying CDK stacks..."
cd "$ROOT_DIR/infra"
npx cdk deploy --all \
  --context stage="$STAGE" \
  --require-approval never \
  --outputs-file cdk-outputs.json

# ─── Step 3: Generate runtime config ──────────────────────────────────────────
echo ""
echo "[3/5] Generating runtime config..."
cd "$ROOT_DIR"
bash scripts/generate-config.sh --stage "$STAGE"

# ─── Step 4: Sync SPA to S3 ──────────────────────────────────────────────────
echo ""
echo "[4/5] Syncing SPA assets to S3..."

# Get the SPA bucket name from stack outputs
NETWORK_STACK="${STACK_PREFIX}-Network-${STAGE}"
SPA_BUCKET=$(aws cloudformation describe-stacks \
  --stack-name "$NETWORK_STACK" \
  --region "$REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='SpaBucketName'].OutputValue" \
  --output text 2>/dev/null || echo "")

if [[ -z "$SPA_BUCKET" ]]; then
  # Try Storage stack as fallback
  STORAGE_STACK="${STACK_PREFIX}-Storage-${STAGE}"
  SPA_BUCKET=$(aws cloudformation describe-stacks \
    --stack-name "$STORAGE_STACK" \
    --region "$REGION" \
    --query "Stacks[0].Outputs[?OutputKey=='SpaBucketName'].OutputValue" \
    --output text)
fi

if [[ -z "$SPA_BUCKET" ]]; then
  echo "ERROR: Could not determine SPA bucket name from stack outputs"
  exit 1
fi

echo "  Bucket: $SPA_BUCKET"

WEB_DIST="$ROOT_DIR/web/dist"

# Sync hashed assets with long cache (immutable)
aws s3 sync "$WEB_DIST/assets" "s3://${SPA_BUCKET}/assets" \
  --cache-control "public, max-age=31536000, immutable" \
  --delete \
  --region "$REGION"

# Sync index.html with no-cache
aws s3 cp "$WEB_DIST/index.html" "s3://${SPA_BUCKET}/index.html" \
  --cache-control "no-cache, no-store, must-revalidate" \
  --content-type "text/html" \
  --region "$REGION"

# Sync config.json with no-cache
aws s3 cp "$ROOT_DIR/web/public/config.json" "s3://${SPA_BUCKET}/config.json" \
  --cache-control "no-cache, no-store, must-revalidate" \
  --content-type "application/json" \
  --region "$REGION"

# Sync remaining files (favicon, etc.) with moderate caching
aws s3 sync "$WEB_DIST" "s3://${SPA_BUCKET}" \
  --exclude "assets/*" \
  --exclude "index.html" \
  --exclude "config.json" \
  --cache-control "public, max-age=3600" \
  --delete \
  --region "$REGION"

# ─── Step 5: Invalidate CloudFront ───────────────────────────────────────────
echo ""
echo "[5/5] Invalidating CloudFront cache..."

DISTRIBUTION_ID=$(aws cloudformation describe-stacks \
  --stack-name "$NETWORK_STACK" \
  --region "$REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='DistributionId'].OutputValue" \
  --output text 2>/dev/null || echo "")

if [[ -n "$DISTRIBUTION_ID" ]]; then
  aws cloudfront create-invalidation \
    --distribution-id "$DISTRIBUTION_ID" \
    --paths "/index.html" "/config.json" \
    --region us-east-1
  echo "  Invalidated /index.html and /config.json on distribution $DISTRIBUTION_ID"
else
  echo "  WARNING: Could not find CloudFront distribution ID. Skipping invalidation."
fi

echo ""
echo "============================================"
echo " Deploy complete!"
echo "============================================"
