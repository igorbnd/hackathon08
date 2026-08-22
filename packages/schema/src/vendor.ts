import { z } from 'zod';
import { AddressSchema } from './types.js';

// ─── Contact Channel Schema ─────────────────────────────────────────────────

export const ContactChannelSchema = z.object({
  type: z.string(),
  value: z.string(),
});

export type ContactChannel = z.infer<typeof ContactChannelSchema>;

// ─── Vendor Schema (full spec version, embedded in invoice) ─────────────────

export const VendorDetailSchema = z.object({
  name: z.string(),
  normalisedName: z.string().optional(),
  taxId: z.string().optional(),
  address: AddressSchema.optional(),
  contactChannels: z.array(ContactChannelSchema).optional(),
});

export type VendorDetail = z.infer<typeof VendorDetailSchema>;

// ─── Vendor Schema (fixtures/vendors.json structure) ────────────────────────

export const VendorSchema = z.object({
  id: z.string(),
  name: z.string(),
  address: AddressSchema,
  phone: z.string().optional(),
  email: z.string().email().optional(),
  taxId: z.string().optional(),
  accountNumber: z.string().optional(),
  type: z.string(),
  description: z.string().optional(),
});

export type Vendor = z.infer<typeof VendorSchema>;
