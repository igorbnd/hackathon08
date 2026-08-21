# hackathon08

## Fixtures & Seed Data

The `/fixtures` directory contains a complete synthetic invoice corpus for demos,
integration tests, and the seeded demo account. All data is entirely fictional with
no real companies, people, or identifiable information.

### What is included

- **`/fixtures/vendors.json`** - 10 fictional vendor profiles (addresses, tax IDs, etc.)
- **`/fixtures/invoices/`** - ~40 invoice JSON files spanning 24 months across all vendors
- **`/fixtures/pdfs/`** - Generated PDF invoices (created by the generate script)
- **`/fixtures/scans/`** - Deliberately degraded scan images (skewed, low contrast, phone photo, cropped)
- **`/fixtures/NOTICE.md`** - Synthetic data declaration

### Demo stories seeded in the data

| Story | Vendor | What to look for |
|-------|--------|------------------|
| Price rise without notice | Nexwave Fibre | 18% increase after contract end date |
| Duplicate invoice | Pinnacle Office Supplies | Same items/amounts, different reference numbers |
| Overlapping SaaS licences | CloudDeck Pro | Two active licences billed in the same months |
| Estimated reading anomaly | Greendale Energy | Estimated reading ~74% above 12-month mean |
| New line item never seen | Brightpath Consulting | "Platform Migration Fee" first appears Jan 2024 |
| Legitimate (PAY) | Elmwood Stationery | Unremarkable, consistent with history |

### Generating PDFs

```bash
cd fixtures/scripts
npm install
npm run generate-pdfs
```

### Generating imperfect scans

Requires PDFs to be generated first:

```bash
cd fixtures/scripts
npm run generate-scans
```

### Running the seed script

Seeds the deployed environment with the demo user and all invoice data:

```bash
# Set required environment variables from CDK stack outputs
export COGNITO_USER_POOL_ID=<your-user-pool-id>
export S3_BUCKET_NAME=<your-bucket-name>
export DYNAMODB_TABLE_NAME=<your-table-name>
export AWS_REGION=eu-west-2

# Run the seed
npm run seed
```

Or from the repo root:

```bash
npm run seed
```

### Demo credentials

| Field | Value |
|-------|-------|
| Email | `demo@invoiceiq.example` |
| Password | `Demo1234!Secure` |

