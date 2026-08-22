# AWS Well-Architected Framework Review - InvoiceIQ

This document maps InvoiceIQ's architecture to the six pillars of the AWS Well-Architected Framework, referencing actual CDK constructs and configuration from `infra/lib/`.

---

## 1. Operational Excellence

### CI/CD Pipeline

- **GitHub Actions** (`/.github/workflows/ci.yml`) runs lint, typecheck, test, and `cdk synth` on every push and pull request, ensuring no broken infrastructure reaches production.
- CDK synth validates all CloudFormation templates before deployment.

### Structured Logging

- All Lambda functions use a shared structured logger (`api/src/lib/logger.ts`) that emits JSON logs with correlation IDs, enabling CloudWatch Logs Insights queries.
- Lambda environment variables include `STAGE` for log segregation across environments.

### Distributed Tracing

- **X-Ray Active Tracing** is enabled on all three Lambda function groups via `tracing: lambda.Tracing.ACTIVE` in `ComputeStack`. This provides end-to-end request visibility through API Gateway, Lambda, DynamoDB, S3, Textract, and Bedrock.

### Alarms and Notifications

- `ObservabilityStack` creates CloudWatch alarms for:
  - Lambda error rate (>1% over 5-minute window) per function
  - API Gateway 5xx errors (>5 in 5 minutes)
  - DynamoDB throttled requests (any occurrence)
  - Textract and Bedrock daily spend thresholds
- All alarms trigger SNS notifications to the operations team (`AlarmTopic`).

### Infrastructure as Code

- Entire infrastructure defined in CDK v2 TypeScript (`infra/lib/*.ts`), versioned alongside application code. No console-created resources.

---

## 2. Security

### Encryption at Rest

- **S3 Documents Bucket**: SSE-KMS with a dedicated `DocumentsKey` (`StorageStack`) with automatic annual key rotation enabled (`enableKeyRotation: true`).
- **DynamoDB Table**: Encrypted with AWS-owned keys (default). Point-in-time recovery enabled.
- **SPA Bucket**: SSE-S3 (no sensitive data stored here).

### Encryption in Transit

- S3 bucket policy explicitly denies non-SSL requests (`DenyNonSSLRequests` policy statement in `StorageStack`).
- CloudFront enforces `REDIRECT_TO_HTTPS` viewer protocol policy with minimum `TLS_V1_2_2021` (`NetworkStack`).
- API Gateway HTTP API uses HTTPS-only endpoints.

### Web Application Firewall

- **WAF WebACL** (`NetworkStack`) protects CloudFront with five rules:
  1. `AWSManagedRulesCommonRuleSet` - OWASP Top 10 protections
  2. `AWSManagedRulesKnownBadInputsRuleSet` - known exploit patterns
  3. `AWSManagedRulesSQLiRuleSet` - SQL injection protection
  4. `AWSManagedRulesAmazonIpReputationList` - malicious IP blocking
  5. `RateLimitRule` - 2000 requests per 5 minutes per IP

### Least-Privilege IAM

- Each Lambda function in `ComputeStack` receives only the permissions it needs:
  - **Auth**: DynamoDB PutItem, GetItem, UpdateItem, Query
  - **Ingestion**: S3 PutObject/GetObject/DeleteObject, Textract AnalyzeExpense, Bedrock InvokeModel, DynamoDB write/read
  - **Query**: S3 GetObject (read-only), DynamoDB GetItem/Query (read-only), Bedrock InvokeModel
- No `*` on resource ARNs for DynamoDB or S3 actions (scoped to specific table and bucket).

### Authentication

- Cognito User Pool with JWT tokens (configured at deployment). API Gateway routes require valid Authorization header.
- Demo credentials (`demo@invoiceiq.example / Demo1234!Secure`) are synthetic with no access to real data.

### No Public S3

- Both S3 buckets use `BlockPublicAccess.BLOCK_ALL` (`StorageStack`).
- SPA content is served exclusively through CloudFront using Origin Access Control (OAC).

### PII Handling

- All fixture data is synthetic (see `fixtures/NOTICE.md`).
- Structured logger redacts sensitive fields before writing to CloudWatch.

---

## 3. Reliability

### Dead Letter Queues

- Every Lambda function has a dedicated SQS DLQ (`ComputeStack`) with 14-day retention:
  - `authDlq`, `ingestionDlq`, `queryDlq`
- Failed async invocations are captured for investigation and replay without data loss.

### Point-in-Time Recovery

- DynamoDB table has PITR enabled (`pointInTimeRecovery: true` in `StorageStack`), allowing restoration to any second in the last 35 days.

### S3 Versioning

- Documents bucket has versioning enabled (`versioned: true` in `StorageStack`), protecting against accidental overwrites and deletions.

### Multi-AZ Resilience

- Lambda functions run across multiple Availability Zones by default (AWS-managed).
- DynamoDB is inherently multi-AZ with synchronous replication.
- S3 provides 11 nines of durability across multiple AZs.

### API Throttling

- API Gateway stage has burst limit of 1000 and steady-state rate limit of 500 requests/second (`NetworkStack`), preventing overload cascades.

### Removal Policies

- Critical data stores (DynamoDB table, Documents bucket, KMS key) use `RemovalPolicy.RETAIN` to prevent accidental deletion during stack teardown.

---

## 4. Performance Efficiency

### Right-Sized Lambda Memory

- **Auth functions**: 256 MB / 10s timeout - lightweight JWT validation and DynamoDB lookups
- **Ingestion functions**: 512 MB / 60s timeout - document processing with Textract and Bedrock (CPU-intensive)
- **Query functions**: 256 MB / 30s timeout - DynamoDB reads and Bedrock recommendations

### DynamoDB On-Demand

- `BillingMode.PAY_PER_REQUEST` (`StorageStack`) automatically scales read/write capacity with zero capacity planning. Ideal for unpredictable hackathon demo traffic patterns.

### Global Secondary Indexes

- GSI1 and GSI2 enable efficient access patterns (e.g., queries by vendor, by date range, by status) without table scans.

### CloudFront Caching and Compression

- Static SPA assets are served from CloudFront edge locations with compression enabled (`compress: true` in `NetworkStack`).
- `PriceClass.PRICE_CLASS_100` uses the most cost-effective edge locations while still providing global coverage.
- SPA error pages (403, 404) redirect to `index.html` with zero TTL for client-side routing support.

### Optimized Bundling

- Lambda functions use `esbuild` via `NodejsFunction` construct with minification and source maps (`bundling: { minify: true, sourceMap: true }` in `ComputeStack`), reducing cold start times and package size.

---

## 5. Cost Optimization

### Pay-Per-Request DynamoDB

- `PAY_PER_REQUEST` billing means zero cost when idle and linear scaling with usage - no over-provisioned capacity burning money overnight.

### AWS Budgets with Alerts

- `CostStack` configures two budget guards:
  - **Daily budget**: $10/day with alert at 100% actual spend
  - **Monthly budget**: $50/month with alerts at 80% and 100% thresholds
- Both send SNS notifications to the operations team.

### S3 Lifecycle Policies

- Documents bucket transitions objects to:
  - **Infrequent Access** after 90 days (cost reduction ~40%)
  - **Glacier** after 365 days (cost reduction ~80%)
- This ensures historical invoices remain accessible but at minimal storage cost.

### CloudFront PriceClass_100

- Uses only the cheapest edge locations (North America, Europe), avoiding premium Asia-Pacific and South America PoPs that would inflate CDN costs for a demo application.

### Serverless-First Architecture

- No EC2 instances, no ECS clusters, no NAT Gateways. Every compute resource (Lambda, API Gateway, DynamoDB, S3, CloudFront) is pay-per-use with no idle costs.

### Right-Sized Timeouts

- Lambda timeouts are tuned to actual workload requirements (10s/60s/30s), preventing runaway invocations from accumulating unnecessary compute charges.

---

## 6. Sustainability

### No Idle Resources

- Fully serverless architecture means zero compute resources running when no requests are being processed. No VMs spinning at 5% utilization overnight.

### Right-Sized Compute

- Lambda memory allocations are matched to workload requirements. The ingestion function gets 512 MB for document processing; lighter functions get 256 MB. This minimizes the energy consumed per invocation.

### Efficient Document Processing Pipeline

- Documents are processed once (upload, extract, normalise, store) and results are cached in DynamoDB. Subsequent reads serve from the database without re-running Textract or Bedrock, avoiding redundant compute.

### Compressed Delivery

- CloudFront serves compressed assets to end users, reducing data transfer and network energy consumption.

### Minimal Infrastructure Footprint

- Single-table DynamoDB design eliminates the need for multiple tables, reducing the overall service footprint.
- Shared KMS key with automatic rotation avoids per-resource key proliferation.

---

## Summary

| Pillar | Key Mechanisms | Primary Stack |
|--------|---------------|---------------|
| Operational Excellence | CI/CD, X-Ray, structured logging, CloudWatch alarms | ObservabilityStack, CI workflow |
| Security | KMS, WAF, least-privilege IAM, HTTPS-only, Cognito JWT | StorageStack, NetworkStack, ComputeStack |
| Reliability | DLQ, PITR, S3 versioning, multi-AZ, throttling | ComputeStack, StorageStack, NetworkStack |
| Performance Efficiency | Right-sized Lambda, on-demand DynamoDB, CloudFront, esbuild | ComputeStack, StorageStack, NetworkStack |
| Cost Optimization | PAY_PER_REQUEST, Budgets alerts, lifecycle policies, PriceClass_100 | CostStack, StorageStack, NetworkStack |
| Sustainability | Serverless, right-sized compute, process-once pipeline, compression | All stacks |
