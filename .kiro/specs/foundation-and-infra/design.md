# Design: foundation-and-infra

## 1. Architecture Overview

### CDK Stack Structure

The infrastructure is split into layered CDK stacks to allow independent deployment and clear dependency ordering:

```
InvoiceIqApp (CDK App)
├── StorageStack          (S3 + DynamoDB + KMS keys)
├── NetworkStack          (API Gateway HTTP API + CloudFront + WAF)
├── ComputeStack          (Lambda function groups + IAM roles)
├── ObservabilityStack    (CloudWatch alarms + dashboards)
└── CostStack             (AWS Budgets + SNS)
```

**Naming convention:** All resources use the prefix `invoiceiq-{stage}-` where stage is `dev`, `staging`, or `prod` (from CDK context).

**CDK App entry point:** `infra/bin/app.ts`

```typescript
const app = new cdk.App();
const stage = app.node.tryGetContext('stage') || 'dev';

const storage = new StorageStack(app, `invoiceiq-${stage}-storage`, { stage });
const network = new NetworkStack(app, `invoiceiq-${stage}-network`, { stage, storage });
const compute = new ComputeStack(app, `invoiceiq-${stage}-compute`, { stage, storage, network });
new ObservabilityStack(app, `invoiceiq-${stage}-observability`, { stage, compute });
new CostStack(app, `invoiceiq-${stage}-cost`, { stage });
```

---

## 2. DynamoDB Single-Table Design

### Table Configuration

| Property | Value |
|----------|-------|
| Table name | `invoiceiq-{stage}-main` |
| Billing mode | PAY_PER_REQUEST |
| Encryption | AWS_OWNED (upgrade to CMK if needed) |
| Point-in-time recovery | Enabled |
| Deletion protection | Enabled in prod |

### Key Schema

| Key | Attribute | Type |
|-----|-----------|------|
| Partition key | `PK` | String |
| Sort key | `SK` | String |

### Global Secondary Indexes

| Index | Partition Key | Sort Key | Projection |
|-------|--------------|----------|------------|
| GSI1 | `GSI1PK` | `GSI1SK` | ALL |
| GSI2 | `GSI2PK` | `GSI2SK` | ALL |

### Access Patterns and Key Schemas

| Access Pattern | PK | SK | GSI |
|----------------|----|----|-----|
| Get user profile | `USER#<userId>` | `PROFILE` | - |
| List user's invoices | `USER#<userId>` | `INV#<invoiceId>` | - |
| Get invoice by ID | `USER#<userId>` | `INV#<invoiceId>` | - |
| Invoices by vendor | `USER#<userId>` | `INV#<invoiceId>` | GSI1: `USER#<userId>#VENDOR#<vendor>` / `<isoDate>` |
| Invoices by date range | `USER#<userId>` | `INV#<invoiceId>` | GSI2: `USER#<userId>#DATE` / `<isoDate>#<invoiceId>` |
| Invoice processing status | `USER#<userId>` | `STATUS#<invoiceId>` | GSI1: `USER#<userId>#STATUS#<status>` / `<timestamp>` |

### Item Structure (Invoice Record)

```json
{
  "PK": "USER#abc123",
  "SK": "INV#inv-001",
  "GSI1PK": "USER#abc123#VENDOR#british-gas",
  "GSI1SK": "2024-01-15",
  "GSI2PK": "USER#abc123#DATE",
  "GSI2SK": "2024-01-15#inv-001",
  "entityType": "INVOICE",
  "invoiceId": "inv-001",
  "userId": "abc123",
  "vendor": "british-gas",
  "amount": 8500,
  "currency": "GBP",
  "issueDate": "2024-01-15",
  "dueDate": "2024-02-01",
  "status": "pending",
  "s3Key": "users/abc123/invoices/inv-001/original.pdf",
  "createdAt": "2024-01-15T10:30:00Z",
  "updatedAt": "2024-01-15T10:30:00Z"
}
```

---

## 3. S3 Bucket Structure

### Document Bucket

| Property | Value |
|----------|-------|
| Bucket name | `invoiceiq-{stage}-documents-{accountId}` |
| Encryption | SSE-KMS (dedicated CMK) |
| Public access | Block ALL |
| Versioning | Enabled |
| Lifecycle | Move to IA after 90 days, Glacier after 365 days |

### Per-User Key Prefix Structure

```
users/
  {userId}/
    invoices/
      {invoiceId}/
        original.pdf          # Uploaded document
        textract-output.json  # Raw Textract response
        canonical.json        # Normalised invoice JSON
    profile/
      avatar.png              # Optional
```

### SPA Hosting Bucket

| Property | Value |
|----------|-------|
| Bucket name | `invoiceiq-{stage}-spa-{accountId}` |
| Encryption | SSE-S3 |
| Public access | Block ALL (served via CloudFront OAC) |
| Versioning | Disabled |

---

## 4. API Gateway Configuration

### HTTP API

| Property | Value |
|----------|-------|
| API name | `invoiceiq-{stage}-api` |
| Protocol | HTTP API (v2) |
| Stage | `$default` with auto-deploy |
| CORS | Origins: `https://invoiceiq.example.com`, localhost:5173 for dev |
| Throttling | 1000 req/s burst, 500 req/s steady |

### Route Structure

```
POST   /auth/signup           -> authGroup Lambda
POST   /auth/signin           -> authGroup Lambda
POST   /auth/refresh          -> authGroup Lambda

POST   /invoices/upload       -> ingestionGroup Lambda
GET    /invoices              -> queryGroup Lambda
GET    /invoices/{id}         -> queryGroup Lambda
DELETE /invoices/{id}         -> ingestionGroup Lambda

POST   /invoices/{id}/process -> ingestionGroup Lambda
POST   /query                 -> queryGroup Lambda
```

### Authorizer

- Cognito JWT authorizer on all routes except `/auth/*`
- Issuer: Cognito User Pool URL
- Audience: Cognito App Client ID

---

## 5. CloudFront + SPA Hosting

### Distribution Configuration

| Property | Value |
|----------|-------|
| Origin | SPA S3 bucket via OAC (Origin Access Control) |
| Protocol | HTTPS only (redirect HTTP) |
| TLS | TLSv1.2 minimum |
| Compression | gzip + Brotli enabled |
| Cache policy | CachingOptimized for static assets |
| Error pages | 403/404 -> /index.html with 200 status (SPA routing) |
| Price class | PriceClass_100 (NA + EU) |

### Cache Behavior

| Path Pattern | TTL | Cache Policy |
|--------------|-----|--------------|
| `/assets/*` | 1 year | Immutable (Vite hashes filenames) |
| `/index.html` | 0 | No cache (always revalidate) |
| `/*` (default) | 1 day | Standard |

### Deploy-Time Invalidation

On CDK deploy of SPA assets, a custom resource triggers `createInvalidation` for `/*` to bust CloudFront cache.

---

## 6. Lambda Function Groups and IAM Roles

### Group: auth

| Property | Value |
|----------|-------|
| Runtime | Node.js 20 |
| Memory | 256 MB |
| Timeout | 10 seconds |
| Handler | `api/dist/handlers/auth/index.handler` |

**IAM permissions:**
- `cognito-idp:AdminCreateUser`, `AdminInitiateAuth`, `AdminRespondToAuthChallenge`
- `dynamodb:PutItem`, `GetItem`, `UpdateItem` on main table (PK begins_with `USER#`)
- `logs:CreateLogGroup`, `logs:CreateLogStream`, `logs:PutLogEvents`
- `xray:PutTraceSegments`, `xray:PutTelemetryRecords`

### Group: ingestion

| Property | Value |
|----------|-------|
| Runtime | Node.js 20 |
| Memory | 512 MB |
| Timeout | 60 seconds |
| Handler | `api/dist/handlers/ingestion/index.handler` |

**IAM permissions:**
- `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` on documents bucket (`users/*`)
- `textract:AnalyzeExpense`, `textract:GetExpenseAnalysis`
- `bedrock:InvokeModel` (Claude model ARN)
- `dynamodb:PutItem`, `GetItem`, `UpdateItem`, `Query` on main table
- `logs:*`, `xray:*` (as above)

### Group: query

| Property | Value |
|----------|-------|
| Runtime | Node.js 20 |
| Memory | 256 MB |
| Timeout | 30 seconds |
| Handler | `api/dist/handlers/query/index.handler` |

**IAM permissions:**
- `s3:GetObject` on documents bucket (read-only)
- `dynamodb:GetItem`, `Query` on main table + GSI1 + GSI2
- `bedrock:InvokeModel` (Claude model ARN)
- `logs:*`, `xray:*` (as above)

### Common Lambda Configuration

All Lambda functions share:
- X-Ray active tracing enabled
- Environment variables: `TABLE_NAME`, `DOCUMENTS_BUCKET`, `STAGE`
- Reserved concurrency: 50 (dev), 200 (prod)
- Dead letter queue: SQS for failed async invocations

---

## 7. Observability Setup

### Structured Logging Format

All Lambda handlers use a shared logger utility (`api/src/lib/logger.ts`):

```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "level": "INFO",
  "requestId": "req-abc123",
  "userId": "usr-def456",
  "action": "invoices.upload",
  "duration": 234,
  "message": "Invoice uploaded successfully",
  "traceId": "1-abc-def",
  "error": null
}
```

**PII rules:** Never log email, name, document content, or file contents. Only log IDs and metadata.

### X-Ray Tracing

- All Lambdas: `tracing: lambda.Tracing.ACTIVE`
- AWS SDK calls automatically instrumented via `aws-xray-sdk`
- Custom subsegments for Textract and Bedrock calls

### CloudWatch Alarms

| Alarm | Metric | Threshold | Period | Action |
|-------|--------|-----------|--------|--------|
| Lambda error rate | Errors / Invocations | > 1% | 5 min | SNS notification |
| Textract daily spend | EstimatedCharges (Textract) | > $X (context) | 1 day | SNS notification |
| Bedrock daily spend | EstimatedCharges (Bedrock) | > $Y (context) | 1 day | SNS notification |
| API 5xx rate | 5XXError on API GW | > 5 in 5 min | 5 min | SNS notification |
| DynamoDB throttles | ThrottledRequests | > 0 | 1 min | SNS notification |

Thresholds `X` and `Y` are read from CDK context:

```typescript
const textractDailyLimit = app.node.tryGetContext('textractDailyLimit') || 5;
const bedrockDailyLimit = app.node.tryGetContext('bedrockDailyLimit') || 10;
```

---

## 8. CI/CD Pipeline Design

### GitHub Actions Workflow: `.github/workflows/ci.yml`

```yaml
name: CI
on: [push, pull_request]

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run test
      - run: cd infra && npx cdk synth
```

### npm Scripts (root package.json)

| Script | Command |
|--------|---------|
| `lint` | `eslint . --ext .ts,.tsx` |
| `typecheck` | `tsc --noEmit --project tsconfig.json` (with project references) |
| `test` | `vitest run` |
| `test:watch` | `vitest` |
| `build` | `npm run build --workspaces` |

---

## 9. Local Development Approach

### Frontend (web)

- `npm run dev` in `/web` starts Vite dev server on `localhost:5173`
- Proxies API calls to `localhost:3001` via Vite config
- Hot module replacement enabled
- Environment variables via `.env.local` (gitignored)

### Backend (api)

- `npm run dev` in `/api` starts a local Express server on `localhost:3001`
- Wraps Lambda handlers with a lightweight adapter (`api/src/local/server.ts`)
- Uses `dotenv` for local env vars (AWS credentials for local Textract/Bedrock testing)
- Optionally connects to a local DynamoDB via `docker compose` (DynamoDB Local on port 8000)

### Infrastructure

- `npx cdk synth` for validation without deploy
- `npx cdk diff` to preview changes
- `npx cdk deploy --all -c stage=dev` for dev account deployment

---

## 10. Security Controls

### WAF WebACL

Attached to CloudFront distribution with these AWS managed rule groups:

| Rule Group | Priority |
|------------|----------|
| AWSManagedRulesCommonRuleSet | 1 |
| AWSManagedRulesKnownBadInputsRuleSet | 2 |
| AWSManagedRulesSQLiRuleSet | 3 |
| AWSManagedRulesAmazonIpReputationList | 4 |

Rate limiting: 2000 requests per 5 minutes per IP.

### KMS Encryption

| Resource | Key |
|----------|-----|
| Documents S3 bucket | Dedicated CMK (`invoiceiq-{stage}-documents-key`) |
| DynamoDB table | AWS-owned key (sufficient for hackathon; upgrade path to CMK documented) |

KMS key policy grants:
- Lambda execution roles: `kms:Decrypt`, `kms:GenerateDataKey`
- S3 service: `kms:Decrypt`, `kms:GenerateDataKey` (for server-side encryption)

### SSM Parameter Store

All secrets stored as SecureString:

| Parameter Path | Content |
|----------------|---------|
| `/invoiceiq/{stage}/cognito/client-secret` | Cognito app client secret |
| `/invoiceiq/{stage}/api/signing-key` | API signing key (if needed) |

Lambda functions read these at cold start and cache in memory.

### S3 Security

- `BlockPublicAccess.BLOCK_ALL` on both buckets
- Bucket policy denying non-SSL requests (`aws:SecureTransport: false`)
- OAC for CloudFront access to SPA bucket (no legacy OAI)

---

## 11. Cost Controls

### AWS Budgets

| Budget | Type | Threshold | Period |
|--------|------|-----------|--------|
| Daily spend | COST | $10 | DAILY |
| Monthly spend | COST | $50 | MONTHLY |

Both budgets notify via SNS topic `invoiceiq-{stage}-budget-alerts`.

### SNS Topic

- Topic name: `invoiceiq-{stage}-budget-alerts`
- Subscriptions: configured via CDK context parameter `alertEmail`
- Also receives CloudWatch alarm notifications

### CDK Context Parameters

```json
{
  "stage": "dev",
  "alertEmail": "team@example.com",
  "textractDailyLimit": 5,
  "bedrockDailyLimit": 10
}
```

---

## 12. Project Dependencies

### /infra

- `aws-cdk-lib` (v2)
- `constructs`
- `source-map-support`

### /api

- `@aws-sdk/client-dynamodb`
- `@aws-sdk/client-s3`
- `@aws-sdk/client-textract`
- `@aws-sdk/client-bedrock-runtime`
- `@aws-sdk/client-cognito-identity-provider`
- `aws-xray-sdk`
- `zod`
- `@invoiceiq/schema` (workspace package)

Dev: `vitest`, `aws-sdk-client-mock`, `@types/aws-lambda`, `esbuild`

### /web

- `react`, `react-dom`
- `react-router-dom`
- `tailwindcss`, `postcss`, `autoprefixer`
- `@invoiceiq/schema` (workspace package)

Dev: `vite`, `@vitejs/plugin-react`, `vitest`, `@testing-library/react`

### /packages/schema

- `zod`
- `typescript`

---

## 13. CDK Construct Choices

| AWS Service | CDK L2 Construct |
|-------------|-----------------|
| S3 | `aws_s3.Bucket` |
| DynamoDB | `aws_dynamodb.Table` |
| Lambda | `aws_lambda_nodejs.NodejsFunction` (bundles with esbuild) |
| API Gateway | `aws_apigatewayv2.HttpApi` + `HttpLambdaIntegration` |
| CloudFront | `aws_cloudfront.Distribution` |
| WAF | `aws_wafv2.CfnWebACL` (L1 - no L2 available) |
| KMS | `aws_kms.Key` |
| Cognito | `aws_cognito.UserPool` |
| Budgets | `aws_budgets.CfnBudget` (L1) |
| SNS | `aws_sns.Topic` |
| CloudWatch | `aws_cloudwatch.Alarm` |

`NodejsFunction` is preferred over raw `Function` because it handles TypeScript bundling via esbuild automatically, eliminating the need for a separate build step for Lambda code.
