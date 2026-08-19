# Tasks: foundation-and-infra

## Task 1 - Root package.json with npm workspaces

**Commit:** `chore: initialize root package.json with npm workspaces`

**What to do:**
Create the root `package.json` that declares all four workspaces and shared dev scripts. The workspaces array enables npm to hoist dependencies and link local packages automatically.

**Files created:**
- `package.json`

**Details:**
```jsonc
{
  "name": "invoiceiq",
  "private": true,
  "workspaces": [
    "packages/schema",
    "api",
    "web",
    "infra"
  ],
  "scripts": {
    "lint": "eslint . --ext .ts,.tsx",
    "typecheck": "tsc --build",
    "test": "vitest run",
    "test:watch": "vitest",
    "build": "npm run build --workspaces --if-present"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
```

**Acceptance criteria:**
- `cat package.json` shows correct workspaces array with all four workspace paths
- `node -e "console.log(JSON.parse(require('fs').readFileSync('package.json','utf8')).workspaces)"` prints the array without errors

---

## Task 2 - Schema workspace skeleton

**Commit:** `feat(schema): add packages/schema workspace skeleton`

**What to do:**
Create the `/packages/schema` workspace with its own `package.json`, `tsconfig.json`, and a placeholder `src/index.ts` exporting an empty object. This workspace will hold shared Zod schemas consumed by both `/api` and `/web`.

**Files created:**
- `packages/schema/package.json`
- `packages/schema/tsconfig.json`
- `packages/schema/src/index.ts`

**Details:**

`packages/schema/package.json`:
```jsonc
{
  "name": "@invoiceiq/schema",
  "version": "0.1.0",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  },
  "dependencies": {
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "typescript": "^5.5.0"
  }
}
```

`packages/schema/tsconfig.json`:
```jsonc
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "composite": true,
    "declaration": true
  },
  "include": ["src/**/*"]
}
```

`packages/schema/src/index.ts`:
```typescript
// Placeholder - shared Zod schemas will be defined here
export {};
```

**Acceptance criteria:**
- Directory `packages/schema/src/` exists with `index.ts`
- `cat packages/schema/package.json | jq .name` returns `@invoiceiq/schema`

**Dependency blocker:** All other workspaces depend on this package existing for workspace resolution.

---

## Task 3 - API workspace skeleton

**Commit:** `feat(api): add api workspace skeleton`

**What to do:**
Create the `/api` workspace with `package.json`, `tsconfig.json`, a placeholder handler, and a local dev server entry point.

**Files created:**
- `api/package.json`
- `api/tsconfig.json`
- `api/src/handlers/auth/index.ts` (placeholder)
- `api/src/handlers/ingestion/index.ts` (placeholder)
- `api/src/handlers/query/index.ts` (placeholder)
- `api/src/local/server.ts` (placeholder local dev server)
- `api/src/lib/logger.ts` (placeholder)

**Details:**

`api/package.json`:
```jsonc
{
  "name": "@invoiceiq/api",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "build": "tsc",
    "dev": "tsx watch src/local/server.ts",
    "test": "vitest run"
  },
  "dependencies": {
    "@invoiceiq/schema": "*",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/aws-lambda": "^8.10.140",
    "tsx": "^4.16.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

Handler placeholders export a stub Lambda handler:
```typescript
import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  return { statusCode: 200, body: JSON.stringify({ message: 'not implemented' }) };
};
```

**Acceptance criteria:**
- Directory structure `api/src/handlers/{auth,ingestion,query}/` exists
- `cat api/package.json | jq .name` returns `@invoiceiq/api`
- `api/src/local/server.ts` exists

---

## Task 4 - Web workspace skeleton (Vite + React + Tailwind)

**Commit:** `feat(web): add web workspace skeleton with Vite, React, and Tailwind`

**What to do:**
Create the `/web` workspace with Vite + React + Tailwind CSS configured. Include a minimal `App.tsx`, `main.tsx`, `index.html`, `vite.config.ts`, `tailwind.config.ts`, and `postcss.config.js`.

**Files created:**
- `web/package.json`
- `web/tsconfig.json`
- `web/tsconfig.node.json`
- `web/vite.config.ts`
- `web/tailwind.config.ts`
- `web/postcss.config.js`
- `web/index.html`
- `web/src/main.tsx`
- `web/src/App.tsx`
- `web/src/index.css`

**Details:**

`web/package.json`:
```jsonc
{
  "name": "@invoiceiq/web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "dependencies": {
    "@invoiceiq/schema": "*",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "react-router-dom": "^6.24.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.5.0",
    "vite": "^5.4.0",
    "vitest": "^2.0.0"
  }
}
```

`web/vite.config.ts` must include the API proxy to localhost:3001 and the React plugin.

`web/tailwind.config.ts` must scan `./src/**/*.{ts,tsx}` for classes.

**Acceptance criteria:**
- `web/index.html` contains a `<div id="root">` element
- `web/src/App.tsx` renders a basic component
- `web/vite.config.ts` includes `server.proxy` config for `/api` pointing to `http://localhost:3001`
- Tailwind directives (`@tailwind base; @tailwind components; @tailwind utilities;`) present in `web/src/index.css`

---

## Task 5 - Infra workspace skeleton (CDK app entry point)

**Commit:** `feat(infra): add infra workspace skeleton with CDK app entry`

**What to do:**
Create the `/infra` workspace with CDK v2 dependencies, `cdk.json`, `tsconfig.json`, and the CDK app entry point at `infra/bin/app.ts`. Include empty stack files as placeholders.

**Files created:**
- `infra/package.json`
- `infra/tsconfig.json`
- `infra/cdk.json`
- `infra/bin/app.ts`
- `infra/lib/storage-stack.ts` (placeholder)
- `infra/lib/network-stack.ts` (placeholder)
- `infra/lib/compute-stack.ts` (placeholder)
- `infra/lib/observability-stack.ts` (placeholder)
- `infra/lib/cost-stack.ts` (placeholder)

**Details:**

`infra/cdk.json`:
```jsonc
{
  "app": "npx ts-node --prefer-ts-exts bin/app.ts",
  "context": {
    "stage": "dev",
    "alertEmail": "team@example.com",
    "textractDailyLimit": 5,
    "bedrockDailyLimit": 10
  }
}
```

`infra/bin/app.ts` should instantiate all five stacks per the design document architecture.

Each placeholder stack file exports a minimal class extending `cdk.Stack`.

**Acceptance criteria:**
- `infra/cdk.json` exists and contains the `app` command and `context` keys
- `infra/bin/app.ts` imports and instantiates all five stacks
- Each stack placeholder in `infra/lib/` exports a class extending `cdk.Stack`
- `cat infra/package.json | jq .dependencies` includes `aws-cdk-lib` and `constructs`

---

## Task 6 - Shared TypeScript configuration

**Commit:** `chore: add shared TypeScript base config and project references`

**What to do:**
Create a root `tsconfig.base.json` with strict settings shared by all workspaces, and a root `tsconfig.json` that uses project references to point at each workspace.

**Files created:**
- `tsconfig.base.json`
- `tsconfig.json`

**Details:**

`tsconfig.base.json`:
```jsonc
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

`tsconfig.json` (root, for `tsc --build`):
```jsonc
{
  "files": [],
  "references": [
    { "path": "packages/schema" },
    { "path": "api" },
    { "path": "web" },
    { "path": "infra" }
  ]
}
```

**Acceptance criteria:**
- `tsconfig.base.json` has `"strict": true`
- `tsconfig.json` at root has `references` array with all four workspace paths
- Each workspace tsconfig (from tasks 2-5) extends `../../tsconfig.base.json` or `../tsconfig.base.json` as appropriate

---

## Task 7 - ESLint and Prettier configuration

**Commit:** `chore: add ESLint and Prettier configuration`

**What to do:**
Add ESLint (flat config or legacy, consistent with Node 20 + TypeScript) and Prettier with shared configs at root. All workspaces inherit the root configuration.

**Files created:**
- `.eslintrc.cjs` (or `eslint.config.mjs` if using flat config)
- `.prettierrc`
- `.prettierignore`

**Files modified:**
- `package.json` (add devDependencies for eslint, prettier, and related plugins)

**Details:**

ESLint should include:
- `@typescript-eslint/parser`
- `@typescript-eslint/eslint-plugin`
- `eslint-plugin-react` and `eslint-plugin-react-hooks` (for web workspace)
- `eslint-config-prettier` (to disable conflicting rules)

Prettier config:
```jsonc
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2
}
```

**Acceptance criteria:**
- Running `npx eslint --print-config api/src/handlers/auth/index.ts` does not error (after npm install)
- `.prettierrc` exists with the specified settings
- `package.json` devDependencies include `eslint`, `prettier`, `@typescript-eslint/parser`

---

## Task 8 - CDK StorageStack (S3 + DynamoDB + KMS)

**Commit:** `feat(infra): implement StorageStack with S3, DynamoDB, and KMS`

**What to do:**
Implement `infra/lib/storage-stack.ts` with all resources from design sections 2 and 3: KMS key, documents S3 bucket (SSE-KMS, block-all-public, versioned, lifecycle rules), SPA hosting bucket, and DynamoDB single-table with GSI1 and GSI2.

**Files modified:**
- `infra/lib/storage-stack.ts`

**Details:**
- KMS key: `invoiceiq-{stage}-documents-key`
- Documents bucket: SSE-KMS, BlockPublicAccess.BLOCK_ALL, versioning enabled, lifecycle (IA 90d, Glacier 365d), SSL-only bucket policy
- SPA bucket: SSE-S3, BlockPublicAccess.BLOCK_ALL, no versioning
- DynamoDB table: PAY_PER_REQUEST, PK/SK string keys, GSI1 (GSI1PK/GSI1SK), GSI2 (GSI2PK/GSI2SK), PITR enabled
- Export bucket, table, and KMS key as stack properties for cross-stack references

**Acceptance criteria:**
- `cd infra && npx cdk synth` succeeds without errors
- Synthesized template includes `AWS::KMS::Key`, `AWS::S3::Bucket` (x2), `AWS::DynamoDB::Table`
- DynamoDB table has two GSIs in the template

---

## Task 9 - CDK NetworkStack (API Gateway + CloudFront + WAF)

**Commit:** `feat(infra): implement NetworkStack with API Gateway, CloudFront, and WAF`

**What to do:**
Implement `infra/lib/network-stack.ts` with: HTTP API Gateway (CORS, throttling, default stage), CloudFront distribution (OAC to SPA bucket, HTTPS redirect, compression, SPA error pages), and WAF WebACL with managed rule groups.

**Files modified:**
- `infra/lib/network-stack.ts`

**Details:**
- HTTP API: name `invoiceiq-{stage}-api`, CORS for localhost:5173 (dev) and production domain, throttling 1000 burst / 500 steady
- CloudFront: OAC to SPA bucket, PriceClass_100, custom error responses (403/404 -> /index.html), TLS 1.2 minimum
- WAF WebACL (us-east-1 scope for CloudFront): CommonRuleSet, KnownBadInputsRuleSet, SQLiRuleSet, AmazonIpReputationList, rate limit 2000/5min
- Export API endpoint and CloudFront distribution as stack properties

**Acceptance criteria:**
- `cd infra && npx cdk synth` succeeds
- Synthesized template includes `AWS::ApiGatewayV2::Api`, `AWS::CloudFront::Distribution`, `AWS::WAFv2::WebACL`

---

## Task 10 - CDK ComputeStack (Lambda groups + IAM roles)

**Commit:** `feat(infra): implement ComputeStack with Lambda groups and IAM roles`

**What to do:**
Implement `infra/lib/compute-stack.ts` with three Lambda function groups (auth, ingestion, query), each with a dedicated least-privilege IAM role. Use `NodejsFunction` for esbuild bundling.

**Files modified:**
- `infra/lib/compute-stack.ts`

**Details:**
- Auth group: 256MB, 10s timeout, DynamoDB + Cognito permissions
- Ingestion group: 512MB, 60s timeout, S3 + Textract + Bedrock + DynamoDB permissions
- Query group: 256MB, 30s timeout, S3 read + DynamoDB query + Bedrock permissions
- All functions: X-Ray active tracing, environment vars (TABLE_NAME, DOCUMENTS_BUCKET, STAGE), DLQ (SQS)
- Reserved concurrency: read from context (50 dev, 200 prod)
- Integration with API Gateway routes from NetworkStack

**Acceptance criteria:**
- `cd infra && npx cdk synth` succeeds
- Synthesized template includes `AWS::Lambda::Function` (x3), `AWS::IAM::Role` (x3)
- Each IAM role has a distinct policy document scoped to its function group

---

## Task 11 - CDK ObservabilityStack (CloudWatch alarms)

**Commit:** `feat(infra): implement ObservabilityStack with CloudWatch alarms`

**What to do:**
Implement `infra/lib/observability-stack.ts` with CloudWatch alarms and an SNS notification topic for alerting.

**Files modified:**
- `infra/lib/observability-stack.ts`

**Details:**
- SNS topic for alarm notifications (reuses alert email from context)
- Lambda error rate alarm: > 1% over 5 minutes
- API Gateway 5xx alarm: > 5 in 5 minutes
- DynamoDB throttle alarm: > 0 in 1 minute
- Textract daily spend alarm: threshold from context (`textractDailyLimit`)
- Bedrock daily spend alarm: threshold from context (`bedrockDailyLimit`)
- All alarms notify via SNS

**Acceptance criteria:**
- `cd infra && npx cdk synth` succeeds
- Synthesized template includes `AWS::CloudWatch::Alarm` resources (at least 3)
- SNS topic and subscription present in template

---

## Task 12 - CDK CostStack (Budgets + SNS)

**Commit:** `feat(infra): implement CostStack with AWS Budgets and SNS alerts`

**What to do:**
Implement `infra/lib/cost-stack.ts` with AWS Budgets for daily ($10) and monthly ($50) spend limits, notifying via SNS.

**Files modified:**
- `infra/lib/cost-stack.ts`

**Details:**
- SNS topic: `invoiceiq-{stage}-budget-alerts`
- Daily budget: $10 COST budget, notification at 100% actual threshold
- Monthly budget: $50 COST budget, notification at 80% and 100% actual threshold
- Email subscription from CDK context `alertEmail`
- Uses L1 `CfnBudget` construct (no L2 available)

**Acceptance criteria:**
- `cd infra && npx cdk synth` succeeds
- Synthesized template includes `AWS::Budgets::Budget` (x2) and `AWS::SNS::Topic`

---

## Task 13 - Structured logger utility

**Commit:** `feat(api): implement structured JSON logger utility`

**What to do:**
Implement `api/src/lib/logger.ts` with a structured logger that outputs JSON lines with the fields defined in the design (timestamp, level, requestId, userId, action, duration, message, traceId, error). Ensure no PII is logged.

**Files modified:**
- `api/src/lib/logger.ts`

**Files created:**
- `api/src/lib/logger.test.ts`

**Details:**
- Logger class or factory function accepting context (requestId, userId, traceId)
- Methods: `info()`, `warn()`, `error()`, `debug()`
- Each log line is a single JSON object written to stdout
- `duration` field populated via a timer helper (start/stop pattern)
- `error` field serializes Error objects safely (message + stack, no circular refs)
- PII guard: reject known PII field names (email, name, address) if accidentally passed

**Acceptance criteria:**
- `cd api && npx vitest run src/lib/logger.test.ts` passes
- Test verifies JSON output includes `timestamp`, `level`, `requestId`, `message`
- Test verifies PII fields are stripped or rejected

---

## Task 14 - Local dev server setup

**Commit:** `feat(api): implement local Express dev server for Lambda handlers`

**What to do:**
Implement `api/src/local/server.ts` as a lightweight Express server that maps HTTP routes to the Lambda handler functions, simulating API Gateway locally.

**Files modified:**
- `api/src/local/server.ts`

**Files created:**
- `api/src/local/lambda-adapter.ts` (utility to wrap handlers)

**Details:**
- Express server listening on port 3001
- Route mapping mirrors API Gateway routes from design section 4
- `lambda-adapter.ts` converts Express req/res into APIGatewayProxyEventV2 and invokes the handler
- dotenv loaded for local environment variables
- Startup message logs `Local API server running on http://localhost:3001`

**Dependencies added to `api/package.json`:**
- `express` (runtime)
- `@types/express` (dev)
- `dotenv` (runtime)

**Acceptance criteria:**
- `cd api && npx tsx src/local/server.ts &` starts server on port 3001
- `curl http://localhost:3001/invoices` returns a 200 JSON response
- Server process can be killed cleanly

---

## Task 15 - GitHub Actions CI workflow

**Commit:** `ci: add GitHub Actions CI workflow`

**What to do:**
Create `.github/workflows/ci.yml` that runs lint, type-check, unit tests, and CDK synth on every push and pull request.

**Files created:**
- `.github/workflows/ci.yml`

**Details:**
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

**Acceptance criteria:**
- `.github/workflows/ci.yml` exists and is valid YAML
- Workflow triggers on both `push` and `pull_request`
- All five steps (checkout, setup-node, install, lint/typecheck/test, synth) are present
- Node version is 20

**Dependency blocker:** This is required by R1.8 and validates all other tasks work together.

---

## Task 16 - Vitest configuration

**Commit:** `chore: add Vitest configuration with workspace support`

**What to do:**
Add Vitest configuration at root level and per-workspace so that `npm run test` from root runs all workspace tests, and individual workspaces can run tests independently.

**Files created:**
- `vitest.workspace.ts`

**Files modified:**
- `api/package.json` (ensure test script uses vitest)
- `web/package.json` (ensure test script uses vitest)

**Details:**

`vitest.workspace.ts` (root):
```typescript
import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  'packages/schema',
  'api',
  'web',
]);
```

Root `package.json` already has `"test": "vitest run"` from Task 1.

Each workspace should have a `vitest.config.ts` if needed (web needs jsdom environment for React testing).

**Files created (additional):**
- `web/vitest.config.ts` (with `environment: 'jsdom'` and react plugin)
- `api/vitest.config.ts` (with `environment: 'node'`)

**Acceptance criteria:**
- `npm run test` at root runs tests across all workspaces (exits 0 with no test files or with passing tests)
- `cd api && npx vitest run` works independently
- `cd web && npx vitest run` works independently
- `web/vitest.config.ts` specifies `jsdom` environment

---

## Dependency Notes

| Task | Blocks |
|------|--------|
| Task 1 (root package.json) | All subsequent tasks (workspace resolution) |
| Task 2 (schema) | Tasks 3, 4 (they depend on `@invoiceiq/schema`) |
| Task 5 (infra skeleton) | Tasks 8-12 (CDK stacks) |
| Task 6 (tsconfig) | Tasks 7, 8-16 (TypeScript compilation) |
| Task 8 (StorageStack) | Tasks 9, 10 (cross-stack references) |
| Task 9 (NetworkStack) | Task 10 (API routes need Lambda integrations) |
| Task 10 (ComputeStack) | Task 11 (alarms reference Lambda functions) |

**Recommended execution order:** Tasks 1 through 16 as numbered above. Tasks 11 and 12 can be parallelized. Tasks 13, 14, 15, and 16 are largely independent of each other but depend on the workspace skeletons (Tasks 1-6).
