# Spec: foundation-and-infra

## Requirements

### R1.1 — Monorepo scaffold

When a developer clones the repository and runs `npm install` at root,
the system shall install dependencies for /infra, /api, /web, and /packages/schema
using npm workspaces with no additional manual steps.

### R1.2 — CDK bootstrapping

When a developer runs `npx cdk deploy --all` from /infra,
the system shall deploy a CloudFormation stack containing: an S3 bucket (SSE-KMS,
block-all-public-access, per-user key prefix structure), a DynamoDB table (single-table
design with partition key PK and sort key SK, plus GSI1 and GSI2), an HTTP API
Gateway with a default stage, and a CloudFront distribution pointing at the SPA bucket.

### R1.3 — Lambda execution role

The system shall create one least-privilege IAM execution role per Lambda function
group (auth, ingestion, query) granting only the specific DynamoDB, S3, Textract, and
Bedrock actions each group requires.

### R1.4 — Observability baseline

When any Lambda executes,
the system shall emit structured JSON logs to CloudWatch including requestId,
userId (if authenticated), action name, duration, and error details (without PII),
and propagate X-Ray trace headers.

### R1.5 — CloudWatch alarms

The system shall create alarms for: Lambda error rate > 1% over 5 minutes,
Textract spend > $X/day, Bedrock token spend > $Y/day (thresholds configurable via
CDK context).

### R1.6 — SPA hosting

When the /web build output is uploaded to the SPA S3 bucket,
the system shall serve it via CloudFront with HTTPS, gzip/brotli compression,
custom error page routing all paths to index.html (SPA routing), and cache
invalidation on deploy.

### R1.7 — Local development

When a developer runs `npm run dev` from /web,
the system shall start a Vite dev server with hot-reload on localhost:5173.
When a developer runs `npm run dev` from /api,
the system shall start a local invocation harness on localhost:3001.

### R1.8 — CI readiness

The system shall include a GitHub Actions workflow that on every push runs:
lint (ESLint), type-check (tsc --noEmit), unit tests (vitest), and CDK synth.

### R1.9 — Security baseline

The system shall enforce: no S3 public access, KMS encryption on S3 and DynamoDB,
WAF WebACL attached to CloudFront with AWS managed rule groups, and all secrets
referenced via SSM Parameter Store SecureString.

### R1.10 — Cost controls

The system shall deploy AWS Budgets alerts at $10/day and $50/month thresholds,
notifying via SNS.
