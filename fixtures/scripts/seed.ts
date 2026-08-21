/**
 * seed.ts
 *
 * Provisions the demo Cognito user and loads the entire synthetic invoice corpus
 * into the deployed environment (S3 + DynamoDB).
 *
 * Prerequisites:
 *   - AWS credentials configured (via env vars or profile)
 *   - Stack deployed (reads resource names from env vars or CDK outputs)
 *
 * Environment variables:
 *   COGNITO_USER_POOL_ID  - Cognito User Pool ID
 *   S3_BUCKET_NAME        - Invoice storage bucket name
 *   DYNAMODB_TABLE_NAME   - Single-table DynamoDB name
 *   AWS_REGION            - AWS region (default: eu-west-2)
 *
 * Usage: npx tsx seed.ts
 *
 * Attribution:
 *   @aws-sdk/client-cognito-identity-provider (Apache-2.0)
 *   @aws-sdk/client-s3 (Apache-2.0)
 *   @aws-sdk/client-dynamodb (Apache-2.0)
 *   @aws-sdk/lib-dynamodb (Apache-2.0)
 */

import { readdir, readFile } from "node:fs/promises";
import { join, extname } from "node:path";
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminGetUserCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  BatchWriteCommand,
} from "@aws-sdk/lib-dynamodb";

// ---------- Configuration ----------

const REGION = process.env.AWS_REGION ?? "eu-west-2";
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID ?? "";
const BUCKET_NAME = process.env.S3_BUCKET_NAME ?? "";
const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME ?? "";

const DEMO_EMAIL = "demo@invoiceiq.example";
const DEMO_PASSWORD = "Demo1234!Secure";
const DEMO_USER_ID = "demo-user-001";

const FIXTURES_DIR = join(import.meta.dirname ?? ".", "..");
const INVOICES_DIR = join(FIXTURES_DIR, "invoices");
const PDFS_DIR = join(FIXTURES_DIR, "pdfs");
const SCANS_DIR = join(FIXTURES_DIR, "scans");
const VENDORS_FILE = join(FIXTURES_DIR, "vendors.json");

// ---------- AWS Clients ----------

const cognitoClient = new CognitoIdentityProviderClient({ region: REGION });
const s3Client = new S3Client({ region: REGION });
const ddbClient = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: REGION }),
  {
    marshallOptions: { removeUndefinedValues: true },
  }
);

// ---------- Batch Write Helper ----------

/**
 * Writes items to DynamoDB in batches of up to 25 (the BatchWriteItem limit).
 * Handles unprocessed items by retrying with exponential backoff.
 */
async function batchWriteItems(
  items: Array<Record<string, unknown>>
): Promise<number> {
  const BATCH_SIZE = 25;
  let totalWritten = 0;

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    const requestItems = batch.map((item) => ({
      PutRequest: { Item: item },
    }));

    let unprocessed: typeof requestItems | undefined = requestItems;
    let retries = 0;

    while (unprocessed && unprocessed.length > 0) {
      const response = await ddbClient.send(
        new BatchWriteCommand({
          RequestItems: {
            [TABLE_NAME]: unprocessed,
          },
        })
      );

      const remaining = response.UnprocessedItems?.[TABLE_NAME];
      if (remaining && remaining.length > 0) {
        unprocessed = remaining as typeof requestItems;
        retries++;
        // Exponential backoff for unprocessed items
        await new Promise((resolve) =>
          setTimeout(resolve, Math.min(1000 * 2 ** retries, 10000))
        );
      } else {
        unprocessed = undefined;
      }
    }

    totalWritten += batch.length;
  }

  return totalWritten;
}

// ---------- Cognito ----------

async function ensureDemoUser(): Promise<string> {
  console.log("Ensuring demo Cognito user exists...");

  try {
    await cognitoClient.send(
      new AdminGetUserCommand({
        UserPoolId: USER_POOL_ID,
        Username: DEMO_EMAIL,
      })
    );
    console.log("  Demo user already exists");
  } catch (err: unknown) {
    if ((err as { name?: string }).name === "UserNotFoundException") {
      console.log("  Creating demo user...");
      await cognitoClient.send(
        new AdminCreateUserCommand({
          UserPoolId: USER_POOL_ID,
          Username: DEMO_EMAIL,
          UserAttributes: [
            { Name: "email", Value: DEMO_EMAIL },
            { Name: "email_verified", Value: "true" },
            { Name: "custom:userId", Value: DEMO_USER_ID },
          ],
          MessageAction: "SUPPRESS", // Don't send welcome email
        })
      );

      // Set permanent password
      await cognitoClient.send(
        new AdminSetUserPasswordCommand({
          UserPoolId: USER_POOL_ID,
          Username: DEMO_EMAIL,
          Password: DEMO_PASSWORD,
          Permanent: true,
        })
      );
      console.log("  Demo user created with permanent password");
    } else {
      throw err;
    }
  }

  return DEMO_USER_ID;
}

// ---------- S3 Upload ----------

async function uploadInvoiceFiles(userId: string): Promise<void> {
  console.log("Uploading invoice files to S3...");

  // Upload PDFs
  const pdfFiles = await readdir(PDFS_DIR).catch(() => [] as string[]);
  for (const file of pdfFiles) {
    if (extname(file) !== ".pdf") continue;

    const invoiceId = file.replace(".pdf", "");
    const s3Key = `users/${userId}/invoices/${invoiceId}/original.pdf`;
    const body = await readFile(join(PDFS_DIR, file));

    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key,
        Body: body,
        ContentType: "application/pdf",
      })
    );
  }
  console.log(`  Uploaded ${pdfFiles.length} PDFs`);

  // Upload scans
  const scanFiles = await readdir(SCANS_DIR).catch(() => [] as string[]);
  for (const file of scanFiles) {
    if (extname(file) !== ".png") continue;

    const invoiceId = file.replace(".png", "");
    const s3Key = `users/${userId}/invoices/${invoiceId}/original.png`;
    const body = await readFile(join(SCANS_DIR, file));

    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key,
        Body: body,
        ContentType: "image/png",
      })
    );
  }
  console.log(`  Uploaded ${scanFiles.length} scans`);
}

// ---------- DynamoDB ----------

interface VendorRecord {
  id: string;
  name: string;
  address: {
    line1: string;
    line2: string;
    city: string;
    postcode: string;
    country: string;
  };
  phone: string;
  email: string;
  taxId: string;
  accountNumber: string;
  type: string;
  description: string;
}

interface InvoiceRecord {
  invoiceId: string;
  vendorId: string;
  vendorName: string;
  issueDate: string;
  dueDate: string;
  referenceNumber: string;
  lineItems: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    amount: number;
    vatRate: number;
  }>;
  subtotal: number;
  vatAmount: number;
  total: number;
  currency: string;
  status: string;
  category: string;
  metadata?: Record<string, unknown>;
}

async function writeVendorRecords(): Promise<void> {
  console.log("Writing vendor records to DynamoDB...");

  const raw = await readFile(VENDORS_FILE, "utf-8");
  const vendors: VendorRecord[] = JSON.parse(raw);

  const items = vendors.map((vendor) => ({
    PK: `VENDOR#${vendor.id}`,
    SK: "PROFILE",
    vendorId: vendor.id,
    name: vendor.name,
    address: vendor.address,
    phone: vendor.phone,
    email: vendor.email,
    taxId: vendor.taxId,
    accountNumber: vendor.accountNumber,
    type: vendor.type,
    description: vendor.description,
    entityType: "VENDOR",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));

  const count = await batchWriteItems(items);
  console.log(`  Wrote ${count} vendor records`);
}

async function writeInvoiceRecords(userId: string): Promise<void> {
  console.log("Writing invoice records to DynamoDB...");

  const files = await readdir(INVOICES_DIR);
  const jsonFiles = files.filter((f) => f.endsWith(".json")).sort();

  const items = await Promise.all(
    jsonFiles.map(async (file) => {
      const raw = await readFile(join(INVOICES_DIR, file), "utf-8");
      const invoice: InvoiceRecord = JSON.parse(raw);

      return {
        PK: `USER#${userId}`,
        SK: `INV#${invoice.invoiceId}`,
        GSI1PK: `USER#${userId}`,
        GSI1SK: `DATE#${invoice.issueDate}`,
        GSI2PK: `USER#${userId}#VENDOR#${invoice.vendorId}`,
        GSI2SK: `DATE#${invoice.issueDate}`,
        invoiceId: invoice.invoiceId,
        vendorId: invoice.vendorId,
        vendorName: invoice.vendorName,
        issueDate: invoice.issueDate,
        dueDate: invoice.dueDate,
        referenceNumber: invoice.referenceNumber,
        lineItems: invoice.lineItems,
        subtotal: invoice.subtotal,
        vatAmount: invoice.vatAmount,
        total: invoice.total,
        currency: invoice.currency,
        status: invoice.status,
        category: invoice.category,
        metadata: invoice.metadata ?? {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        entityType: "INVOICE",
      };
    })
  );

  const count = await batchWriteItems(items);
  console.log(`  Wrote ${count} invoice records`);
}

// ---------- Main ----------

async function main(): Promise<void> {
  console.log("=== InvoiceIQ Seed Script ===\n");

  // Validate required environment
  const missing: string[] = [];
  if (!USER_POOL_ID) missing.push("COGNITO_USER_POOL_ID");
  if (!BUCKET_NAME) missing.push("S3_BUCKET_NAME");
  if (!TABLE_NAME) missing.push("DYNAMODB_TABLE_NAME");

  if (missing.length > 0) {
    console.error(
      `ERROR: Missing required environment variables: ${missing.join(", ")}`
    );
    console.error("\nSet these from your CDK stack outputs:");
    console.error("  export COGNITO_USER_POOL_ID=<user-pool-id>");
    console.error("  export S3_BUCKET_NAME=<bucket-name>");
    console.error("  export DYNAMODB_TABLE_NAME=<table-name>");
    process.exit(1);
  }

  const userId = await ensureDemoUser();
  await uploadInvoiceFiles(userId);
  await writeVendorRecords();
  await writeInvoiceRecords(userId);

  console.log("\n=== Seed complete ===");
  console.log(`Demo credentials: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
