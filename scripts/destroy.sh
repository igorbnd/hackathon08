#!/usr/bin/env bash
# Teardown script for InvoiceIQ.
# Empties the SPA bucket then destroys all CDK stacks.
#
# Usage: ./scripts/destroy.sh [--stage dev|prod]

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
echo " InvoiceIQ Destroy - stage=$STAGE region=$REGION"
echo "============================================"
echo ""
echo "WARNING: This will destroy all stacks for stage=$STAGE"
echo ""

# ─── Step 1: Empty the SPA bucket ────────────────────────────────────────────
echo "[1/2] Emptying SPA bucket..."

NETWORK_STACK="${STACK_PREFIX}-Network-${STAGE}"
SPA_BUCKET=$(aws cloudformation describe-stacks \
  --stack-name "$NETWORK_STACK" \
  --region "$REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='SpaBucketName'].OutputValue" \
  --output text 2>/dev/null || echo "")

if [[ -z "$SPA_BUCKET" ]]; then
  STORAGE_STACK="${STACK_PREFIX}-Storage-${STAGE}"
  SPA_BUCKET=$(aws cloudformation describe-stacks \
    --stack-name "$STORAGE_STACK" \
    --region "$REGION" \
    --query "Stacks[0].Outputs[?OutputKey=='SpaBucketName'].OutputValue" \
    --output text 2>/dev/null || echo "")
fi

if [[ -n "$SPA_BUCKET" ]]; then
  echo "  Emptying bucket: $SPA_BUCKET"
  aws s3 rm "s3://${SPA_BUCKET}" --recursive --region "$REGION" || true
else
  echo "  WARNING: Could not find SPA bucket. It may already be deleted."
fi

# ─── Step 2: Destroy CDK stacks ──────────────────────────────────────────────
echo ""
echo "[2/2] Destroying CDK stacks..."
cd "$ROOT_DIR/infra"
npx cdk destroy --all \
  --context stage="$STAGE" \
  --force

echo ""
echo "============================================"
echo " Destroy complete!"
echo "============================================"
