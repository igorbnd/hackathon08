# Technology Stack - InvoiceIQ

> **These decisions are locked.** Do not change any stack choice below without explicit approval from the project owner.

## Frontend

- React + TypeScript
- Vite as the build tool
- TailwindCSS for styling
- Single-page application (SPA)

## Backend

- AWS serverless architecture
- API Gateway (HTTP API) + AWS Lambda (Node.js 20, TypeScript)
- All business logic lives in Lambda

## Authentication

- Amazon Cognito user pools
- Email + password sign-up/sign-in
- MFA optional
- Hosted UI or Amplify UI components
- JWT authoriser on API Gateway

## Storage

- **Documents:** Amazon S3 for original uploaded documents (SSE-KMS, per-user key prefixes, no public access)
- **Structured data:** Amazon DynamoDB single-table design for canonical invoice JSON

## Document Extraction

- Amazon Textract (AnalyzeExpense API) for OCR and field extraction from PDFs and photos

## AI Reasoning

- Amazon Bedrock (Claude family model) for:
  - Normalisation into canonical JSON
  - Recommendation engine (what to do about each invoice)
  - Natural-language search over the user's invoice corpus

## Infrastructure as Code

- AWS CDK v2 in TypeScript
- Everything deployable with one command
- No click-ops

## Hosting

- S3 + CloudFront for the SPA, or AWS Amplify Hosting

## Observability

- CloudWatch structured JSON logs
- X-Ray tracing on Lambda
- CloudWatch alarms on error rate and Textract/Bedrock spend

## Testing

- Vitest for unit tests
- aws-sdk-client-mock for AWS service mocks
- Playwright for one happy-path end-to-end test

## Coding Standards

- Strict TypeScript (no `any`)
- Zod for all input validation at boundaries
- No secrets in code
- ESLint + Prettier enforced
