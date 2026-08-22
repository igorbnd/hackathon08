import { describe, it, expect } from 'vitest';
import { InvoiceSchema, VendorSchema, LineItemSchema } from '../index.js';

// ─── Fixture data (copied from fixtures/invoices/*.json) ────────────────────

const fixtureInvoice1 = {
  invoiceId: 'INV-WBC-2022-0701',
  vendorId: 'borough-westmere',
  vendorName: 'Borough of Westmere Council',
  issueDate: '2022-07-01',
  dueDate: '2022-07-28',
  referenceNumber: 'WBC/CT/2022-23/Q2-74521903',
  lineItems: [
    {
      description: 'Council Tax - Band D (quarterly instalment 2 of 4)',
      quantity: 1,
      unitPrice: 524.75,
      amount: 524.75,
      vatRate: 0,
    },
  ],
  subtotal: 524.75,
  vatAmount: 0.0,
  total: 524.75,
  currency: 'GBP',
  status: 'paid',
  category: 'council-tax',
  metadata: {
    taxYear: '2022-23',
    instalmentNumber: 2,
    totalInstalments: 4,
  },
};

const fixtureInvoice2 = {
  invoiceId: 'INV-NXW-2024-0201',
  vendorId: 'nexwave-fibre',
  vendorName: 'Nexwave Fibre Ltd',
  issueDate: '2024-02-05',
  dueDate: '2024-02-20',
  referenceNumber: 'NXW/2024/00201',
  lineItems: [
    {
      description: 'Fibre Unlimited 80 - Monthly subscription',
      quantity: 1,
      unitPrice: 41.29,
      amount: 41.29,
      vatRate: 20,
    },
    {
      description: 'Line rental',
      quantity: 1,
      unitPrice: 12.0,
      amount: 12.0,
      vatRate: 20,
    },
  ],
  subtotal: 53.29,
  vatAmount: 10.66,
  total: 63.95,
  currency: 'GBP',
  status: 'unpaid',
  category: 'broadband',
  metadata: {
    contractStartDate: '2022-01-15',
    contractEndDate: '2024-01-14',
    priceIncreasePercent: 18,
    priceIncreaseAppliedTo: 'subscription-only',
    previousSubscriptionPrice: 34.99,
    previousTotal: 56.39,
    noticeSent: false,
    story: 'price-rise-triggered',
  },
};

const fixtureInvoice3 = {
  invoiceId: 'INV-CDP-2023-0401',
  vendorId: 'clouddeck-pro',
  vendorName: 'CloudDeck Pro Ltd',
  issueDate: '2023-04-01',
  dueDate: '2023-04-15',
  referenceNumber: 'CDP-2023-04-LIC-A',
  lineItems: [
    {
      description: 'CloudDeck Pro Team - Licence A (10 seats)',
      quantity: 1,
      unitPrice: 199.0,
      amount: 199.0,
      vatRate: 20,
    },
  ],
  subtotal: 199.0,
  vatAmount: 39.8,
  total: 238.8,
  currency: 'GBP',
  status: 'paid',
  category: 'saas-subscription',
  metadata: {
    licenceId: 'LIC-A-0042',
    seats: 10,
    billingCycle: 'monthly',
    story: 'overlapping-licence-A',
  },
};

const fixtureVendor = {
  id: 'nexwave-fibre',
  name: 'Nexwave Fibre Ltd',
  address: {
    line1: 'Unit 7, Broadgate Business Park',
    line2: 'Kingsbrook Lane',
    city: 'Thornbury',
    postcode: 'TH4 9PQ',
    country: 'GB',
  },
  phone: '+44 1234 567001',
  email: 'billing@nexwavefibre.example',
  taxId: 'GB 123 4567 01',
  accountNumber: 'NXW-ACC-20210045',
  type: 'broadband',
  description: 'Fibre broadband and landline provider',
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('InvoiceSchema', () => {
  it('should validate fixture invoice 1 (borough-westmere-2022-07-001)', () => {
    const result = InvoiceSchema.safeParse(fixtureInvoice1);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.invoiceId).toBe('INV-WBC-2022-0701');
      expect(result.data.status).toBe('paid');
      expect(result.data.lineItems).toHaveLength(1);
    }
  });

  it('should validate fixture invoice 2 (nexwave-fibre-2024-02-001)', () => {
    const result = InvoiceSchema.safeParse(fixtureInvoice2);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.invoiceId).toBe('INV-NXW-2024-0201');
      expect(result.data.status).toBe('unpaid');
      expect(result.data.lineItems).toHaveLength(2);
      expect(result.data.total).toBe(63.95);
    }
  });

  it('should validate fixture invoice 3 (clouddeck-pro-2023-04-001)', () => {
    const result = InvoiceSchema.safeParse(fixtureInvoice3);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.invoiceId).toBe('INV-CDP-2023-0401');
      expect(result.data.category).toBe('saas-subscription');
    }
  });

  it('should accept optional full-spec extension fields', () => {
    const extendedInvoice = {
      ...fixtureInvoice1,
      userId: 'user-001',
      documentType: 'invoice',
      period: { from: '2022-07-01', to: '2022-09-30' },
      paymentTerms: 'Net 28',
      paymentMethods: ['direct-debit'],
      accountNumber: 'WBC-CT-****1903',
      recurrence: { isRecurring: true, cadence: 'quarterly' },
      sourceDocument: { s3Key: 'uploads/inv-wbc.pdf', mimeType: 'application/pdf' },
      extraction: {
        model: 'textract-expense',
        version: '1.0.0',
        extractedAt: '2024-06-01T12:00:00Z',
      },
      provenance: [
        { field: 'total', source: 'textract', confidence: 0.98 },
      ],
    };
    const result = InvoiceSchema.safeParse(extendedInvoice);
    expect(result.success).toBe(true);
  });

  it('should reject an invoice with an invalid status', () => {
    const invalid = { ...fixtureInvoice1, status: 'overdue' };
    const result = InvoiceSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should reject an invoice with empty lineItems', () => {
    const invalid = { ...fixtureInvoice1, lineItems: [] };
    const result = InvoiceSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should reject an invoice missing required fields', () => {
    const { invoiceId, ...incomplete } = fixtureInvoice1;
    const result = InvoiceSchema.safeParse(incomplete);
    expect(result.success).toBe(false);
  });
});

describe('VendorSchema', () => {
  it('should validate a fixture vendor', () => {
    const result = VendorSchema.safeParse(fixtureVendor);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe('nexwave-fibre');
      expect(result.data.name).toBe('Nexwave Fibre Ltd');
    }
  });

  it('should reject a vendor missing required fields', () => {
    const { id, ...incomplete } = fixtureVendor;
    const result = VendorSchema.safeParse(incomplete);
    expect(result.success).toBe(false);
  });
});

describe('LineItemSchema', () => {
  it('should validate a complete line item', () => {
    const lineItem = {
      description: 'Test item',
      quantity: 2,
      unitPrice: 10.0,
      amount: 20.0,
      vatRate: 20,
    };
    const result = LineItemSchema.safeParse(lineItem);
    expect(result.success).toBe(true);
  });

  it('should accept a line item without vatRate (optional)', () => {
    const lineItem = {
      description: 'Test item',
      quantity: 1,
      unitPrice: 100.0,
      amount: 100.0,
    };
    const result = LineItemSchema.safeParse(lineItem);
    expect(result.success).toBe(true);
  });

  it('should accept a line item with category (optional)', () => {
    const lineItem = {
      description: 'Consulting hours',
      quantity: 8,
      unitPrice: 150.0,
      amount: 1200.0,
      category: 'consulting',
    };
    const result = LineItemSchema.safeParse(lineItem);
    expect(result.success).toBe(true);
  });
});
