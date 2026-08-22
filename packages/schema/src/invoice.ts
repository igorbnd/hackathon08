import { z } from 'zod';
import {
  DocumentTypeSchema,
  ExtractionSchema,
  InvoiceStatusSchema,
  PeriodSchema,
  ProvenanceEntrySchema,
  RecurrenceSchema,
  SourceDocumentSchema,
} from './types.js';
import { VendorDetailSchema } from './vendor.js';

// ─── Line Item Schema ───────────────────────────────────────────────────────

export const LineItemSchema = z.object({
  description: z.string(),
  quantity: z.number(),
  unitPrice: z.number(),
  amount: z.number(),
  vatRate: z.number().optional(),
  category: z.string().optional(),
});

export type LineItem = z.infer<typeof LineItemSchema>;

// ─── Invoice Schema ─────────────────────────────────────────────────────────
//
// Required fields: those present in every fixture invoice (V1 baseline).
// Optional fields: from the full functional spec, added for forward compatibility.
//

export const InvoiceSchema = z.object({
  // ── Required (fixture baseline) ───────────────────────────────────────────
  invoiceId: z.string(),
  vendorId: z.string(),
  vendorName: z.string(),
  issueDate: z.string(),
  dueDate: z.string(),
  referenceNumber: z.string(),
  lineItems: z.array(LineItemSchema).min(1),
  subtotal: z.number(),
  vatAmount: z.number(),
  total: z.number(),
  currency: z.string(),
  status: InvoiceStatusSchema,
  category: z.string(),
  metadata: z.record(z.string(), z.unknown()),

  // ── Optional (full spec extensions) ───────────────────────────────────────
  userId: z.string().optional(),
  vendor: VendorDetailSchema.optional(),
  documentType: DocumentTypeSchema.optional(),
  period: PeriodSchema.optional(),
  taxAmount: z.number().optional(),
  totalAmount: z.number().optional(),
  paymentTerms: z.string().optional(),
  paymentMethods: z.array(z.string()).optional(),
  referenceNumbers: z.array(z.string()).optional(),
  accountNumber: z.string().optional(),
  recurrence: RecurrenceSchema.optional(),
  sourceDocument: SourceDocumentSchema.optional(),
  extraction: ExtractionSchema.optional(),
  provenance: z.array(ProvenanceEntrySchema).optional(),
});

export type Invoice = z.infer<typeof InvoiceSchema>;
