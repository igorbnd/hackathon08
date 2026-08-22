// ─── Canonical Invoice Schema ────────────────────────────────────────────────
// Single source of truth for invoice data types.
// No other file in this repository may redefine invoice fields.
// ─────────────────────────────────────────────────────────────────────────────

export {
  InvoiceStatusSchema,
  type InvoiceStatus,
  DocumentTypeSchema,
  type DocumentType,
  RecurrenceCadenceSchema,
  type RecurrenceCadence,
  AddressSchema,
  type Address,
  PeriodSchema,
  type Period,
  RecurrenceSchema,
  type Recurrence,
  SourceDocumentSchema,
  type SourceDocument,
  FieldConfidenceSchema,
  type FieldConfidence,
  ExtractionSchema,
  type Extraction,
  ProvenanceEntrySchema,
  type ProvenanceEntry,
} from './types.js';

export {
  ContactChannelSchema,
  type ContactChannel,
  VendorDetailSchema,
  type VendorDetail,
  VendorSchema,
  type Vendor,
} from './vendor.js';

export {
  LineItemSchema,
  type LineItem,
  InvoiceSchema,
  type Invoice,
} from './invoice.js';
