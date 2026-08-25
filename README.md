# InvoiceIQ

> An AI agent that turns the pile of bills, invoices, and subscription charges in someone's life into a single searchable, normalised record -- and tells them what to actually do about each one.

![InvoiceIQ Architecture](https://img.shields.io/badge/Built_with-Kiro-blue) ![AWS](https://img.shields.io/badge/Cloud-AWS-orange) ![TypeScript](https://img.shields.io/badge/Language-TypeScript-blue) ![License](https://img.shields.io/badge/License-MIT-green)

## Screenshots

| Dashboard | Invoice Detail & AI Recommendation |
|---|---|
| ![Dashboard](docs/screenshots/dashboard.png) | ![Invoice Detail](docs/screenshots/invoice-detail.png) |
![AI Recommendation with Evidence and Historical Comparison](docs/screenshots/ai-recommendation.png)

## Demo Video

[![InvoiceIQ Demo](https://img.youtube.com/vi/igqqwThtf-o/maxresdefault.jpg)](https://www.youtube.com/watch?v=igqqwThtf-o)


---

## The Problem

A new invoice arrives and you do not know whether it is legitimate, whether you already paid it, whether the amount changed since last time, whether you still use the service, or whether you should challenge it. Across utilities, telecoms, SaaS subscriptions, insurance, and council bills, a typical UK sole trader handles 10-200 invoices a year with no single view of what is happening.

## The Solution

InvoiceIQ extracts data from any uploaded document (PDF, photo, scan), normalises it into a canonical JSON schema, stores it alongside your full invoice history, and uses AI to compare the new invoice against your historical patterns. It then generates a plain-English recommendation: pay, challenge, investigate, or cancel.

## Key Features

- **Universal document ingestion** - Upload PDFs, photos, or scans. Textract OCR handles the extraction.
- **Canonical normalisation** - Every invoice is stored as one consistent JSON record regardless of source format.
- **AI-powered recommendations** - Bedrock Claude analyses your invoice history and tells you what to do.
- **Six demo stories** - Price rise detection, duplicate invoice flagging, overlapping SaaS licence detection, estimated reading anomaly, new line item alerting, and legitimate PAY confirmation.
- **Cross-vendor search** - Query your entire invoice corpus in natural language.
- **Cost-aware architecture** - Per-invoice processing costs under $0.05 with built-in budget alarms.

---

## Live Demo

| | |
|---|---|
| **URL** | [https://invoiceiq.igorbond.com](https://invoiceiq.igorbond.com) |
| **Username** | `demo@invoiceiq.example` |
| **Password** | `Demo1234!Secure` |

The demo environment is pre-seeded with 50 synthetic invoices across 10 fictional vendors spanning 24 months. No real personal data is used anywhere in the system.

---

## How Kiro Was Used

This project was built entirely with Kiro guiding the development process through steering files, specifications, and automated hooks. Below is a detailed walkthrough of how each Kiro feature contributed.

### Steering Files: Locking Decisions Early

Kiro steering files live at the repository root in [`.kiro/steering/`](.kiro/steering/) and act as immutable constraints that every subsequent generation must respect:

| Steering File | Purpose |
|---|---|
| [`.kiro/steering/product.md`](.kiro/steering/product.md) | Locks the product definition: one-line pitch, core user pain, primary user persona (UK sole trader, 10-200 invoices/year), the differentiator (canonical JSON normalisation), and explicit non-goals (no bank integration, no payment execution, no accounting ledger, no multi-tenant, no mobile app). |
| [`.kiro/steering/tech.md`](.kiro/steering/tech.md) | Locks every technology choice: React + Vite + Tailwind frontend, AWS Lambda Node.js 20 backend, Cognito auth, S3 + DynamoDB storage, Textract OCR, Bedrock Claude AI, CDK v2 IaC, Vitest testing, ESLint + Prettier standards. These cannot be changed without explicit approval. |
| [`.kiro/steering/structure.md`](.kiro/steering/structure.md) | Enforces the monorepo layout rule and the single-source-of-truth rule: the canonical invoice schema lives only in `/packages/schema` and both `/api` and `/web` must import from there. No other file may redefine invoice fields. |
| [`.kiro/steering/hackathon.md`](.kiro/steering/hackathon.md) | Encodes the 7 non-negotiable submission rules: `.kiro/` committed, no real PII, seeded demo always works, README completeness, attribution, free demo for judges, scope cuts over unfinished features. |

These steering files meant that every time Kiro generated code, it already knew the boundaries. There was no drift between "what we decided" and "what gets generated."

### The Spec Cycle: Requirements, Design, Tasks

The spec for the foundation and infrastructure layer lives in [`.kiro/specs/foundation-and-infra/`](.kiro/specs/foundation-and-infra/) and follows a three-stage cycle:

**Stage 1: Requirements** ([`requirements.md`](.kiro/specs/foundation-and-infra/requirements.md))

Kiro generated 10 testable requirements (R1.1 through R1.10) covering:
- R1.1: Monorepo scaffold with npm workspaces
- R1.2: CDK bootstrapping (S3, DynamoDB, API Gateway, CloudFront)
- R1.3: Least-privilege IAM roles per Lambda group
- R1.4: Structured JSON logging with PII redaction
- R1.5: CloudWatch alarms with configurable thresholds
- R1.6: SPA hosting via CloudFront with compression and SPA routing
- R1.7: Local development (Vite HMR + local Lambda harness)
- R1.8: CI readiness (GitHub Actions)
- R1.9: Security baseline (WAF, KMS, no public S3)
- R1.10: Cost controls (AWS Budgets)

Each requirement follows the "When X, the system shall Y" format, making them independently verifiable.

**Stage 2: Design** ([`design.md`](.kiro/specs/foundation-and-infra/design.md))

From those 10 requirements, Kiro produced a 13-section architecture document covering:
- CDK stack structure and naming conventions
- DynamoDB single-table design with access patterns
- S3 bucket structure with per-user key prefixes
- API Gateway route mapping
- CloudFront configuration with cache behaviours
- Lambda function groups with memory/timeout/IAM specifications
- Observability setup (structured logs, X-Ray, alarms)
- CI/CD pipeline design
- Local development approach
- Security controls (WAF rules, KMS, SSM)
- Cost controls (Budgets, SNS)
- Project dependencies per workspace
- CDK construct choices table

**Stage 3: Tasks** ([`tasks.md`](.kiro/specs/foundation-and-infra/tasks.md))

The design was broken into 16 ordered tasks with:
- Exact file paths to create or modify
- Code snippets and configuration details
- Acceptance criteria for each task
- A dependency graph (Task 8 blocks Tasks 9-10, Task 1 blocks all others, etc.)

This meant implementation was mechanical: pick the next unblocked task, follow its spec, verify its acceptance criteria, commit.

### Where Kiro's Output Needed Correction

Kiro is not infallible. Here are specific cases where its generated output needed manual intervention:

1. **CDK construct choices** - Kiro initially suggested `OAI` (Origin Access Identity) for CloudFront-to-S3 access. This is a legacy approach; AWS now recommends `OAC` (Origin Access Control). The design was corrected to use `S3OriginAccessControl`.

2. **WAF scope** - The initial CDK code used `scope: 'REGIONAL'` for the WAF WebACL. Since the WebACL protects a CloudFront distribution, it must be `scope: 'CLOUDFRONT'` and deployed in `us-east-1`. This required restructuring the stack dependencies.

3. **Lambda entry paths** - Kiro's design referenced `api/dist/handlers/auth/index.handler` as the Lambda handler path. With `NodejsFunction` (which bundles via esbuild), the entry path should point to the TypeScript source file, not compiled output. The actual entry is the `.ts` file and CDK handles transpilation.

4. **Fixture generation dependencies** - The seed script required GraphicsMagick (`gm`) as a system dependency for `pdf2pic`. This was not in the original spec and had to be documented with a preflight check.

5. **Invoice date spans** - The initial fixture set covered 12 months. For meaningful trend detection (the core differentiator), the corpus needed extending to 24 months of history, requiring additional invoice generation back to May 2022.

These corrections demonstrate that Kiro accelerates development significantly but requires an engineer who understands the domain to validate and adjust its output.

---

## Architecture

### System Diagram

```mermaid
flowchart TD
    subgraph User
        A[Upload Document]
    end

    subgraph Frontend
        B[React SPA via CloudFront]
    end

    subgraph API Layer
        C[API Gateway HTTP API]
        D[Lambda: Ingestion Group]
        E[Lambda: Query Group]
        F[Lambda: Auth Group]
    end

    subgraph AI & Extraction
        G[Amazon Textract AnalyzeExpense]
        H[Bedrock Claude: Normalise to JSON]
        I[Bedrock Claude: Compare & Recommend]
    end

    subgraph Storage
        J[S3: Original Documents]
        K[DynamoDB: Canonical Invoice Records]
    end

    subgraph Auth
        L[Amazon Cognito]
    end

    subgraph Observability
        M[CloudWatch Logs & Alarms]
        N[X-Ray Traces]
    end

    A --> B
    B --> C
    C --> F --> L
    C --> D
    C --> E

    D -->|Store original| J
    D -->|OCR extract| G
    G -->|Raw fields| H
    H -->|Canonical JSON| K
    K -->|Invoice history| I
    I -->|Recommendation| B

    E -->|Query| K
    E -->|AI search| I

    D --> M
    E --> M
    F --> M
    D --> N
```

### Data Flow: Upload to Recommendation

1. **Upload** - User uploads a PDF, photo, or scan through the React SPA.
2. **Store original** - The ingestion Lambda stores the raw document in S3 under the user's prefix (`users/{userId}/invoices/{invoiceId}/original.pdf`), encrypted with KMS.
3. **OCR extraction** - Amazon Textract `AnalyzeExpense` extracts structured fields (vendor, amounts, dates, line items) from the document.
4. **AI normalisation** - Bedrock Claude receives the raw Textract output and normalises it into the canonical invoice JSON schema, handling inconsistent formats and extracting semantic meaning.
5. **Store canonical** - The normalised invoice record is written to DynamoDB using the single-table design, indexed for querying by vendor, date, and status.
6. **AI recommendation** - Bedrock Claude receives the new invoice alongside the user's historical invoices for that vendor (queried via GSI1) and generates a recommendation: pay, challenge, investigate, or cancel.
7. **Display** - The frontend shows the invoice details, AI recommendation, and supporting evidence (e.g., "Price increased 18% since last invoice, contract expired 3 weeks ago").

---

## Canonical Invoice JSON Schema

Every invoice in InvoiceIQ is stored using this canonical schema (defined in [`packages/schema/`](packages/schema/)):

```typescript
// Canonical Invoice Schema (Zod)
const LineItemSchema = z.object({
  description: z.string(),
  quantity: z.number(),
  unitPrice: z.number(),
  amount: z.number(),
  vatRate: z.number().optional(),
});

const InvoiceSchema = z.object({
  invoiceId: z.string(),           // Unique identifier (e.g., "INV-NXW-2024-0201")
  vendorId: z.string(),            // Normalised vendor slug (e.g., "nexwave-fibre")
  vendorName: z.string(),          // Display name (e.g., "Nexwave Fibre Ltd")
  issueDate: z.string(),           // ISO date (e.g., "2024-02-05")
  dueDate: z.string(),             // ISO date
  referenceNumber: z.string(),     // Vendor's reference
  lineItems: z.array(LineItemSchema),
  subtotal: z.number(),
  vatAmount: z.number(),
  total: z.number(),
  currency: z.string(),            // ISO 4217 (e.g., "GBP")
  status: z.enum(["unpaid", "paid", "disputed", "cancelled"]),
  category: z.string(),            // e.g., "broadband", "electricity", "saas"
  metadata: z.record(z.unknown()), // Vendor/story-specific fields
});
```

### Worked Example: Price Rise Detection

The invoice below (from [`fixtures/invoices/nexwave-fibre-2024-02-001.json`](fixtures/invoices/nexwave-fibre-2024-02-001.json)) triggers InvoiceIQ's price-rise detection story:

```json
{
  "invoiceId": "INV-NXW-2024-0201",
  "vendorId": "nexwave-fibre",
  "vendorName": "Nexwave Fibre Ltd",
  "issueDate": "2024-02-05",
  "dueDate": "2024-02-20",
  "referenceNumber": "NXW/2024/00201",
  "lineItems": [
    {
      "description": "Fibre Unlimited 80 - Monthly subscription",
      "quantity": 1,
      "unitPrice": 41.29,
      "amount": 41.29,
      "vatRate": 20
    },
    {
      "description": "Line rental",
      "quantity": 1,
      "unitPrice": 12.00,
      "amount": 12.00,
      "vatRate": 20
    }
  ],
  "subtotal": 53.29,
  "vatAmount": 10.66,
  "total": 63.95,
  "currency": "GBP",
  "status": "unpaid",
  "category": "broadband",
  "metadata": {
    "contractStartDate": "2022-01-15",
    "contractEndDate": "2024-01-14",
    "priceIncreasePercent": 18,
    "priceIncreaseAppliedTo": "subscription-only",
    "previousSubscriptionPrice": 34.99,
    "previousTotal": 56.39,
    "noticeSent": false,
    "story": "price-rise-triggered"
  }
}
```

**What InvoiceIQ detects:** The subscription price jumped from GBP 34.99 to GBP 41.29 (an 18% increase). The contract ended 3 weeks before this invoice was issued. No price-increase notice was sent. InvoiceIQ recommends: *"Challenge this invoice. Your contract expired on 2024-01-14 and the provider applied an 18% price increase without notice. You may be entitled to exit without penalty or negotiate a new rate."*

---

## Setup and Local Development

### Prerequisites

- Node.js >= 20.0.0
- npm >= 9.0.0
- AWS CLI v2 (configured with credentials)
- Git

### Clone and Install

```bash
git clone https://github.com/igorbnd/hackathon08.git
cd hackathon08
npm install
```

This installs dependencies for all workspaces (`packages/schema`, `api`, `web`, `infra`) automatically via npm workspaces.

### Environment Variables

Copy the example environment file and fill in your values:

```bash
cp .env.example .env
```

See [`.env.example`](.env.example) for all required variables and their descriptions.

### Running Locally

**Frontend (React SPA with HMR):**

```bash
cd web
npm run dev
# Starts on http://localhost:5173
# API calls proxy to http://localhost:3001
```

**Backend (Local Lambda harness):**

```bash
cd api
npm run dev
# Starts Express server on http://localhost:3001
# Wraps Lambda handlers for local invocation
```

### Building

```bash
# Build all workspaces
npm run build

# Type-check without emitting
npm run typecheck

# Lint
npm run lint

# Format
npm run format
```

---

## Deployment

> **Full deployment runbook:** See [`docs/deployment.md`](docs/deployment.md) for the complete step-by-step guide including CDK bootstrap, DNS record setup, verification checklist, rollback, and teardown.

### Quick Overview

InvoiceIQ deploys across two AWS regions:
- **us-east-1** - ACM certificate (DNS validated) + WAF WebACL (CloudFront scope)
- **eu-west-2** - All application stacks (Storage, Network, Compute, Observability, Cost)

The deployment requires two manual DNS records in Cloudflare at specific points during the deploy process. Both records must be set to **DNS only (grey cloud, proxy OFF)**. See the [full runbook](docs/deployment.md) for exact instructions.

### Deploy

```bash
# Bootstrap CDK in both regions (first time only)
npx cdk bootstrap aws://ACCOUNT_ID/eu-west-2
npx cdk bootstrap aws://ACCOUNT_ID/us-east-1

# Deploy (will pause for DNS validation - see docs/deployment.md)
./scripts/deploy.sh --stage prod
```

### Seed Demo Data

```bash
npm run seed
```

Creates a demo user and 50 synthetic invoices:
- **Email:** `demo@invoiceiq.example`
- **Password:** `Demo1234!Secure`

### Teardown

```bash
./scripts/destroy.sh --stage prod
```

### Preview Changes

```bash
cd infra
npx cdk diff -c stage=prod
```

---

## Testing

### Unit Tests

```bash
# Run all workspace tests
npm run test

# Run with watch mode
npm run test:watch

# Run tests for a specific workspace
cd api && npx vitest run
cd web && npx vitest run
```

### CDK Synthesis Validation

```bash
cd infra
npx cdk synth
```

This validates all CloudFormation templates without deploying.

### Manual Testing Guide (5 Minutes for Judges)

1. **Log in** - Navigate to the demo URL and sign in with `demo@invoiceiq.example` / `Demo1234!Secure`.
2. **Browse invoices** - The dashboard shows 50 pre-seeded invoices across 10 vendors spanning 24 months.
3. **Check a recommendation** - Click any invoice from "Nexwave Fibre Ltd" dated February 2024. You should see the price-rise detection recommendation.
4. **Upload a new invoice** - Use one of the sample PDFs from `fixtures/pdfs/` or upload any PDF/image. Watch the processing pipeline extract, normalise, and recommend.
5. **Search** - Use natural language queries like "show me all invoices over 100 pounds" or "which vendors increased prices?"

### CI Pipeline

The [GitHub Actions workflow](.github/workflows/ci.yml) runs on every push and pull request:
- ESLint
- TypeScript type-checking
- Vitest unit tests
- CDK synth validation

---

## Costs

### Per-Invoice Processing Cost

| Service | Operation | Cost |
|---------|-----------|------|
| Amazon Textract | AnalyzeExpense (1 page) | ~$0.01 |
| Amazon Bedrock (Claude 3 Haiku) | Normalisation (~500 input tokens, ~800 output tokens) | ~$0.0011 |
| Amazon Bedrock (Claude 3 Haiku) | Recommendation (~2000 input tokens, ~500 output tokens) | ~$0.0011 |
| AWS Lambda | Ingestion (512MB, ~2s) | ~$0.000017 |
| AWS Lambda | Query (256MB, ~1s) | ~$0.000004 |
| Amazon DynamoDB | 3 writes (PutItem) | ~$0.00000375 |
| Amazon S3 | 2 PUTs + storage | ~$0.00001 |
| **Total per invoice** | | **~$0.02 - $0.05** |

### Monthly Demo Environment Cost

| Service | Estimate | Notes |
|---------|----------|-------|
| Textract | ~$0.50 | 50 seeded invoices |
| Bedrock | ~$0.15 | Normalisation + recommendations for corpus |
| Lambda | ~$0.10 | Invocations during judge testing |
| DynamoDB (on-demand) | ~$0.01 | $1.25/M writes, $0.25/M reads |
| S3 | ~$0.05 | Storage + requests |
| CloudFront | ~$1.00 | Free tier likely covers it |
| CloudWatch | ~$0.50 | Logs, metrics, alarms |
| Cognito | Free | < 50,000 MAU |
| **Total monthly estimate** | **~$5 - $15** | Light judge usage |

### Bedrock Token Pricing (Claude 3 Haiku)

- Input: ~$0.00025 per 1,000 tokens
- Output: ~$0.00125 per 1,000 tokens

### DynamoDB On-Demand Pricing

- Write: $1.25 per million write request units
- Read: $0.25 per million read request units

### S3 Pricing

- Storage: $0.023 per GB/month
- PUT requests: $0.005 per 1,000 requests
- GET requests: $0.0004 per 1,000 requests

---

## Rate Limits and Usage Restrictions

| Service | Limit | Notes |
|---------|-------|-------|
| API Gateway | 1,000 req/s burst, 500 req/s steady | Per-stage throttling |
| WAF | 2,000 requests per 5 minutes per IP | Rate-based rule |
| Textract | 5 pages/day (dev), configurable via CDK context | Budget alarm at threshold |
| Bedrock (Claude) | 10 calls/day (dev), configurable via CDK context | Budget alarm at threshold |
| Lambda concurrency | 50 reserved (dev), 200 (prod) | Per function group |
| Cognito | 50,000 MAU free tier | Email + password auth |
| S3 uploads | 5GB max object size | API Gateway payload limit is lower (10MB) |

Bedrock model access must be explicitly enabled in the AWS console for the target region. Claude 3 Haiku is recommended for cost efficiency; Claude 3 Sonnet can be used for higher quality at ~10x the cost.

---

## Security and Privacy

### Data Protection

- **No real personal data** is used anywhere in this project. All invoices are synthetic, all vendors are fictional, and the demo user is a placeholder.
- **KMS encryption** on the S3 documents bucket (dedicated CMK per environment).
- **Block all public access** on all S3 buckets.
- **SSL-only** bucket policies reject non-HTTPS requests.
- **DynamoDB PITR** (Point-in-Time Recovery) enabled for data durability.
- **Per-user key prefixes** in S3 prevent cross-user document access.

### Network Security

- **WAF WebACL** attached to CloudFront with AWS managed rule groups:
  - CommonRuleSet
  - KnownBadInputsRuleSet
  - SQLiRuleSet
  - AmazonIpReputationList
  - Rate limiting (2,000 req/5min per IP)
- **HTTPS only** via CloudFront (HTTP redirects to HTTPS, TLS 1.2 minimum).
- **CORS** restricted to known origins.

### Authentication

- **Amazon Cognito** user pools with email + password sign-in.
- **JWT authorizer** on all API Gateway routes except `/auth/*`.
- **No secrets in code** - all secrets via SSM Parameter Store SecureString.

### Logging and PII

- Structured JSON logs never contain PII (email, name, address, document content).
- Only IDs and metadata are logged.
- X-Ray traces provide request correlation without exposing sensitive data.

---

## Attribution

### Frameworks and Libraries

| Package | License | Usage |
|---------|---------|-------|
| [React](https://react.dev/) | MIT | UI framework |
| [react-dom](https://react.dev/) | MIT | React DOM renderer |
| [react-router-dom](https://reactrouter.com/) | MIT | Client-side routing |
| [Vite](https://vitejs.dev/) | MIT | Build tool and dev server |
| [@vitejs/plugin-react](https://vitejs.dev/) | MIT | React support for Vite |
| [TailwindCSS](https://tailwindcss.com/) | MIT | Utility-first CSS |
| [PostCSS](https://postcss.org/) | MIT | CSS processing |
| [Autoprefixer](https://github.com/postcss/autoprefixer) | MIT | CSS vendor prefixing |
| [Zod](https://zod.dev/) | MIT | Schema validation |
| [Express](https://expressjs.com/) | MIT | Local dev server |
| [TypeScript](https://www.typescriptlang.org/) | Apache-2.0 | Language |
| [tsx](https://github.com/privatenumber/tsx) | MIT | TypeScript execution |

### AWS and Infrastructure

| Package | License | Usage |
|---------|---------|-------|
| [AWS CDK v2](https://aws.amazon.com/cdk/) | Apache-2.0 | Infrastructure as Code |
| [constructs](https://github.com/aws/constructs) | Apache-2.0 | CDK construct library |
| [@aws-sdk/client-dynamodb](https://github.com/aws/aws-sdk-js-v3) | Apache-2.0 | DynamoDB client |
| [@aws-sdk/client-s3](https://github.com/aws/aws-sdk-js-v3) | Apache-2.0 | S3 client |
| [@aws-sdk/client-textract](https://github.com/aws/aws-sdk-js-v3) | Apache-2.0 | Textract client |
| [@aws-sdk/client-bedrock-runtime](https://github.com/aws/aws-sdk-js-v3) | Apache-2.0 | Bedrock client |
| [@aws-sdk/client-cognito-identity-provider](https://github.com/aws/aws-sdk-js-v3) | Apache-2.0 | Cognito client |
| [aws-xray-sdk](https://github.com/aws/aws-xray-sdk-node) | Apache-2.0 | Distributed tracing |
| [source-map-support](https://github.com/evanw/node-source-map-support) | MIT | Stack trace mapping |

### Testing and Quality

| Package | License | Usage |
|---------|---------|-------|
| [Vitest](https://vitest.dev/) | MIT | Unit testing |
| [ESLint](https://eslint.org/) | MIT | Linting |
| [Prettier](https://prettier.io/) | MIT | Code formatting |

### Fixtures and Generation

| Package | License | Usage |
|---------|---------|-------|
| [PDFKit](http://pdfkit.org/) | MIT | PDF generation for fixtures |
| [pdf2pic](https://github.com/yakovmeister/pdf2image) | MIT | PDF to image conversion for scan fixtures |
| [sharp](https://sharp.pixelplumbing.com/) | Apache-2.0 | Image processing for scan degradation |

### AWS Services Used

Amazon S3, Amazon DynamoDB, AWS Lambda, Amazon API Gateway, Amazon CloudFront, AWS WAF, Amazon Cognito, Amazon Textract, Amazon Bedrock (Claude), Amazon CloudWatch, AWS KMS, Amazon SNS, Amazon SQS, AWS Budgets.

### Data

All invoice data is **entirely synthetic**. Vendor names, addresses, invoice numbers, and amounts are fictional and generated for demonstration purposes. See [`fixtures/NOTICE.md`](fixtures/NOTICE.md) for details.

---

## Licence

This project is licensed under the [MIT License](LICENSE).

---

## Disclaimer

InvoiceIQ recommendations are **informational only** and do not constitute legal, tax, or financial advice. Users should consult qualified professionals before making financial decisions based on the system's output. The AI-generated recommendations are suggestions based on pattern analysis and may not account for all relevant circumstances.
