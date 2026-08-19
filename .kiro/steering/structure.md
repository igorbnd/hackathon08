# Repository Structure - InvoiceIQ

## Monorepo Layout

```
/infra              CDK app
/api                Lambda handlers, domain logic, shared types
/web                React SPA
/packages/schema    The canonical invoice JSON schema + zod types, shared by api & web
/docs               Architecture, Well-Architected review, demo script
/.kiro              Specs, steering, hooks
```

## Rules

### Single Source of Truth

The canonical invoice schema lives in `/packages/schema`. This package is the single source of truth for all invoice fields. **No other file in the repository may redefine invoice fields.** Both `/api` and `/web` must import the schema from this package.
