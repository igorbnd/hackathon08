import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  buildPK,
  buildSK,
  buildGSI1PK,
  buildGSI2PK,
  getItem,
  queryItems,
  queryByGSI,
  updateItem,
} from '../../lib/dynamodb.js';
import { invokeModel } from '../../lib/bedrock.js';
import { getUserIdFromRequest } from '../../lib/auth-middleware.js';
import { success, error, corsPreflightResponse } from '../../lib/response.js';
import { createLogger } from '../../lib/logger.js';
import { RECOMMENDATION_PROMPT, SEARCH_PROMPT } from '../../lib/prompts.js';
import type { Invoice } from '@invoiceiq/schema';

// ─── Handler Entry Point ────────────────────────────────────────────────────

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  const logger = createLogger({
    requestId: event.requestContext?.requestId ?? crypto.randomUUID(),
  });

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return corsPreflightResponse() as APIGatewayProxyResult;
  }

  try {
    const path = event.path ?? event.resource ?? '';
    const method = event.httpMethod ?? 'GET';

    // Route dispatch
    if (method === 'GET' && path.match(/\/invoices\/[^/]+$/)) {
      return await handleGetInvoice(event, logger);
    }

    if (method === 'GET' && path.match(/\/invoices\/?$/)) {
      return await handleListInvoices(event, logger);
    }

    if (method === 'POST' && path.match(/\/query\/?$/)) {
      return await handleQuery(event, logger);
    }

    return error('Not found', 404) as APIGatewayProxyResult;
  } catch (err) {
    logger.error('Unhandled error in query handler', err);
    return error('Internal server error', 500) as APIGatewayProxyResult;
  }
};

// ─── List Invoices (GET /invoices) ──────────────────────────────────────────

async function handleListInvoices(
  event: APIGatewayProxyEvent,
  logger: ReturnType<typeof createLogger>,
): Promise<APIGatewayProxyResult> {
  const userId = getUserIdFromRequest(event as any);
  if (!userId) {
    return error('Unauthorized', 401) as APIGatewayProxyResult;
  }

  logger.info('Listing invoices', { userId });

  const params = event.queryStringParameters ?? {};
  const vendor = params.vendor;
  const dateFrom = params.dateFrom;
  const dateTo = params.dateTo;
  const status = params.status;
  const limit = params.limit ? parseInt(params.limit, 10) : 25;
  const cursor = params.cursor;

  // Decode cursor (lastEvaluatedKey) from base64
  const startKey = cursor
    ? JSON.parse(Buffer.from(cursor, 'base64').toString('utf-8'))
    : undefined;

  let items: Record<string, any>[] = [];
  let lastKey: Record<string, any> | undefined;

  if (vendor) {
    // Use GSI1 for vendor-specific queries
    const gsi1pk = buildGSI1PK(userId, vendor);
    const result = await queryByGSI({
      indexName: 'GSI1',
      pkName: 'GSI1PK',
      pkValue: gsi1pk,
      skName: 'GSI1SK',
      skBetween: dateFrom && dateTo ? { start: dateFrom, end: dateTo } : undefined,
      limit,
      startKey,
      scanForward: false,
    });
    items = result.items;
    lastKey = result.lastKey;
  } else if (dateFrom || dateTo) {
    // Use GSI2 for date range queries
    const gsi2pk = buildGSI2PK(userId);
    const start = dateFrom ?? '1970-01-01';
    const end = dateTo ? `${dateTo}~` : '9999-12-31~';
    const result = await queryByGSI({
      indexName: 'GSI2',
      pkName: 'GSI2PK',
      pkValue: gsi2pk,
      skName: 'GSI2SK',
      skBetween: { start, end },
      limit,
      startKey,
      scanForward: false,
    });
    items = result.items;
    lastKey = result.lastKey;
  } else {
    // Default: query main table by PK with SK prefix
    const result = await queryItems({
      pk: buildPK(userId),
      skPrefix: 'INV#',
      limit,
      startKey,
      scanForward: false,
    });
    items = result.items;
    lastKey = result.lastKey;
  }

  // Apply post-query filters (status, recommendation)
  let filteredItems = items;
  if (status) {
    filteredItems = filteredItems.filter((item) => item.status === status);
  }

  // Encode next cursor
  const nextCursor = lastKey
    ? Buffer.from(JSON.stringify(lastKey)).toString('base64')
    : null;

  // NOTE: `count` is the number of items in this page, not a true total across all pages.
  // In production, a separate DynamoDB Select:'COUNT' query or counter item would provide the true total.
  return success({
    invoices: filteredItems,
    nextCursor,
    count: filteredItems.length,
  }) as APIGatewayProxyResult;
}

// ─── Get Single Invoice (GET /invoices/{id}) ────────────────────────────────

async function handleGetInvoice(
  event: APIGatewayProxyEvent,
  logger: ReturnType<typeof createLogger>,
): Promise<APIGatewayProxyResult> {
  const userId = getUserIdFromRequest(event as any);
  if (!userId) {
    return error('Unauthorized', 401) as APIGatewayProxyResult;
  }

  // Extract invoice ID from path
  const pathParts = (event.path ?? '').split('/');
  const invoiceId = pathParts[pathParts.length - 1];

  if (!invoiceId) {
    return error('Invoice ID is required', 400) as APIGatewayProxyResult;
  }

  logger.info('Getting invoice', { userId, invoiceId });

  // Get the invoice from DynamoDB
  const item = await getItem({
    pk: buildPK(userId),
    sk: buildSK(invoiceId),
  });

  if (!item) {
    return error('Invoice not found', 404) as APIGatewayProxyResult;
  }

  const invoice = item as unknown as Invoice;

  // Fetch historical invoices from same vendor via GSI1
  const vendorId = invoice.vendorId;
  let history: Record<string, any>[] = [];
  let deltas: InvoiceDelta[] = [];
  let recommendation: RecommendationResult | null = null;

  if (vendorId) {
    const gsi1pk = buildGSI1PK(userId, vendorId);
    const historyResult = await queryByGSI({
      indexName: 'GSI1',
      pkName: 'GSI1PK',
      pkValue: gsi1pk,
      skName: 'GSI1SK',
      limit: 12, // Up to 12 months of history
      scanForward: false,
    });

    // Exclude the current invoice from history
    history = historyResult.items.filter(
      (h) => h.invoiceId !== invoiceId,
    );

    // Compute deltas between current and previous invoices
    deltas = computeDeltas(invoice, history as unknown as Invoice[]);

    // Use cached recommendation if available and invoice hasn't been updated since
    const cachedRecommendation = item.cachedRecommendation as RecommendationResult | undefined;
    const recommendationGeneratedAt = item.recommendationGeneratedAt as string | undefined;
    const invoiceUpdatedAt = (item.updatedAt as string) ?? '';

    if (cachedRecommendation && recommendationGeneratedAt && recommendationGeneratedAt >= invoiceUpdatedAt) {
      recommendation = cachedRecommendation;
    } else {
      // Generate AI recommendation and cache it
      recommendation = await generateRecommendation(invoice, history as unknown as Invoice[], logger);

      // Persist the recommendation in DynamoDB for subsequent requests
      try {
        await updateItem(
          buildPK(userId),
          buildSK(invoiceId),
          'SET #cachedRec = :rec, #recGeneratedAt = :genAt',
          {
            ':rec': recommendation as unknown as Record<string, unknown>,
            ':genAt': new Date().toISOString(),
          },
          {
            '#cachedRec': 'cachedRecommendation',
            '#recGeneratedAt': 'recommendationGeneratedAt',
          },
        );
      } catch (cacheErr) {
        // Non-critical: log and continue even if caching fails
        logger.warn('Failed to cache recommendation', {
          invoiceId,
          error: cacheErr instanceof Error ? cacheErr.message : String(cacheErr),
        });
      }
    }
  }

  return success({
    invoice,
    recommendation,
    history,
    deltas,
  }) as APIGatewayProxyResult;
}

// ─── POST /query Handler ────────────────────────────────────────────────────

async function handleQuery(
  event: APIGatewayProxyEvent,
  logger: ReturnType<typeof createLogger>,
): Promise<APIGatewayProxyResult> {
  const userId = getUserIdFromRequest(event as any);
  if (!userId) {
    return error('Unauthorized', 401) as APIGatewayProxyResult;
  }

  let body: { type?: string; query?: string };
  try {
    body = JSON.parse(event.body ?? '{}');
  } catch {
    return error('Invalid JSON body', 400) as APIGatewayProxyResult;
  }

  const queryType = body.type;

  if (queryType === 'search') {
    return await handleNaturalLanguageSearch(userId, body.query ?? '', logger);
  }

  if (queryType === 'subscriptions') {
    return await handleSubscriptionAnalysis(userId, logger);
  }

  return error('Invalid query type. Expected "search" or "subscriptions".', 400) as APIGatewayProxyResult;
}

// ─── Natural Language Search ────────────────────────────────────────────────

async function handleNaturalLanguageSearch(
  userId: string,
  query: string,
  logger: ReturnType<typeof createLogger>,
): Promise<APIGatewayProxyResult> {
  if (!query.trim()) {
    return error('Query string is required', 400) as APIGatewayProxyResult;
  }

  logger.info('Processing natural language search', { userId, query });

  // Send query to Bedrock to translate into structured filters
  const aiResponse = await invokeModel({
    systemPrompt: SEARCH_PROMPT,
    prompt: `User query: "${query}"\n\nToday's date is ${new Date().toISOString().split('T')[0]}.`,
    maxTokens: 1024,
    temperature: 0.1,
  });

  let parsedFilters: SearchFilters;
  try {
    parsedFilters = JSON.parse(aiResponse.content);
  } catch {
    logger.warn('Failed to parse AI search response', { content: aiResponse.content });
    return error('Failed to interpret search query', 422) as APIGatewayProxyResult;
  }

  const filters = parsedFilters.filters ?? {};
  const interpretation = parsedFilters.interpretation ?? 'No interpretation available';

  // Execute the generated filters as DynamoDB queries
  let items: Record<string, any>[] = [];

  if (filters.vendor) {
    // Vendor-specific query via GSI1
    const gsi1pk = buildGSI1PK(userId, filters.vendor);
    const result = await queryByGSI({
      indexName: 'GSI1',
      pkName: 'GSI1PK',
      pkValue: gsi1pk,
      skName: 'GSI1SK',
      skBetween:
        filters.dateFrom && filters.dateTo
          ? { start: filters.dateFrom, end: filters.dateTo }
          : undefined,
      limit: 50,
      scanForward: false,
    });
    items = result.items;
  } else if (filters.dateFrom || filters.dateTo) {
    // Date range query via GSI2
    const gsi2pk = buildGSI2PK(userId);
    const start = filters.dateFrom ?? '1970-01-01';
    const end = filters.dateTo ? `${filters.dateTo}~` : '9999-12-31~';
    const result = await queryByGSI({
      indexName: 'GSI2',
      pkName: 'GSI2PK',
      pkValue: gsi2pk,
      skName: 'GSI2SK',
      skBetween: { start, end },
      limit: 50,
      scanForward: false,
    });
    items = result.items;
  } else {
    // Fallback: scan all user invoices
    const result = await queryItems({
      pk: buildPK(userId),
      skPrefix: 'INV#',
      limit: 50,
      scanForward: false,
    });
    items = result.items;
  }

  // Apply post-query filters
  let filteredItems = items;

  if (filters.status) {
    filteredItems = filteredItems.filter((item) => item.status === filters.status);
  }
  if (filters.category) {
    filteredItems = filteredItems.filter((item) => item.category === filters.category);
  }
  if (filters.amountMin !== undefined) {
    filteredItems = filteredItems.filter((item) => (item.total ?? 0) >= filters.amountMin!);
  }
  if (filters.amountMax !== undefined) {
    filteredItems = filteredItems.filter((item) => (item.total ?? 0) <= filters.amountMax!);
  }
  if (filters.currency) {
    filteredItems = filteredItems.filter((item) => item.currency === filters.currency);
  }
  if (filters.vendorName) {
    const vendorNameLower = filters.vendorName.toLowerCase();
    filteredItems = filteredItems.filter(
      (item) =>
        (item.vendorName ?? '').toLowerCase().includes(vendorNameLower),
    );
  }
  if (filters.recommendation) {
    filteredItems = filteredItems.filter(
      (item) => item.recommendation === filters.recommendation,
    );
  }

  // Sort results
  const sortBy = parsedFilters.sortBy ?? 'date';
  const sortOrder = parsedFilters.sortOrder ?? 'desc';
  filteredItems.sort((a, b) => {
    let comparison = 0;
    if (sortBy === 'amount') {
      comparison = (a.total ?? 0) - (b.total ?? 0);
    } else if (sortBy === 'vendor') {
      comparison = (a.vendorName ?? '').localeCompare(b.vendorName ?? '');
    } else {
      // date
      comparison = (a.issueDate ?? '').localeCompare(b.issueDate ?? '');
    }
    return sortOrder === 'asc' ? comparison : -comparison;
  });

  return success({
    results: filteredItems,
    interpretation,
    filters,
  }) as APIGatewayProxyResult;
}

// ─── Subscription / Waste Analysis ──────────────────────────────────────────

async function handleSubscriptionAnalysis(
  userId: string,
  logger: ReturnType<typeof createLogger>,
): Promise<APIGatewayProxyResult> {
  logger.info('Running subscription analysis', { userId });

  // KNOWN LIMITATION (demo): Loads all user invoices into memory with no upper bound.
  // In production, implement streaming aggregation or cap at a maximum (e.g., 5000 items)
  // to stay within Lambda memory limits for power users.
  const allInvoices: Record<string, any>[] = [];
  let lastKey: Record<string, any> | undefined;

  do {
    const result = await queryItems({
      pk: buildPK(userId),
      skPrefix: 'INV#',
      limit: 100,
      startKey: lastKey,
      scanForward: true,
    });
    allInvoices.push(...result.items);
    lastKey = result.lastKey;
  } while (lastKey);

  // Group by vendor
  const vendorGroups: Record<string, Record<string, any>[]> = {};
  for (const invoice of allInvoices) {
    const vendorId = invoice.vendorId ?? 'unknown';
    if (!vendorGroups[vendorId]) {
      vendorGroups[vendorId] = [];
    }
    vendorGroups[vendorId].push(invoice);
  }

  // Detect recurring patterns and build subscription list
  const subscriptions: SubscriptionInfo[] = [];
  const overlaps: OverlapInfo[] = [];
  let totalAnnualised = 0;
  let wasteEstimate = 0;

  const categoryVendors: Record<string, string[]> = {};

  for (const [vendorId, invoices] of Object.entries(vendorGroups)) {
    // Sort invoices by date
    const sorted = invoices.sort((a, b) =>
      (a.issueDate ?? '').localeCompare(b.issueDate ?? ''),
    );

    if (sorted.length < 2) continue; // Need at least 2 invoices to detect pattern

    // Detect recurrence pattern
    const intervals = computeIntervals(sorted);
    const pattern = detectRecurrencePattern(intervals);

    if (!pattern) continue; // Not recurring

    const vendorName = sorted[0].vendorName ?? vendorId;
    const category = sorted[0].category ?? 'uncategorised';
    const latestAmount = sorted[sorted.length - 1].total ?? 0;
    const previousAmount = sorted.length >= 2 ? sorted[sorted.length - 2].total ?? 0 : latestAmount;

    // Calculate annualised cost
    let annualisedCost = 0;
    if (pattern === 'monthly') {
      annualisedCost = latestAmount * 12;
    } else if (pattern === 'quarterly') {
      annualisedCost = latestAmount * 4;
    } else if (pattern === 'annually') {
      annualisedCost = latestAmount;
    }

    totalAnnualised += annualisedCost;

    // Detect price trends
    const priceTrend = computePriceTrend(sorted);

    // Calculate waste for price increases without clear justification
    if (priceTrend.direction === 'increasing' && priceTrend.percentageChange > 10) {
      const monthlyWaste = (latestAmount - previousAmount);
      const annualWaste = pattern === 'monthly' ? monthlyWaste * 12 :
        pattern === 'quarterly' ? monthlyWaste * 4 : monthlyWaste;
      wasteEstimate += Math.max(0, annualWaste);
    }

    // Track categories for overlap detection
    if (!categoryVendors[category]) {
      categoryVendors[category] = [];
    }
    categoryVendors[category].push(vendorId);

    subscriptions.push({
      vendorId,
      vendorName,
      category,
      pattern,
      latestAmount,
      annualisedCost,
      invoiceCount: sorted.length,
      firstSeen: sorted[0].issueDate ?? '',
      lastSeen: sorted[sorted.length - 1].issueDate ?? '',
      priceTrend,
      currency: sorted[0].currency ?? 'GBP',
    });
  }

  // Detect overlapping services (multiple vendors in same category)
  for (const [category, vendors] of Object.entries(categoryVendors)) {
    if (vendors.length > 1) {
      const overlappingSubscriptions = subscriptions.filter(
        (s) => vendors.includes(s.vendorId),
      );
      overlaps.push({
        category,
        vendors: overlappingSubscriptions.map((s) => ({
          vendorId: s.vendorId,
          vendorName: s.vendorName,
          annualisedCost: s.annualisedCost,
        })),
        totalCost: overlappingSubscriptions.reduce(
          (sum, s) => sum + s.annualisedCost,
          0,
        ),
        suggestion: `Multiple ${category} services detected. Consider consolidating to reduce costs.`,
      });
    }
  }

  return success({
    subscriptions,
    overlaps,
    totalAnnualised,
    wasteEstimate,
  }) as APIGatewayProxyResult;
}

// ─── AI Recommendation Engine ───────────────────────────────────────────────

async function generateRecommendation(
  invoice: Invoice,
  history: Invoice[],
  logger: ReturnType<typeof createLogger>,
): Promise<RecommendationResult> {
  const prompt = buildRecommendationPrompt(invoice, history);

  try {
    const aiResponse = await invokeModel({
      systemPrompt: RECOMMENDATION_PROMPT,
      prompt,
      maxTokens: 2048,
      temperature: 0.2,
    });

    const parsed = JSON.parse(aiResponse.content);
    return {
      recommendation: parsed.recommendation ?? 'PAY BUT VERIFY',
      confidence: parsed.confidence ?? 0.5,
      reasoning: parsed.reasoning ?? 'Unable to generate detailed reasoning.',
      evidence: parsed.evidence ?? [],
      riskFactors: parsed.riskFactors ?? [],
      suggestedActions: parsed.suggestedActions ?? [],
    };
  } catch (err) {
    logger.warn('Failed to generate AI recommendation, using fallback', {
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      recommendation: 'PAY BUT VERIFY',
      confidence: 0.3,
      reasoning: 'AI recommendation unavailable. Manual review suggested.',
      evidence: [],
      riskFactors: ['AI analysis could not be completed'],
      suggestedActions: ['Manually review invoice details before payment'],
    };
  }
}

function buildRecommendationPrompt(invoice: Invoice, history: Invoice[]): string {
  const historySection = history.length > 0
    ? `## Historical Invoices from Same Vendor (${history.length} prior invoices)\n\n${history
        .slice(0, 6) // Limit to 6 most recent for token efficiency
        .map((h, i) => `### Invoice ${i + 1}\n- Date: ${h.issueDate}\n- Total: ${h.currency} ${h.total}\n- Line items: ${h.lineItems.map((li) => `${li.description}: ${li.amount}`).join(', ')}`)
        .join('\n\n')}`
    : '## Historical Invoices\nNo prior invoices from this vendor on record.';

  return `## Current Invoice to Evaluate

- Invoice ID: ${invoice.invoiceId}
- Vendor: ${invoice.vendorName} (${invoice.vendorId})
- Issue Date: ${invoice.issueDate}
- Due Date: ${invoice.dueDate}
- Total: ${invoice.currency} ${invoice.total}
- Subtotal: ${invoice.currency} ${invoice.subtotal}
- VAT: ${invoice.currency} ${invoice.vatAmount}
- Category: ${invoice.category}
- Status: ${invoice.status}
- Line Items:
${invoice.lineItems.map((li) => `  - ${li.description}: qty ${li.quantity} x ${li.unitPrice} = ${li.amount}`).join('\n')}

${historySection}

Based on the above, provide your recommendation (PAY, PAY BUT VERIFY, HOLD, QUERY THE VENDOR, DISPUTE, LIKELY DUPLICATE, or CANCEL OR DOWNGRADE) with evidence and reasoning.`;
}

// ─── Delta Computation ──────────────────────────────────────────────────────

interface InvoiceDelta {
  field: string;
  previousValue: string | number;
  currentValue: string | number;
  changePercent?: number;
  type: 'price_change' | 'new_item' | 'removed_item' | 'quantity_change' | 'field_change';
}

function computeDeltas(current: Invoice, history: Invoice[]): InvoiceDelta[] {
  if (history.length === 0) return [];

  const deltas: InvoiceDelta[] = [];

  // Compare with the most recent previous invoice
  const previous = history[0];

  // Total amount comparison
  if (previous.total !== current.total) {
    const changePercent =
      previous.total !== 0
        ? ((current.total - previous.total) / previous.total) * 100
        : 0;
    deltas.push({
      field: 'total',
      previousValue: previous.total,
      currentValue: current.total,
      changePercent: Math.round(changePercent * 100) / 100,
      type: 'price_change',
    });
  }

  // Subtotal comparison
  if (previous.subtotal !== current.subtotal) {
    const changePercent =
      previous.subtotal !== 0
        ? ((current.subtotal - previous.subtotal) / previous.subtotal) * 100
        : 0;
    deltas.push({
      field: 'subtotal',
      previousValue: previous.subtotal,
      currentValue: current.subtotal,
      changePercent: Math.round(changePercent * 100) / 100,
      type: 'price_change',
    });
  }

  // Line item comparisons
  const prevDescriptions = new Set(previous.lineItems.map((li) => li.description));
  const currDescriptions = new Set(current.lineItems.map((li) => li.description));

  // New line items
  for (const li of current.lineItems) {
    if (!prevDescriptions.has(li.description)) {
      deltas.push({
        field: `lineItem:${li.description}`,
        previousValue: 0,
        currentValue: li.amount,
        type: 'new_item',
      });
    }
  }

  // Removed line items
  for (const li of previous.lineItems) {
    if (!currDescriptions.has(li.description)) {
      deltas.push({
        field: `lineItem:${li.description}`,
        previousValue: li.amount,
        currentValue: 0,
        type: 'removed_item',
      });
    }
  }

  // Price changes on existing line items
  for (const currLi of current.lineItems) {
    const prevLi = previous.lineItems.find((p) => p.description === currLi.description);
    if (prevLi && prevLi.amount !== currLi.amount) {
      const changePercent =
        prevLi.amount !== 0
          ? ((currLi.amount - prevLi.amount) / prevLi.amount) * 100
          : 0;
      deltas.push({
        field: `lineItem:${currLi.description}`,
        previousValue: prevLi.amount,
        currentValue: currLi.amount,
        changePercent: Math.round(changePercent * 100) / 100,
        type: 'price_change',
      });
    }
  }

  return deltas;
}

// ─── Subscription Analysis Helpers ──────────────────────────────────────────

interface SubscriptionInfo {
  vendorId: string;
  vendorName: string;
  category: string;
  pattern: 'monthly' | 'quarterly' | 'annually';
  latestAmount: number;
  annualisedCost: number;
  invoiceCount: number;
  firstSeen: string;
  lastSeen: string;
  priceTrend: PriceTrend;
  currency: string;
}

interface OverlapInfo {
  category: string;
  vendors: { vendorId: string; vendorName: string; annualisedCost: number }[];
  totalCost: number;
  suggestion: string;
}

interface PriceTrend {
  direction: 'increasing' | 'decreasing' | 'stable';
  percentageChange: number;
  averageAmount: number;
}

interface SearchFilters {
  filters: {
    vendor?: string;
    vendorName?: string;
    dateFrom?: string;
    dateTo?: string;
    amountMin?: number;
    amountMax?: number;
    status?: string;
    category?: string;
    currency?: string;
    recommendation?: string;
  };
  sortBy?: 'date' | 'amount' | 'vendor';
  sortOrder?: 'asc' | 'desc';
  interpretation?: string;
}

interface RecommendationResult {
  recommendation: string;
  confidence: number;
  reasoning: string;
  evidence: string[];
  riskFactors: string[];
  suggestedActions: string[];
}

function computeIntervals(sortedInvoices: Record<string, any>[]): number[] {
  const intervals: number[] = [];
  for (let i = 1; i < sortedInvoices.length; i++) {
    const prevDate = new Date(sortedInvoices[i - 1].issueDate ?? '');
    const currDate = new Date(sortedInvoices[i].issueDate ?? '');
    const daysDiff = Math.round(
      (currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24),
    );
    intervals.push(daysDiff);
  }
  return intervals;
}

function detectRecurrencePattern(
  intervals: number[],
): 'monthly' | 'quarterly' | 'annually' | null {
  if (intervals.length === 0) return null;

  const avgInterval =
    intervals.reduce((sum, i) => sum + i, 0) / intervals.length;

  // Monthly: 25-35 days average
  if (avgInterval >= 25 && avgInterval <= 35) {
    return 'monthly';
  }

  // Quarterly: 80-100 days average
  if (avgInterval >= 80 && avgInterval <= 100) {
    return 'quarterly';
  }

  // Annually: 340-395 days average
  if (avgInterval >= 340 && avgInterval <= 395) {
    return 'annually';
  }

  return null;
}

function computePriceTrend(sortedInvoices: Record<string, any>[]): PriceTrend {
  const amounts = sortedInvoices.map((inv) => inv.total ?? 0);
  const averageAmount =
    amounts.reduce((sum, a) => sum + a, 0) / amounts.length;

  if (amounts.length < 2) {
    return { direction: 'stable', percentageChange: 0, averageAmount };
  }

  const firstAmount = amounts[0];
  const lastAmount = amounts[amounts.length - 1];
  const percentageChange =
    firstAmount !== 0
      ? ((lastAmount - firstAmount) / firstAmount) * 100
      : 0;

  let direction: 'increasing' | 'decreasing' | 'stable';
  if (percentageChange > 5) {
    direction = 'increasing';
  } else if (percentageChange < -5) {
    direction = 'decreasing';
  } else {
    direction = 'stable';
  }

  return {
    direction,
    percentageChange: Math.round(percentageChange * 100) / 100,
    averageAmount: Math.round(averageAmount * 100) / 100,
  };
}
