/**
 * Curated sample invoice corpus for the "load sample data" feature.
 *
 * WHY THIS EXISTS
 * A brand new account is empty, and the landing page correctly tells users not
 * to upload real invoices into a prototype. Without seedable demo data there is
 * nothing for a new user to evaluate. This module provides a small, coherent
 * corpus that exercises every detection story the app claims to support.
 *
 * DATES ARE RELATIVE
 * Issue dates are computed as offsets from "today" at seed time rather than
 * hard-coded, so the corpus never looks stale and the due-date indicators on
 * the dashboard have something realistic to show.
 *
 * NOTE ON DUPLICATION
 * /fixtures/invoices/*.json holds the larger 50-invoice corpus used by the
 * offline seed script. That data cannot be read from a Lambda without bundling
 * or an S3 round-trip, so this is a deliberately smaller in-code subset. All
 * vendors and figures here are entirely fictional.
 */

export interface SampleLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  vatRate: number;
}

export interface SampleInvoiceTemplate {
  /** Stable suffix — makes re-seeding overwrite rather than duplicate */
  id: string;
  vendorId: string;
  vendorName: string;
  /** Whole months back from today */
  monthsAgo: number;
  /** Day of month for the issue date (kept <= 18 to avoid month-end rollover) */
  day: number;
  /** Payment terms, in days after the issue date */
  dueInDays: number;
  referenceNumber: string;
  lineItems: SampleLineItem[];
  subtotal: number;
  vatAmount: number;
  total: number;
  currency: string;
  status: 'unpaid' | 'paid' | 'disputed' | 'cancelled';
  category: string;
  metadata: Record<string, unknown>;
}

// ─── Date helpers ────────────────────────────────────────────────────────────

/**
 * ISO date string for `monthsAgo` months before today, on the given day.
 * Built via Date.UTC so negative month values roll the year back correctly.
 */
export function isoDateMonthsAgo(monthsAgo: number, day: number): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, day));
  return d.toISOString().slice(0, 10);
}

/** Add whole days to an ISO date string. */
export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ─── The corpus ──────────────────────────────────────────────────────────────

export const SAMPLE_INVOICES: SampleInvoiceTemplate[] = [
  // ── Story 1: broadband price rise of 18% at contract end, no notice ───────
  {
    id: 'nexwave-01',
    vendorId: 'nexwave-fibre',
    vendorName: 'Nexwave Fibre Ltd',
    monthsAgo: 9,
    day: 5,
    dueInDays: 15,
    referenceNumber: 'NXW/2023/00945',
    lineItems: [
      { description: 'Fibre Unlimited 80 - Monthly subscription', quantity: 1, unitPrice: 34.99, amount: 34.99, vatRate: 20 },
      { description: 'Line rental', quantity: 1, unitPrice: 12.0, amount: 12.0, vatRate: 20 },
    ],
    subtotal: 46.99,
    vatAmount: 9.4,
    total: 56.39,
    currency: 'GBP',
    status: 'paid',
    category: 'broadband',
    metadata: { story: 'price-rise-baseline', contractEndsInMonths: 6 },
  },
  {
    id: 'nexwave-02',
    vendorId: 'nexwave-fibre',
    vendorName: 'Nexwave Fibre Ltd',
    monthsAgo: 6,
    day: 5,
    dueInDays: 15,
    referenceNumber: 'NXW/2023/01254',
    lineItems: [
      { description: 'Fibre Unlimited 80 - Monthly subscription', quantity: 1, unitPrice: 34.99, amount: 34.99, vatRate: 20 },
      { description: 'Line rental', quantity: 1, unitPrice: 12.0, amount: 12.0, vatRate: 20 },
    ],
    subtotal: 46.99,
    vatAmount: 9.4,
    total: 56.39,
    currency: 'GBP',
    status: 'paid',
    category: 'broadband',
    metadata: { story: 'price-rise-baseline' },
  },
  {
    id: 'nexwave-03',
    vendorId: 'nexwave-fibre',
    vendorName: 'Nexwave Fibre Ltd',
    monthsAgo: 3,
    day: 5,
    dueInDays: 15,
    referenceNumber: 'NXW/2024/00201',
    lineItems: [
      { description: 'Fibre Unlimited 80 - Monthly subscription', quantity: 1, unitPrice: 34.99, amount: 34.99, vatRate: 20 },
      { description: 'Line rental', quantity: 1, unitPrice: 12.0, amount: 12.0, vatRate: 20 },
    ],
    subtotal: 46.99,
    vatAmount: 9.4,
    total: 56.39,
    currency: 'GBP',
    status: 'paid',
    category: 'broadband',
    metadata: { story: 'price-rise-baseline' },
  },
  {
    id: 'nexwave-04',
    vendorId: 'nexwave-fibre',
    vendorName: 'Nexwave Fibre Ltd',
    monthsAgo: 0,
    day: 5,
    dueInDays: 15,
    referenceNumber: 'NXW/2024/00312',
    lineItems: [
      { description: 'Fibre Unlimited 80 - Monthly subscription', quantity: 1, unitPrice: 41.29, amount: 41.29, vatRate: 20 },
      { description: 'Line rental', quantity: 1, unitPrice: 12.0, amount: 12.0, vatRate: 20 },
    ],
    subtotal: 53.29,
    vatAmount: 10.66,
    total: 63.95,
    currency: 'GBP',
    status: 'unpaid',
    category: 'broadband',
    metadata: {
      story: 'price-rise-triggered',
      priceIncreasePercent: 18,
      priceIncreaseAppliedTo: 'subscription-only',
      previousSubscriptionPrice: 34.99,
      noticeSent: false,
      contractEnded: true,
    },
  },

  // ── Story 2: the same invoice issued twice under different references ─────
  {
    id: 'pinnacle-01',
    vendorId: 'pinnacle-office',
    vendorName: 'Pinnacle Office Supplies',
    monthsAgo: 1,
    day: 14,
    dueInDays: 30,
    referenceNumber: 'POS/INV/2024-0847',
    lineItems: [
      { description: 'Ergonomic Desk Chair - Model X200', quantity: 4, unitPrice: 289.0, amount: 1156.0, vatRate: 20 },
      { description: 'Standing Desk Converter - Adjustable', quantity: 4, unitPrice: 175.0, amount: 700.0, vatRate: 20 },
      { description: 'Delivery and assembly', quantity: 1, unitPrice: 85.0, amount: 85.0, vatRate: 20 },
    ],
    subtotal: 1941.0,
    vatAmount: 388.2,
    total: 2329.2,
    currency: 'GBP',
    status: 'paid',
    category: 'office-supplies',
    metadata: { story: 'duplicate-original' },
  },
  {
    id: 'pinnacle-02',
    vendorId: 'pinnacle-office',
    vendorName: 'Pinnacle Office Supplies',
    monthsAgo: 1,
    day: 14,
    dueInDays: 8,
    referenceNumber: 'POS/INV/2024-0851',
    lineItems: [
      { description: 'Ergonomic Desk Chair - Model X200', quantity: 4, unitPrice: 289.0, amount: 1156.0, vatRate: 20 },
      { description: 'Standing Desk Converter - Adjustable', quantity: 4, unitPrice: 175.0, amount: 700.0, vatRate: 20 },
      { description: 'Delivery and assembly', quantity: 1, unitPrice: 85.0, amount: 85.0, vatRate: 20 },
    ],
    subtotal: 1941.0,
    vatAmount: 388.2,
    total: 2329.2,
    currency: 'GBP',
    status: 'unpaid',
    category: 'office-supplies',
    metadata: {
      story: 'duplicate-copy',
      note: 'Identical line items, amounts and issue date to POS/INV/2024-0847 but a different reference number',
    },
  },

  // ── Story 3: two overlapping SaaS licences for the same period ────────────
  {
    id: 'clouddeck-a1',
    vendorId: 'clouddeck-pro',
    vendorName: 'CloudDeck Pro Ltd',
    monthsAgo: 2,
    day: 1,
    dueInDays: 14,
    referenceNumber: 'CDP-LIC-A-0418',
    lineItems: [
      { description: 'CloudDeck Pro Team - Licence A (10 seats)', quantity: 1, unitPrice: 199.0, amount: 199.0, vatRate: 20 },
    ],
    subtotal: 199.0,
    vatAmount: 39.8,
    total: 238.8,
    currency: 'GBP',
    status: 'paid',
    category: 'saas-subscription',
    metadata: { story: 'overlapping-licence-A', licenceId: 'LIC-A-0042', seats: 10 },
  },
  {
    id: 'clouddeck-b1',
    vendorId: 'clouddeck-pro',
    vendorName: 'CloudDeck Pro Ltd',
    monthsAgo: 2,
    day: 1,
    dueInDays: 14,
    referenceNumber: 'CDP-LIC-B-0419',
    lineItems: [
      { description: 'CloudDeck Pro Team - Licence B (6 seats)', quantity: 1, unitPrice: 119.0, amount: 119.0, vatRate: 20 },
    ],
    subtotal: 119.0,
    vatAmount: 23.8,
    total: 142.8,
    currency: 'GBP',
    status: 'paid',
    category: 'saas-subscription',
    metadata: { story: 'overlapping-licence-B', licenceId: 'LIC-B-0117', seats: 6 },
  },
  {
    id: 'clouddeck-a2',
    vendorId: 'clouddeck-pro',
    vendorName: 'CloudDeck Pro Ltd',
    monthsAgo: 1,
    day: 1,
    dueInDays: 14,
    referenceNumber: 'CDP-LIC-A-0525',
    lineItems: [
      { description: 'CloudDeck Pro Team - Licence A (10 seats)', quantity: 1, unitPrice: 199.0, amount: 199.0, vatRate: 20 },
    ],
    subtotal: 199.0,
    vatAmount: 39.8,
    total: 238.8,
    currency: 'GBP',
    status: 'paid',
    category: 'saas-subscription',
    metadata: { story: 'overlapping-licence-A', licenceId: 'LIC-A-0042', seats: 10 },
  },
  {
    id: 'clouddeck-b2',
    vendorId: 'clouddeck-pro',
    vendorName: 'CloudDeck Pro Ltd',
    monthsAgo: 1,
    day: 1,
    dueInDays: 14,
    referenceNumber: 'CDP-LIC-B-0526',
    lineItems: [
      { description: 'CloudDeck Pro Team - Licence B (6 seats)', quantity: 1, unitPrice: 119.0, amount: 119.0, vatRate: 20 },
    ],
    subtotal: 119.0,
    vatAmount: 23.8,
    total: 142.8,
    currency: 'GBP',
    status: 'unpaid',
    category: 'saas-subscription',
    metadata: {
      story: 'overlapping-licence-B',
      licenceId: 'LIC-B-0117',
      seats: 6,
      note: 'Licence A and Licence B cover the same billing periods',
    },
  },

  // ── Story 4: utility bill far above the rolling mean (estimated reading) ──
  {
    id: 'greendale-01',
    vendorId: 'greendale-energy',
    vendorName: 'Greendale Energy plc',
    monthsAgo: 9,
    day: 12,
    dueInDays: 21,
    referenceNumber: 'GDE/2023/Q2-88214',
    lineItems: [
      { description: 'Electricity usage (actual reading)', quantity: 820, unitPrice: 0.145, amount: 118.9, vatRate: 5 },
      { description: 'Standing charge (90 days)', quantity: 90, unitPrice: 0.53, amount: 47.7, vatRate: 5 },
    ],
    subtotal: 166.6,
    vatAmount: 8.33,
    total: 174.93,
    currency: 'GBP',
    status: 'paid',
    category: 'utilities',
    metadata: { story: 'utility-baseline', readingType: 'actual' },
  },
  {
    id: 'greendale-02',
    vendorId: 'greendale-energy',
    vendorName: 'Greendale Energy plc',
    monthsAgo: 6,
    day: 12,
    dueInDays: 21,
    referenceNumber: 'GDE/2023/Q3-91455',
    lineItems: [
      { description: 'Electricity usage (actual reading)', quantity: 640, unitPrice: 0.145, amount: 92.8, vatRate: 5 },
      { description: 'Standing charge (90 days)', quantity: 90, unitPrice: 0.53, amount: 47.7, vatRate: 5 },
    ],
    subtotal: 140.5,
    vatAmount: 7.03,
    total: 147.53,
    currency: 'GBP',
    status: 'paid',
    category: 'utilities',
    metadata: { story: 'utility-baseline', readingType: 'actual' },
  },
  {
    id: 'greendale-03',
    vendorId: 'greendale-energy',
    vendorName: 'Greendale Energy plc',
    monthsAgo: 3,
    day: 12,
    dueInDays: 21,
    referenceNumber: 'GDE/2023/Q4-94702',
    lineItems: [
      { description: 'Electricity usage (actual reading)', quantity: 910, unitPrice: 0.145, amount: 131.95, vatRate: 5 },
      { description: 'Standing charge (90 days)', quantity: 90, unitPrice: 0.53, amount: 47.7, vatRate: 5 },
    ],
    subtotal: 179.65,
    vatAmount: 8.98,
    total: 188.63,
    currency: 'GBP',
    status: 'paid',
    category: 'utilities',
    metadata: { story: 'utility-baseline', readingType: 'actual' },
  },
  {
    id: 'greendale-04',
    vendorId: 'greendale-energy',
    vendorName: 'Greendale Energy plc',
    monthsAgo: 0,
    day: 12,
    dueInDays: 7,
    referenceNumber: 'GDE/2024/Q1-97318',
    lineItems: [
      { description: 'Electricity usage (ESTIMATED reading)', quantity: 2150, unitPrice: 0.145, amount: 311.75, vatRate: 5 },
      { description: 'Standing charge (90 days)', quantity: 90, unitPrice: 0.53, amount: 47.7, vatRate: 5 },
    ],
    subtotal: 359.45,
    vatAmount: 17.97,
    total: 377.42,
    currency: 'GBP',
    status: 'unpaid',
    category: 'utilities',
    metadata: {
      story: 'estimated-reading-anomaly',
      readingType: 'estimated',
      note: 'Usage is roughly 2.4x the rolling mean of the previous three bills',
    },
  },

  // ── Story 5: a line item that has never been charged before ───────────────
  {
    id: 'ironbark-01',
    vendorId: 'ironbark-it',
    vendorName: 'Ironbark IT Services',
    monthsAgo: 7,
    day: 10,
    dueInDays: 30,
    referenceNumber: 'IBI/SVC/2023-0412',
    lineItems: [
      { description: 'Managed IT support - monthly retainer', quantity: 1, unitPrice: 240.0, amount: 240.0, vatRate: 20 },
    ],
    subtotal: 240.0,
    vatAmount: 48.0,
    total: 288.0,
    currency: 'GBP',
    status: 'paid',
    category: 'it-services',
    metadata: { story: 'new-line-item-baseline' },
  },
  {
    id: 'ironbark-02',
    vendorId: 'ironbark-it',
    vendorName: 'Ironbark IT Services',
    monthsAgo: 4,
    day: 10,
    dueInDays: 30,
    referenceNumber: 'IBI/SVC/2023-0698',
    lineItems: [
      { description: 'Managed IT support - monthly retainer', quantity: 1, unitPrice: 240.0, amount: 240.0, vatRate: 20 },
    ],
    subtotal: 240.0,
    vatAmount: 48.0,
    total: 288.0,
    currency: 'GBP',
    status: 'paid',
    category: 'it-services',
    metadata: { story: 'new-line-item-baseline' },
  },
  {
    id: 'ironbark-03',
    vendorId: 'ironbark-it',
    vendorName: 'Ironbark IT Services',
    monthsAgo: 0,
    day: 10,
    dueInDays: 30,
    referenceNumber: 'IBI/SVC/2024-0155',
    lineItems: [
      { description: 'Managed IT support - monthly retainer', quantity: 1, unitPrice: 240.0, amount: 240.0, vatRate: 20 },
      { description: 'Emergency out-of-hours callout', quantity: 1, unitPrice: 185.0, amount: 185.0, vatRate: 20 },
    ],
    subtotal: 425.0,
    vatAmount: 85.0,
    total: 510.0,
    currency: 'GBP',
    status: 'unpaid',
    category: 'it-services',
    metadata: {
      story: 'new-line-item',
      note: 'Emergency callout charge has not appeared on any previous invoice from this vendor',
    },
  },

  // ── Story 6: a legitimate, unremarkable invoice that should simply be paid ─
  {
    id: 'swiftline-01',
    vendorId: 'swiftline-telecom',
    vendorName: 'Swiftline Telecom',
    monthsAgo: 6,
    day: 18,
    dueInDays: 14,
    referenceNumber: 'SLT/2023/44120',
    lineItems: [
      { description: 'Mobile plan - 20GB', quantity: 1, unitPrice: 32.0, amount: 32.0, vatRate: 20 },
      { description: 'International calling add-on', quantity: 1, unitPrice: 8.0, amount: 8.0, vatRate: 20 },
    ],
    subtotal: 40.0,
    vatAmount: 8.0,
    total: 48.0,
    currency: 'GBP',
    status: 'paid',
    category: 'telecom',
    metadata: { story: 'legitimate-pay' },
  },
  {
    id: 'swiftline-02',
    vendorId: 'swiftline-telecom',
    vendorName: 'Swiftline Telecom',
    monthsAgo: 3,
    day: 18,
    dueInDays: 14,
    referenceNumber: 'SLT/2023/47905',
    lineItems: [
      { description: 'Mobile plan - 20GB', quantity: 1, unitPrice: 32.0, amount: 32.0, vatRate: 20 },
      { description: 'International calling add-on', quantity: 1, unitPrice: 8.0, amount: 8.0, vatRate: 20 },
    ],
    subtotal: 40.0,
    vatAmount: 8.0,
    total: 48.0,
    currency: 'GBP',
    status: 'paid',
    category: 'telecom',
    metadata: { story: 'legitimate-pay' },
  },
  {
    id: 'swiftline-03',
    vendorId: 'swiftline-telecom',
    vendorName: 'Swiftline Telecom',
    monthsAgo: 0,
    day: 18,
    dueInDays: 14,
    referenceNumber: 'SLT/2024/51338',
    lineItems: [
      { description: 'Mobile plan - 20GB', quantity: 1, unitPrice: 32.0, amount: 32.0, vatRate: 20 },
      { description: 'International calling add-on', quantity: 1, unitPrice: 8.0, amount: 8.0, vatRate: 20 },
    ],
    subtotal: 40.0,
    vatAmount: 8.0,
    total: 48.0,
    currency: 'GBP',
    status: 'unpaid',
    category: 'telecom',
    metadata: {
      story: 'legitimate-pay',
      note: 'Consistent with every prior invoice from this vendor - nothing to query',
    },
  },
];
