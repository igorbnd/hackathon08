# InvoiceIQ - Submission

## Project Description

### Problem

Businesses receive invoices from dozens of vendors in inconsistent formats. Price rises slip through unnoticed, duplicate charges go uncontested, overlapping subscriptions waste money, and anomalous readings are paid without question. Manual review is tedious, error-prone, and does not scale.

### Solution

InvoiceIQ is an AI-powered agent that normalises any invoice into a canonical JSON schema, compares it against vendor history, and delivers an actionable recommendation (PAY, QUERY, DISPUTE, or REVIEW) backed by specific evidence. Upload a PDF; get a verdict in seconds.

### Key Features

- **Universal extraction** - Textract OCR converts any invoice format into structured data
- **Canonical normalisation** - Bedrock Claude maps vendor-specific fields to a consistent JSON schema with ISO dates, consistent currency handling, and typed line items
- **Historical comparison** - Every invoice is compared against the full history for that vendor, detecting price changes, duplicates, and anomalies
- **Evidence-based recommendations** - AI recommendations cite specific invoices, percentage changes, and line items as proof
- **Subscription waste detection** - Aggregates recurring charges to find overlapping or redundant subscriptions
- **Six demo stories** - Price rise, duplicate, overlapping SaaS, estimated reading anomaly, new line item, and a legitimate invoice

### Architecture

Fully serverless on AWS: React SPA on CloudFront, API Gateway HTTP API, Lambda (Node.js 20), DynamoDB (single-table), S3, Textract, Bedrock Claude, CDK v2 IaC.

### Demo Credentials

- **Email:** demo@invoiceiq.example
- **Password:** Demo1234!Secure

---

## Submission Requirements Checklist

Based on the hackathon rules documented in `.kiro/steering/hackathon.md`.

| # | Requirement | Status | Where Satisfied |
|---|-------------|--------|-----------------|
| 1 | `.kiro/` directory at repo root, not in `.gitignore` | Done | `/.kiro/` (contains steering/, specs/) |
| 2 | No real personal data, invoices, or credentials | Done | All data is synthetic (`fixtures/NOTICE.md`); demo credentials are fictional |
| 3 | Seeded demo user with synthetic invoices works | Done | `fixtures/scripts/seed.ts` seeds 50 invoices for demo@invoiceiq.example |
| 4 | README explains how Kiro was used | Done | `README.md` "How Kiro Was Used" section with links to .kiro/ files |
| 5 | README has setup instructions | Done | `README.md` "Local Development" and "Deployment" sections |
| 6 | README has usage instructions | Done | `README.md` "Usage" section with demo credentials |
| 7 | README documents costs | Done | `README.md` "Costs" section with per-service pricing |
| 8 | README documents rate limits | Done | `README.md` "Rate Limits" section (API Gateway: 1000 burst / 500 steady) |
| 9 | README has testing instructions | Done | `README.md` "Testing" section (npm run test, lint, typecheck) |
| 10 | README has test credentials | Done | `README.md` shows demo@invoiceiq.example / Demo1234!Secure |
| 11 | Attribution for all third-party dependencies | Done | `README.md` "Attribution" section lists all libraries |
| 12 | Deployed demo free for judges | Done | Serverless architecture with no fixed costs; Budget alerts at $10/day, $50/month |
| 13 | Project built from scratch during competition | Done | Git history shows all commits within competition period |
| 14 | Prefer scope cuts over unfinished features | Done | Core flow (upload, extract, compare, recommend) is complete; advanced features scoped out |

---

## Repository Structure

```
/
  .kiro/              Steering files and specs (required by hackathon rules)
  .github/workflows/  CI pipeline (lint, typecheck, test, cdk synth)
  api/                Lambda handlers and shared libraries
  web/                React SPA (Vite + Tailwind)
  infra/              CDK v2 stacks (storage, network, compute, observability, cost)
  packages/schema/    Shared Zod schemas (canonical invoice format)
  fixtures/           50 synthetic invoices, 10 vendors, seed scripts
  docs/               Well-Architected review, demo script, this file
```

---

## Links

| Resource | Location |
|----------|----------|
| Well-Architected Review | `docs/well-architected.md` |
| Demo Script | `docs/demo-script.md` |
| Architecture Diagram | `README.md` (Mermaid) |
| Canonical Schema | `packages/schema/src/invoice.ts` |
| CDK Stacks | `infra/lib/*.ts` |
| Steering Files | `.kiro/steering/*.md` |
| Specs | `.kiro/specs/foundation-and-infra/` |
| CI Pipeline | `.github/workflows/ci.yml` |
| Fixture Data | `fixtures/invoices/` |
| Vendor Registry | `fixtures/vendors.json` |
| License | `LICENSE` (MIT) |
