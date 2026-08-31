import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { randomUUID } from 'crypto';
import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';
import { authenticateRequest } from '../../lib/auth-middleware.js';
import { success, error, corsPreflightResponse } from '../../lib/response.js';
import { createLogger } from '../../lib/logger.js';
import { generatePresignedUploadUrl, DOCUMENTS_BUCKET } from '../../lib/s3.js';
import { analyzeExpense } from '../../lib/textract.js';
import { invokeModel } from '../../lib/bedrock.js';
import { NORMALISATION_PROMPT } from '../../lib/prompts.js';
import {
  putItem,
  getItem,
  deleteItem,
  buildPK,
  buildSK,
  buildGSI1PK,
  buildGSI1SK,
  buildGSI2PK,
  buildGSI2SK,
} from '../../lib/dynamodb.js';
import {
  SAMPLE_INVOICES,
  isoDateMonthsAgo,
  addDays,
} from '../../lib/sample-invoices.js';

const s3Client = new S3Client({});

// ─── Status Tracking ────────────────────────────────────────────────────────

type ProcessingStatus = 'queued' | 'extracting' | 'normalising' | 'analysing' | 'ready' | 'failed';

function buildStatusSK(invoiceId: string): string {
  return `STATUS#${invoiceId}`;
}

async function updateStatus(
  userId: string,
  invoiceId: string,
  status: ProcessingStatus,
  reason?: string,
): Promise<void> {
  await putItem({
    item: {
      PK: buildPK(userId),
      SK: buildStatusSK(invoiceId),
      status,
      updatedAt: new Date().toISOString(),
      ...(reason ? { reason } : {}),
    },
  });
}

// ─── Vendor Identity Resolution ─────────────────────────────────────────────

/**
 * Normalise vendor name to a lowercase kebab-case slug.
 * Removes common business suffixes (Ltd, Inc, LLC, PLC, Corp, etc.),
 * strips punctuation, and converts to kebab-case.
 *
 * Examples:
 *   "Nexwave Fibre Ltd" -> "nexwave-fibre"
 *   "ACME Corp."       -> "acme"
 *   "O'Brien & Sons"   -> "obrien-sons"
 */
export function normaliseVendorName(name: string): string {
  let slug = name.toLowerCase();

  // Remove common business suffixes
  const suffixes = [
    '\\s+limited$',
    '\\s+ltd\\.?$',
    '\\s+inc\\.?$',
    '\\s+llc\\.?$',
    '\\s+plc\\.?$',
    '\\s+corp\\.?$',
    '\\s+corporation$',
    '\\s+co\\.?$',
    '\\s+company$',
    '\\s+group$',
    '\\s+holdings?$',
    '\\s+services?$',
    '\\s+solutions?$',
    '\\s+pty\\.?$',
    '\\s+gmbh$',
    '\\s+ag$',
  ];

  for (const suffix of suffixes) {
    slug = slug.replace(new RegExp(suffix, 'i'), '');
  }

  // Remove punctuation (keep alphanumeric and spaces)
  slug = slug.replace(/[^a-z0-9\s]/g, '');

  // Replace whitespace sequences with a single hyphen
  slug = slug.replace(/\s+/g, '-');

  // Remove leading/trailing hyphens
  slug = slug.replace(/^-+|-+$/g, '');

  return slug;
}

// ─── Low-Confidence Flagging ────────────────────────────────────────────────

const CONFIDENCE_THRESHOLD = 0.8;

/**
 * Identify fields below the confidence threshold.
 * Returns a map of field -> confidence for flagged fields.
 */
function flagLowConfidenceFields(
  confidenceMap: Record<string, number>,
): Record<string, number> {
  const flagged: Record<string, number> = {};
  for (const [field, confidence] of Object.entries(confidenceMap)) {
    if (confidence < CONFIDENCE_THRESHOLD) {
      flagged[field] = confidence;
    }
  }
  return flagged;
}

// ─── Route Helpers ──────────────────────────────────────────────────────────

function extractPathParam(path: string, prefix: string): string | null {
  // Matches patterns like /invoices/{id}/process or /invoices/{id}
  const regex = new RegExp(`${prefix}/([^/]+)(?:/.*)?$`);
  const match = path.match(regex);
  return match ? match[1] : null;
}

function getFileExtension(filename: string | undefined): string {
  if (!filename) return 'pdf';
  const parts = filename.split('.');
  if (parts.length > 1) {
    const ext = parts[parts.length - 1].toLowerCase();
    // Only allow safe extensions
    if (['pdf', 'png', 'jpg', 'jpeg', 'tiff', 'tif'].includes(ext)) {
      return ext;
    }
  }
  return 'pdf';
}

// Maximum upload size: 5MB (Textract synchronous API limit)
const MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024;

// ─── Handler ────────────────────────────────────────────────────────────────

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const logger = createLogger({
    requestId: event.requestContext?.requestId ?? randomUUID(),
  });

  const method = event.httpMethod ?? (event as any).requestContext?.http?.method ?? '';
  const path = event.path ?? (event as any).rawPath ?? '';

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    return corsPreflightResponse() as APIGatewayProxyResult;
  }

  // Authenticate
  // KNOWN LIMITATION (demo): JWT is decoded but not cryptographically verified.
  // In production, use aws-jwt-verify to validate against Cognito JWKS.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const claims = authenticateRequest(event as any);
  if (!claims) {
    // Allow demo user in local dev
    if (process.env.STAGE !== 'local') {
      return error('Unauthorized', 401) as APIGatewayProxyResult;
    }
  }

  const userId = claims?.userId ?? 'demo-user-001';
  logger.info('Ingestion request', { method, path, userId });

  try {
    // Route: POST /invoices/upload
    if (method === 'POST' && path.endsWith('/upload')) {
      return await handleUpload(event, userId, logger);
    }

    // Route: POST /invoices/sample-data
    if (method === 'POST' && path.endsWith('/invoices/sample-data')) {
      return await handleSeedSampleData(userId, logger);
    }

    // Route: POST /invoices/{id}/process (anchored regex to avoid false matches)
    const processMatch = path.match(/\/invoices\/([^/]+)\/process$/);
    if (method === 'POST' && processMatch) {
      const invoiceId = processMatch[1];
      if (!invoiceId) {
        return error('Missing invoice ID', 400) as APIGatewayProxyResult;
      }
      return await handleProcess(invoiceId, userId, logger);
    }

    // Route: GET /invoices/{id}/status (anchored regex to avoid false matches)
    const statusMatch = path.match(/\/invoices\/([^/]+)\/status$/);
    if (method === 'GET' && statusMatch) {
      const invoiceId = statusMatch[1];
      if (!invoiceId) {
        return error('Missing invoice ID', 400) as APIGatewayProxyResult;
      }
      return await handleGetStatus(invoiceId, userId);
    }

    // Route: POST /invoices/{id}/status (update invoice status)
    const statusUpdateMatch = path.match(/\/invoices\/([^/]+)\/status$/);
    if (method === 'POST' && statusUpdateMatch) {
      const invoiceId = statusUpdateMatch[1];
      if (!invoiceId) {
        return error('Missing invoice ID', 400) as APIGatewayProxyResult;
      }
      return await handleUpdateStatus(invoiceId, userId, event, logger);
    }

    // Route: DELETE /invoices/{id}
    if (method === 'DELETE') {
      const invoiceId = extractPathParam(path, '/invoices');
      if (!invoiceId) {
        return error('Missing invoice ID', 400) as APIGatewayProxyResult;
      }
      return await handleDelete(invoiceId, userId, logger);
    }

    return error('Not found', 404) as APIGatewayProxyResult;
  } catch (err) {
    logger.error('Unhandled error in ingestion handler', err);
    return error('Internal server error', 500) as APIGatewayProxyResult;
  }
};

// ─── Sample Data Endpoint ───────────────────────────────────────────────────

/**
 * Seed the calling user's account with the curated sample invoice corpus.
 *
 * Invoice IDs are deterministic (`sample-<slug>`), so calling this repeatedly
 * overwrites the same records rather than accumulating duplicates. Every record
 * is tagged `metadata.isSampleData = true` so demo data stays distinguishable
 * from anything the user uploaded themselves.
 */
async function handleSeedSampleData(
  userId: string,
  logger: ReturnType<typeof createLogger>,
): Promise<APIGatewayProxyResult> {
  logger.info('Seeding sample data', { userId, count: SAMPLE_INVOICES.length });

  const now = new Date().toISOString();

  const records = SAMPLE_INVOICES.map((template) => {
    const issueDate = isoDateMonthsAgo(template.monthsAgo, template.day);
    const dueDate = addDays(issueDate, template.dueInDays);
    const invoiceId = `sample-${template.id}`;

    return {
      // Keys built with the shared helpers so sample data is indexed exactly
      // the same way as invoices created through the upload pipeline.
      PK: buildPK(userId),
      SK: buildSK(invoiceId),
      GSI1PK: buildGSI1PK(userId, template.vendorId),
      GSI1SK: buildGSI1SK(issueDate),
      GSI2PK: buildGSI2PK(userId),
      GSI2SK: buildGSI2SK(issueDate, invoiceId),

      invoiceId,
      userId,
      vendorId: template.vendorId,
      vendorName: template.vendorName,
      issueDate,
      dueDate,
      referenceNumber: template.referenceNumber,
      lineItems: template.lineItems,
      subtotal: template.subtotal,
      vatAmount: template.vatAmount,
      total: template.total,
      currency: template.currency,
      status: template.status,
      category: template.category,
      metadata: { ...template.metadata, isSampleData: true },
      entityType: 'INVOICE',
      createdAt: now,
      updatedAt: now,
    };
  });

  // Written in small parallel batches rather than via BatchWriteItem, so this
  // needs no additional IAM permissions beyond the existing PutItem grant.
  const CHUNK_SIZE = 5;
  for (let i = 0; i < records.length; i += CHUNK_SIZE) {
    await Promise.all(
      records.slice(i, i + CHUNK_SIZE).map((item) => putItem({ item })),
    );
  }

  logger.info('Sample data seeded', { userId, count: records.length });

  return success(
    {
      message: `Loaded ${records.length} sample invoices`,
      count: records.length,
    },
    201,
  ) as APIGatewayProxyResult;
}

// ─── Upload Endpoint ────────────────────────────────────────────────────────

async function handleUpload(
  event: APIGatewayProxyEvent,
  userId: string,
  logger: ReturnType<typeof createLogger>,
): Promise<APIGatewayProxyResult> {
  const body = event.body ? JSON.parse(event.body) : {};
  const filename = body.fileName as string | undefined;
  const contentType = body.contentType as string | undefined;
  const fileSize = body.size as number | undefined;
  const ext = getFileExtension(filename);

  // Validate file size does not exceed Textract sync limit (5MB)
  if (fileSize !== undefined && fileSize > MAX_UPLOAD_SIZE_BYTES) {
    return error(
      `File size (${Math.round(fileSize / 1024 / 1024 * 100) / 100} MB) exceeds the maximum allowed size of 5 MB.`,
      400,
    ) as APIGatewayProxyResult;
  }

  // Generate unique invoice ID
  const invoiceId = randomUUID();

  // S3 key following project convention
  const s3Key = `users/${userId}/invoices/${invoiceId}/original.${ext}`;

  logger.info('Generating presigned upload URL', { invoiceId, s3Key });

  // Generate presigned PUT URL with Content-Length condition to enforce 5MB limit
  const uploadUrl = await generatePresignedUploadUrl({
    key: s3Key,
    contentType: contentType ?? `application/${ext === 'pdf' ? 'pdf' : ext}`,
    expiresIn: 600, // 10 minutes
    maxContentLength: MAX_UPLOAD_SIZE_BYTES,
  });

  // Store initial status record
  await updateStatus(userId, invoiceId, 'queued');

  // Store a minimal invoice placeholder so we can track it
  await putItem({
    item: {
      PK: buildPK(userId),
      SK: buildSK(invoiceId),
      invoiceId,
      userId,
      status: 'queued',
      sourceDocument: {
        s3Key,
        mimeType: contentType ?? 'application/pdf',
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  });

  return success({ uploadUrl, invoiceId }, 201) as APIGatewayProxyResult;
}

// ─── Process Endpoint ───────────────────────────────────────────────────────

// KNOWN LIMITATION (demo): The pipeline runs synchronously (Textract -> Bedrock -> DynamoDB)
// within a single Lambda invocation. API Gateway has a 29s integration timeout, and Textract
// can take 15-40s for multi-page PDFs. In production, use Step Functions or S3-event-triggered
// async processing so the client only polls for status rather than holding a connection open.

async function handleProcess(
  invoiceId: string,
  userId: string,
  logger: ReturnType<typeof createLogger>,
): Promise<APIGatewayProxyResult> {
  logger.info('Starting invoice processing pipeline', { invoiceId, userId });

  try {
    // Retrieve the placeholder record to get S3 key
    const existing = await getItem({
      pk: buildPK(userId),
      sk: buildSK(invoiceId),
    });

    if (!existing) {
      return error('Invoice not found', 404) as APIGatewayProxyResult;
    }

    // Verify ownership
    if (existing.userId && existing.userId !== userId) {
      return error('Forbidden', 403) as APIGatewayProxyResult;
    }

    const sourceDoc = existing.sourceDocument as { s3Key: string; mimeType: string } | undefined;
    if (!sourceDoc?.s3Key) {
      return error('No source document found for this invoice', 400) as APIGatewayProxyResult;
    }

    // ── Step 1: Extracting (via Bedrock Vision - Textract alternative) ────
    await updateStatus(userId, invoiceId, 'extracting');
    logger.info('Fetching document from S3 for Bedrock vision extraction', { invoiceId });

    // Fetch the document from S3 to send as base64 to Bedrock
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    const s3GetResponse = await s3Client.send(new GetObjectCommand({
      Bucket: DOCUMENTS_BUCKET,
      Key: sourceDoc.s3Key,
    }));

    const docBytes = await s3GetResponse.Body?.transformToByteArray();
    if (!docBytes || docBytes.length === 0) {
      await updateStatus(userId, invoiceId, 'failed', 'Failed to fetch document from S3');
      return error('Failed to fetch document from S3', 422) as APIGatewayProxyResult;
    }

    const docBase64 = Buffer.from(docBytes).toString('base64');
    const mediaType = sourceDoc.mimeType || 'application/pdf';

    // ── Step 2: Normalising (Bedrock extracts + normalises in one step) ─────
    await updateStatus(userId, invoiceId, 'normalising');
    logger.info('Sending document to Bedrock for extraction and normalisation', { invoiceId });

    // Use Bedrock with document as multimodal input
    const { BedrockRuntimeClient, InvokeModelCommand } = await import('@aws-sdk/client-bedrock-runtime');
    const bedrockDirectClient = new BedrockRuntimeClient({});
    const modelId = process.env.BEDROCK_MODEL_ID || 'eu.anthropic.claude-haiku-4-5-20251001-v1:0';

    const bedrockBody = JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 4096,
      temperature: 0.1,
      system: NORMALISATION_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: mediaType === 'application/pdf' ? 'document' : 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: docBase64,
              },
            },
            {
              type: 'text',
              text: `Extract all data from this invoice document and normalise it into the canonical Invoice JSON format. The invoice ID is "${invoiceId}". Return ONLY valid JSON with no markdown formatting.`,
            },
          ],
        },
      ],
    });

    const bedrockCommand = new InvokeModelCommand({
      modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: new TextEncoder().encode(bedrockBody),
    });

    const bedrockResponse = await bedrockDirectClient.send(bedrockCommand);
    const responseBody = JSON.parse(new TextDecoder().decode(bedrockResponse.body));
    const normalisationContent = responseBody.content?.[0]?.text ?? '';

    if (!normalisationContent) {
      await updateStatus(userId, invoiceId, 'failed', 'Bedrock returned empty response');
      return error('Extraction failed - empty response from AI', 422) as APIGatewayProxyResult;
    }

    const normalisationResponse = { content: normalisationContent };

    // Parse the normalised invoice from Bedrock response
    let parsedResponse: { invoice: Record<string, unknown>; confidence: Record<string, number> };
    try {
      // Strip markdown code fences if present
      let normContent = normalisationResponse.content.trim();
      if (normContent.startsWith('```')) {
        normContent = normContent.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
      }
      parsedResponse = JSON.parse(normContent);
    } catch {
      // Try to extract JSON from the response if it has extra text
      const jsonMatch = normalisationResponse.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedResponse = JSON.parse(jsonMatch[0]);
      } else {
        await updateStatus(userId, invoiceId, 'failed', 'Failed to parse Bedrock normalisation response');
        return error('Normalisation failed - invalid response format', 422) as APIGatewayProxyResult;
      }
    }

    const normalisedInvoice = parsedResponse.invoice ?? parsedResponse;
    const confidenceMap = parsedResponse.confidence ?? {};

    // ── Step 3: Analysing ───────────────────────────────────────────────────
    await updateStatus(userId, invoiceId, 'analysing');
    logger.info('Performing vendor resolution and confidence analysis', { invoiceId });

    // Vendor identity resolution
    const vendorName = (normalisedInvoice.vendorName as string) ?? '';
    const vendorId = normaliseVendorName(vendorName);

    // Low-confidence flagging
    const lowConfidenceFields = flagLowConfidenceFields(confidenceMap);

    // Build the canonical invoice record
    const issueDate = (normalisedInvoice.issueDate as string) ?? new Date().toISOString().split('T')[0];
    const now = new Date().toISOString();

    const canonicalRecord = {
      // DynamoDB keys
      PK: buildPK(userId),
      SK: buildSK(invoiceId),
      GSI1PK: buildGSI1PK(userId, vendorId),
      GSI1SK: buildGSI1SK(issueDate),
      GSI2PK: buildGSI2PK(userId),
      GSI2SK: buildGSI2SK(issueDate, invoiceId),

      // Invoice data
      invoiceId,
      userId,
      vendorId,
      vendorName: normalisedInvoice.vendorName ?? vendorName,
      issueDate,
      dueDate: normalisedInvoice.dueDate ?? '',
      referenceNumber: normalisedInvoice.referenceNumber ?? '',
      lineItems: normalisedInvoice.lineItems ?? [],
      subtotal: normalisedInvoice.subtotal ?? 0,
      vatAmount: normalisedInvoice.vatAmount ?? 0,
      total: normalisedInvoice.total ?? 0,
      currency: normalisedInvoice.currency ?? 'GBP',
      status: normalisedInvoice.status ?? 'unpaid',
      category: normalisedInvoice.category ?? 'uncategorised',
      metadata: normalisedInvoice.metadata ?? {},

      // Vendor details (optional)
      vendor: normalisedInvoice.vendor ?? { name: vendorName, normalisedName: vendorId },

      // Source document info
      sourceDocument: sourceDoc,

      // Extraction metadata
      extraction: {
        confidence: confidenceMap,
        lowConfidenceFields,
        model: 'anthropic.claude-3-haiku-20240307-v1:0',
        version: '1.0',
        extractedAt: now,
      },

      // Timestamps
      createdAt: existing.createdAt ?? now,
      updatedAt: now,
      processedAt: now,
    };

    // ── Step 4: Store in DynamoDB ────────────────────────────────────────────
    await putItem({ item: canonicalRecord });

    // ── Step 5: Mark as ready ───────────────────────────────────────────────
    await updateStatus(userId, invoiceId, 'ready');
    logger.info('Invoice processing complete', {
      invoiceId,
      vendorId,
      total: canonicalRecord.total as number,
      lowConfidenceCount: Object.keys(lowConfidenceFields).length,
    });

    return success({
      invoiceId,
      status: 'ready',
      vendorId,
      vendorName: canonicalRecord.vendorName,
      total: canonicalRecord.total,
      currency: canonicalRecord.currency,
      lowConfidenceFields: Object.keys(lowConfidenceFields),
    }) as APIGatewayProxyResult;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error during processing';
    logger.error('Invoice processing failed', err, { invoiceId });
    await updateStatus(userId, invoiceId, 'failed', errorMessage);
    return error(`Processing failed: ${errorMessage}`, 500) as APIGatewayProxyResult;
  }
}

// ─── Get Status Endpoint ────────────────────────────────────────────────────

async function handleGetStatus(
  invoiceId: string,
  userId: string,
): Promise<APIGatewayProxyResult> {
  const statusRecord = await getItem({
    pk: buildPK(userId),
    sk: buildStatusSK(invoiceId),
  });

  if (!statusRecord) {
    return error('Status not found', 404) as APIGatewayProxyResult;
  }

  return success({
    invoiceId,
    status: statusRecord.status,
    updatedAt: statusRecord.updatedAt,
    ...(statusRecord.reason ? { reason: statusRecord.reason } : {}),
  }) as APIGatewayProxyResult;
}

// ─── Update Status Endpoint ─────────────────────────────────────────────────

async function handleUpdateStatus(
  invoiceId: string,
  userId: string,
  event: any,
  logger: ReturnType<typeof createLogger>,
): Promise<APIGatewayProxyResult> {
  const body = event.body ? JSON.parse(event.body) : {};
  const newStatus = body.status;

  const validStatuses = ['unpaid', 'paid', 'disputed', 'cancelled'];
  if (!newStatus || !validStatuses.includes(newStatus)) {
    return error(`Invalid status. Must be one of: ${validStatuses.join(', ')}`, 400) as APIGatewayProxyResult;
  }

  logger.info('Updating invoice status', { invoiceId, userId, newStatus });

  const existing = await getItem({
    pk: buildPK(userId),
    sk: buildSK(invoiceId),
  });

  if (!existing) {
    return error('Invoice not found', 404) as APIGatewayProxyResult;
  }

  if (existing.userId && existing.userId !== userId) {
    return error('Forbidden', 403) as APIGatewayProxyResult;
  }

  await putItem({
    item: {
      ...existing,
      status: newStatus,
      updatedAt: new Date().toISOString(),
    },
  });

  return success({ message: `Invoice status updated to ${newStatus}` }) as APIGatewayProxyResult;
}

// ─── Delete Endpoint ────────────────────────────────────────────────────────

async function handleDelete(
  invoiceId: string,
  userId: string,
  logger: ReturnType<typeof createLogger>,
): Promise<APIGatewayProxyResult> {
  logger.info('Deleting invoice', { invoiceId, userId });

  // Verify the invoice exists and belongs to the user
  const existing = await getItem({
    pk: buildPK(userId),
    sk: buildSK(invoiceId),
  });

  if (!existing) {
    return error('Invoice not found', 404) as APIGatewayProxyResult;
  }

  if (existing.userId && existing.userId !== userId) {
    return error('Forbidden', 403) as APIGatewayProxyResult;
  }

  // Delete S3 objects under the invoice prefix
  const s3Prefix = `users/${userId}/invoices/${invoiceId}/`;
  try {
    const listCommand = new ListObjectsV2Command({
      Bucket: DOCUMENTS_BUCKET,
      Prefix: s3Prefix,
    });
    const listResponse = await s3Client.send(listCommand);

    if (listResponse.Contents && listResponse.Contents.length > 0) {
      const deleteCommand = new DeleteObjectsCommand({
        Bucket: DOCUMENTS_BUCKET,
        Delete: {
          Objects: listResponse.Contents.map((obj) => ({ Key: obj.Key })),
          Quiet: true,
        },
      });
      await s3Client.send(deleteCommand);
    }
  } catch (s3Err) {
    logger.warn('Failed to delete S3 objects', {
      invoiceId,
      error: s3Err instanceof Error ? s3Err.message : 'unknown',
    });
    // Continue with DynamoDB deletion even if S3 cleanup fails
  }

  // Delete the invoice record from DynamoDB
  await deleteItem(buildPK(userId), buildSK(invoiceId));

  // Delete the status record
  await deleteItem(buildPK(userId), buildStatusSK(invoiceId));

  logger.info('Invoice deleted successfully', { invoiceId });

  return success({ message: 'Invoice deleted', invoiceId }) as APIGatewayProxyResult;
}
