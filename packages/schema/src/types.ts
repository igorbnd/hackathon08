import { z } from 'zod';

// ─── Status Enum ────────────────────────────────────────────────────────────

export const InvoiceStatusSchema = z.enum([
  'unpaid',
  'paid',
  'disputed',
  'cancelled',
]);

export type InvoiceStatus = z.infer<typeof InvoiceStatusSchema>;

// ─── Document Type Enum ─────────────────────────────────────────────────────

export const DocumentTypeSchema = z.enum([
  'invoice',
  'bill',
  'receipt',
  'statement',
  'reminder',
  'final notice',
]);

export type DocumentType = z.infer<typeof DocumentTypeSchema>;

// ─── Recurrence Cadence Enum ────────────────────────────────────────────────

export const RecurrenceCadenceSchema = z.enum([
  'weekly',
  'fortnightly',
  'monthly',
  'quarterly',
  'annually',
]);

export type RecurrenceCadence = z.infer<typeof RecurrenceCadenceSchema>;

// ─── Address Schema ─────────────────────────────────────────────────────────

export const AddressSchema = z.object({
  line1: z.string(),
  line2: z.string().optional(),
  city: z.string(),
  postcode: z.string(),
  country: z.string(),
});

export type Address = z.infer<typeof AddressSchema>;

// ─── Period Schema ──────────────────────────────────────────────────────────

export const PeriodSchema = z.object({
  from: z.string(),
  to: z.string(),
});

export type Period = z.infer<typeof PeriodSchema>;

// ─── Recurrence Schema ──────────────────────────────────────────────────────

export const RecurrenceSchema = z.object({
  isRecurring: z.boolean(),
  cadence: RecurrenceCadenceSchema.optional(),
  contractRef: z.string().optional(),
});

export type Recurrence = z.infer<typeof RecurrenceSchema>;

// ─── Source Document Schema ─────────────────────────────────────────────────

export const SourceDocumentSchema = z.object({
  s3Key: z.string(),
  mimeType: z.string(),
  pageCount: z.number().int().positive().optional(),
  checksum: z.string().optional(),
});

export type SourceDocument = z.infer<typeof SourceDocumentSchema>;

// ─── Extraction Metadata Schema ─────────────────────────────────────────────

export const FieldConfidenceSchema = z.record(z.string(), z.number().min(0).max(1));

export type FieldConfidence = z.infer<typeof FieldConfidenceSchema>;

export const ExtractionSchema = z.object({
  confidence: FieldConfidenceSchema.optional(),
  model: z.string(),
  version: z.string(),
  extractedAt: z.string(),
});

export type Extraction = z.infer<typeof ExtractionSchema>;

// ─── Provenance Schema ──────────────────────────────────────────────────────

export const ProvenanceEntrySchema = z.object({
  field: z.string(),
  source: z.string(),
  confidence: z.number().min(0).max(1).optional(),
  extractedAt: z.string().optional(),
});

export type ProvenanceEntry = z.infer<typeof ProvenanceEntrySchema>;
