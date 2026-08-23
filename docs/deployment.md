# InvoiceIQ Deployment Runbook

This document provides a complete step-by-step guide to deploying InvoiceIQ to AWS with a custom domain managed through Cloudflare DNS.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [CDK Bootstrap](#cdk-bootstrap)
3. [Step-by-Step Deployment Runbook](#step-by-step-deployment-runbook)
4. [Expected Timings](#expected-timings)
5. [Verification Checklist](#verification-checklist)
6. [Rollback](#rollback)
7. [Teardown](#teardown)

---

## Prerequisites

Before starting, ensure the following are installed and configured:

| Tool | Minimum Version | Purpose |
|------|----------------|---------|
| Node.js | 20.0.0+ | CDK CLI, Lambda bundling |
| npm | 9.0.0+ | Package management |
| AWS CLI | v2 | AWS account access |
| AWS CDK CLI | 2.x | Infrastructure deployment |
| Git | 2.x | Source control |

### AWS Permissions Required

The deploying IAM principal needs permissions to create and manage:

- CloudFormation stacks
- S3 buckets
- DynamoDB tables
- Lambda functions
- API Gateway HTTP APIs
- CloudFront distributions
- WAF WebACLs
- ACM certificates
- Cognito user pools
- CloudWatch alarms, logs, dashboards
- SNS topics
- AWS Budgets
- KMS keys
- IAM roles and policies

> **Tip:** For a hackathon/dev environment, `AdministratorAccess` is acceptable. For production, scope down to least privilege.

### Cloudflare Access

You need access to the Cloudflare dashboard (or API) for the zone managing `igorbond.com` to add DNS records.

### Enable Bedrock Model Access

In the AWS Console, navigate to **Amazon Bedrock > Model access** in your app region (`eu-west-2`) and request access to **Claude 3 Haiku**. This can take a few minutes to activate.

---

## CDK Bootstrap

CDK must be bootstrapped in **both** regions before the first deployment:

```bash
# App region (where most stacks deploy)
npx cdk bootstrap aws://ACCOUNT_ID/eu-west-2

# Certificate + WAF region (required for CloudFront)
npx cdk bootstrap aws://ACCOUNT_ID/us-east-1
```

Replace `ACCOUNT_ID` with your 12-digit AWS account ID. You can find it with:

```bash
aws sts get-caller-identity --query Account --output text
```

> **Why two regions?** ACM certificates used by CloudFront must be in `us-east-1`. WAF WebACLs with scope `CLOUDFRONT` must also be in `us-east-1`. All other application resources deploy to `eu-west-2`.

---

## Step-by-Step Deployment Runbook

### Step 1: Install Dependencies

```bash
cd hackathon08
npm install
```

### Step 2: Deploy the CertificateStack

The CertificateStack deploys to `us-east-1` and creates:
- An ACM certificate for your domain with DNS validation
- A WAF WebACL for CloudFront

```bash
cd infra
npx cdk deploy InvoiceIQ-CertificateStack -c stage=prod --require-approval never
```

> **IMPORTANT: The deploy will BLOCK here.**
>
> The stack will enter `CREATE_IN_PROGRESS` and wait for ACM DNS validation to succeed. The terminal will appear to hang. This is expected behaviour. It will wait up to 72 hours before timing out (though typically you only need 5-30 minutes once the record is added).

The stack will output the following values:

```
Outputs:
InvoiceIQ-CertificateStack.CertificateArn = arn:aws:acm:us-east-1:123456789012:certificate/abc-def-ghi
InvoiceIQ-CertificateStack.DnsValidationNote = Add CNAME: _hexstring.invoiceiq.igorbond.com -> _hexstring.acm-validations.aws
```

The exact CNAME name and value are determined by ACM at deploy time. They follow this pattern:
- **Name:** `_<random-hex>.invoiceiq.igorbond.com`
- **Value:** `_<random-hex>.acm-validations.aws.`

You can also find the exact values in the AWS Console under **ACM > Certificates** in `us-east-1`.

---

### Step 3: Add the ACM Validation CNAME in Cloudflare

**ACTION REQUIRED: Add the following DNS record in Cloudflare NOW.**

1. Log in to the [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Select the zone for `igorbond.com`
3. Go to **DNS > Records**
4. Click **Add record**
5. Configure:

| Field | Value |
|-------|-------|
| Type | `CNAME` |
| Name | The `_<hex>` portion from the ACM output (e.g., `_abc123def.invoiceiq`) |
| Target | The `_<hex>.acm-validations.aws` value from the ACM output |
| Proxy status | **DNS only** (grey cloud, proxy OFF) |
| TTL | Auto |

> **CRITICAL: The proxy toggle MUST be OFF (grey cloud, "DNS only").**
>
> Cloudflare defaults new CNAME records to **proxied** (orange cloud). You must explicitly click the orange cloud icon to switch it to grey (DNS only).
>
> If the record is proxied, ACM validation will **never succeed** because Cloudflare's proxy intercepts the DNS lookup and returns Cloudflare's own TLS certificate instead of allowing AWS to verify the CNAME target. ACM needs to see the raw CNAME resolution pointing to `acm-validations.aws`.

6. Click **Save**

After adding the record, wait for ACM to validate. The CertificateStack deploy in your terminal will complete automatically once validation succeeds (typically 2-10 minutes after the DNS record propagates).

> **IMPORTANT: Do NOT delete this validation CNAME after the certificate is issued.**
>
> ACM certificates are valid for 13 months and AWS automatically attempts renewal starting 60 days before expiry. During renewal, ACM re-validates ownership by checking this same CNAME record. If the record is missing, renewal will fail and your certificate will expire, breaking HTTPS on your domain. **Leave this record in place permanently.**

---

### Step 4: Wait for CertificateStack to Complete

Once you add the DNS record, monitor your terminal. You should see:

```
InvoiceIQ-CertificateStack: creating CloudFormation changeset...
 ...
InvoiceIQ-CertificateStack | 0/3 | CREATE_IN_PROGRESS | AWS::CertificateManager::Certificate
 ...
InvoiceIQ-CertificateStack | 3/3 | CREATE_COMPLETE | AWS::CloudFormation::Stack
```

If it does not complete within 30 minutes:
- Verify the CNAME record is correct in Cloudflare (check for typos)
- Verify the proxy is OFF (grey cloud)
- Check in the AWS Console under ACM in `us-east-1` for the validation status
- Use `dig` to verify the record resolves: `dig _<hex>.invoiceiq.igorbond.com CNAME`

---

### Step 5: Deploy Remaining Stacks

Once the CertificateStack is complete, deploy all remaining stacks:

```bash
npx cdk deploy --all -c stage=prod --require-approval never
```

This deploys in dependency order:
1. **StorageStack** - S3 buckets, DynamoDB table, KMS key
2. **NetworkStack** - HTTP API Gateway, CloudFront distribution with custom domain, OAC
3. **ComputeStack** - Lambda functions with IAM roles
4. **ObservabilityStack** - CloudWatch alarms, dashboards, SNS notifications
5. **CostStack** - AWS Budgets and cost alarms

After the NetworkStack deploys, note the CloudFront distribution domain name from the outputs:

```
Outputs:
InvoiceIQ-NetworkStack.DistributionDomainName = d1234abcdef8.cloudfront.net
InvoiceIQ-NetworkStack.DistributionId = E1234ABCDEF
InvoiceIQ-NetworkStack.CustomDomain = invoiceiq.igorbond.com
```

---

### Step 6: Add the CloudFront CNAME in Cloudflare

**ACTION REQUIRED: Add the following DNS record in Cloudflare NOW.**

1. In the Cloudflare Dashboard, go to **DNS > Records** for the `igorbond.com` zone
2. Click **Add record**
3. Configure:

| Field | Value |
|-------|-------|
| Type | `CNAME` |
| Name | `invoiceiq` |
| Target | The CloudFront distribution domain from Step 5 (e.g., `d1234abcdef8.cloudfront.net`) |
| Proxy status | **DNS only** (grey cloud, proxy OFF) |
| TTL | Auto |

> **CRITICAL: The proxy toggle MUST be OFF (grey cloud, "DNS only").**
>
> Cloudflare defaults new CNAME records to **proxied** (orange cloud). You must explicitly switch it off.

#### Why must this record be unproxied?

Proxying a record through Cloudflare (orange cloud) places Cloudflare's edge network in front of CloudFront. This causes multiple problems:

1. **Double TLS termination** - Cloudflare terminates TLS with its own certificate, then makes a new TLS connection to CloudFront. The client never sees your ACM certificate. This defeats the purpose of provisioning a custom ACM certificate.

2. **Hidden client IP** - CloudFront receives Cloudflare's edge IP instead of the real client IP, breaking WAF rate-limiting rules and access logs.

3. **Redirect loops** - Unless Cloudflare's SSL/TLS mode for the zone is set to **Full (strict)**, the connection between Cloudflare and CloudFront can loop (Cloudflare requests HTTP from origin, CloudFront redirects to HTTPS, Cloudflare follows, CloudFront redirects again, etc.).

4. **Cache conflicts** - Both Cloudflare and CloudFront attempt to cache content, leading to stale responses and unpredictable cache invalidation.

For this project, we want **CloudFront to terminate TLS directly** using the ACM certificate, enforce HTTP-to-HTTPS redirects, serve cached content from its edge, and apply WAF rules with accurate client IPs. The CNAME record stays unproxied.

> **Note on Cloudflare zone-level settings:** If your Cloudflare zone has "Always Use HTTPS" or other SSL/TLS settings enabled at the zone level, these settings are **irrelevant for unproxied records**. Since traffic for an unproxied (grey cloud) record bypasses Cloudflare's proxy entirely, Cloudflare cannot inject redirects or modify TLS behaviour. CloudFront handles the HTTP-to-HTTPS redirect itself via its viewer protocol policy.

---

### Step 7: Build and Upload the Frontend

Run the full deployment script which builds the SPA, generates runtime config, uploads to S3, and invalidates CloudFront:

```bash
cd ..  # back to repo root
./scripts/deploy.sh --stage prod
```

Or manually:

```bash
# Build the frontend
npm run build --workspace web

# Generate runtime config from stack outputs
./scripts/generate-config.sh

# Sync to S3 with cache headers
BUCKET_NAME=$(aws cloudformation describe-stacks \
  --stack-name InvoiceIQ-StorageStack \
  --query "Stacks[0].Outputs[?OutputKey=='SpaBucketName'].OutputValue" \
  --output text --region eu-west-2)

aws s3 sync web/dist/ s3://$BUCKET_NAME/ \
  --delete \
  --cache-control "max-age=31536000,immutable" \
  --exclude "index.html" \
  --exclude "config.json"

aws s3 cp web/dist/index.html s3://$BUCKET_NAME/index.html \
  --cache-control "no-cache,no-store,must-revalidate"

aws s3 cp web/dist/config.json s3://$BUCKET_NAME/config.json \
  --cache-control "no-cache,no-store,must-revalidate"

# Invalidate CloudFront
DISTRIBUTION_ID=$(aws cloudformation describe-stacks \
  --stack-name InvoiceIQ-NetworkStack \
  --query "Stacks[0].Outputs[?OutputKey=='DistributionId'].OutputValue" \
  --output text --region eu-west-2)

aws cloudfront create-invalidation \
  --distribution-id $DISTRIBUTION_ID \
  --paths "/index.html" "/config.json"
```

### Step 8: Seed Demo Data

```bash
npm run seed
```

This creates:
- A Cognito user (`demo@invoiceiq.example` / `Demo1234!Secure`)
- 50 synthetic invoices uploaded to S3
- Corresponding DynamoDB records

---

### Step 9: Verify the Deployment

See the [Verification Checklist](#verification-checklist) below.

---

## Expected Timings

| Step | Duration |
|------|----------|
| `npm install` | 1-3 minutes |
| CDK bootstrap (each region) | 1-2 minutes |
| CertificateStack deploy (waiting for DNS validation) | 5-30 minutes (depends on DNS propagation) |
| Remaining stacks deploy | 5-15 minutes |
| Frontend build + S3 upload | 1-2 minutes |
| CloudFront invalidation propagation | 1-5 minutes |
| Seed demo data | 1-2 minutes |
| **Total (after DNS records are added)** | **15-55 minutes** |

> **Note:** The CertificateStack wait time is the biggest variable. If Cloudflare DNS propagation is fast (usually is), it completes in under 5 minutes. If you make a typo in the CNAME, it could wait indefinitely.

---

## Verification Checklist

After deployment is complete and DNS has propagated, verify the following:

### 1. DNS Resolution

```bash
dig invoiceiq.igorbond.com CNAME +short
```

**Expected:** Returns a `cloudfront.net` domain (e.g., `d1234abcdef8.cloudfront.net.`), NOT a Cloudflare IP address (like `104.x.x.x` or `172.x.x.x`).

```bash
dig invoiceiq.igorbond.com A +short
```

**Expected:** Returns CloudFront edge IPs (vary by location), not Cloudflare IPs.

### 2. TLS Certificate

```bash
echo | openssl s_client -servername invoiceiq.igorbond.com -connect invoiceiq.igorbond.com:443 2>/dev/null | openssl x509 -noout -subject -issuer -dates
```

**Expected:**
- Subject contains `invoiceiq.igorbond.com`
- Issuer is `Amazon` (not Cloudflare or Let's Encrypt)
- Dates show validity window of ~13 months

Alternatively in a browser: click the padlock icon and verify the certificate is issued by Amazon and matches `invoiceiq.igorbond.com`.

### 3. HTTP to HTTPS Redirect

```bash
curl -I http://invoiceiq.igorbond.com 2>/dev/null | head -5
```

**Expected:** `HTTP/1.1 301 Moved Permanently` with `Location: https://invoiceiq.igorbond.com/`

### 4. Deep Link / SPA Routing

```bash
curl -s -o /dev/null -w "%{http_code}" https://invoiceiq.igorbond.com/invoices/123
```

**Expected:** HTTP `200` (CloudFront serves `index.html` for all paths not matching a file, enabling client-side routing).

Open `https://invoiceiq.igorbond.com/invoices/123` in a browser and hard-refresh (Ctrl+Shift+R). The React app should load and handle the route (may show "not found" within the app UI, but the page itself loads correctly).

### 5. API Health Check

```bash
curl -s https://invoiceiq.igorbond.com/api/health
```

**Expected:** HTTP `200` with a JSON response (e.g., `{"status":"ok"}` or similar health payload).

### 6. End-to-End Sign In

1. Navigate to `https://invoiceiq.igorbond.com`
2. Sign in with:
   - **Email:** `demo@invoiceiq.example`
   - **Password:** `Demo1234!Secure`
3. Verify the dashboard loads with invoice data
4. Verify API calls succeed (invoices load, recommendations display)

### 7. No Mixed Content or CSP Violations

Open browser DevTools (F12) > Console tab while navigating the app. Verify:
- No `Mixed Content` warnings (all resources loaded over HTTPS)
- No `Content-Security-Policy` violation errors
- No failed network requests due to CORS or CSP blocking

---

## Rollback

### Rolling Back a Stack Update

If a stack update fails or causes issues:

```bash
cd infra

# Roll back a specific stack to its previous state
npx cdk deploy InvoiceIQ-NetworkStack -c stage=prod --rollback true
```

CloudFormation automatically rolls back failed deployments. If a stack is stuck in `UPDATE_ROLLBACK_FAILED`:

```bash
aws cloudformation continue-update-rollback \
  --stack-name InvoiceIQ-NetworkStack \
  --region eu-west-2
```

### Rolling Back DNS Changes

If the custom domain is causing issues:

1. In Cloudflare, delete or pause the `invoiceiq` CNAME record
2. Traffic will stop resolving to CloudFront
3. The CloudFront distribution remains intact and accessible via its `cloudfront.net` domain
4. Re-add the CNAME when ready to restore

### Rolling Back the Certificate

If you need to remove the custom domain configuration:

1. Remove the alternate domain name from CloudFront (redeploy NetworkStack without custom domain)
2. Delete the ACM certificate via the CertificateStack
3. Remove both Cloudflare CNAME records

---

## Teardown

To completely destroy all AWS resources:

```bash
# From the repo root
./scripts/destroy.sh --stage prod
```

Or manually:

```bash
cd infra

# Empty the S3 buckets first (CDK cannot delete non-empty buckets)
BUCKET_NAME=$(aws cloudformation describe-stacks \
  --stack-name InvoiceIQ-StorageStack \
  --query "Stacks[0].Outputs[?OutputKey=='SpaBucketName'].OutputValue" \
  --output text --region eu-west-2)
aws s3 rm s3://$BUCKET_NAME --recursive

DOC_BUCKET=$(aws cloudformation describe-stacks \
  --stack-name InvoiceIQ-StorageStack \
  --query "Stacks[0].Outputs[?OutputKey=='DocumentsBucketName'].OutputValue" \
  --output text --region eu-west-2)
aws s3 rm s3://$DOC_BUCKET --recursive

# Destroy all stacks
npx cdk destroy --all -c stage=prod --force
```

After stack destruction:

1. **Remove Cloudflare DNS records** - Delete both the ACM validation CNAME and the `invoiceiq` CNAME
2. **Verify in AWS Console** - Check CloudFormation in both `eu-west-2` and `us-east-1` to confirm all stacks are deleted
3. **CDK bootstrap stacks** - These remain and can be reused. Delete them manually via CloudFormation if desired.

> **Note:** If the StorageStack uses `RETAIN` removal policy (production), S3 buckets and DynamoDB tables will be orphaned after stack deletion. Delete them manually from the AWS Console if needed.
