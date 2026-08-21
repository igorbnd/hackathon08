/**
 * generate-pdfs.ts
 *
 * Reads each invoice JSON from /fixtures/invoices/ and generates a realistic-looking
 * PDF invoice in /fixtures/pdfs/. Uses pdf-lib for PDF creation.
 *
 * Usage: npx tsx generate-pdfs.ts
 *
 * Attribution: pdf-lib (MIT) - https://github.com/Hopding/pdf-lib
 */

import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import { join, basename } from "node:path";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  vatRate: number;
}

interface Invoice {
  invoiceId: string;
  vendorId: string;
  vendorName: string;
  issueDate: string;
  dueDate: string;
  referenceNumber: string;
  lineItems: LineItem[];
  subtotal: number;
  vatAmount: number;
  total: number;
  currency: string;
  status: string;
  category: string;
  metadata?: Record<string, unknown>;
}

interface Vendor {
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
}

const FIXTURES_DIR = join(import.meta.dirname ?? ".", "..");
const INVOICES_DIR = join(FIXTURES_DIR, "invoices");
const PDFS_DIR = join(FIXTURES_DIR, "pdfs");
const VENDORS_PATH = join(FIXTURES_DIR, "vendors.json");

function formatCurrency(amount: number): string {
  return `£${amount.toFixed(2)}`;
}

async function loadVendors(): Promise<Map<string, Vendor>> {
  const raw = await readFile(VENDORS_PATH, "utf-8");
  const vendors: Vendor[] = JSON.parse(raw);
  const map = new Map<string, Vendor>();
  for (const v of vendors) {
    map.set(v.id, v);
  }
  return map;
}

async function generatePdf(
  invoice: Invoice,
  vendor: Vendor
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]); // A4
  const { width, height } = page.getSize();

  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const margin = 50;
  let y = height - margin;

  // Vendor name (header)
  page.drawText(vendor.name, {
    x: margin,
    y,
    size: 18,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.4),
  });
  y -= 20;

  // Vendor address
  const addressLines = [
    vendor.address.line1,
    vendor.address.line2,
    `${vendor.address.city}, ${vendor.address.postcode}`,
    vendor.phone,
    vendor.email,
    `VAT: ${vendor.taxId}`,
  ].filter(Boolean);

  for (const line of addressLines) {
    page.drawText(line, { x: margin, y, size: 9, font: fontRegular });
    y -= 13;
  }

  y -= 20;

  // Invoice title
  page.drawText("INVOICE", {
    x: margin,
    y,
    size: 16,
    font: fontBold,
    color: rgb(0, 0, 0),
  });
  y -= 25;

  // Invoice details
  const detailLines = [
    `Invoice No:    ${invoice.referenceNumber}`,
    `Invoice ID:    ${invoice.invoiceId}`,
    `Issue Date:    ${invoice.issueDate}`,
    `Due Date:      ${invoice.dueDate}`,
    `Account Ref:   ${vendor.accountNumber}`,
  ];

  for (const line of detailLines) {
    page.drawText(line, { x: margin, y, size: 10, font: fontRegular });
    y -= 15;
  }

  y -= 20;

  // Table header
  const colX = {
    description: margin,
    qty: 320,
    unitPrice: 380,
    vat: 450,
    amount: 500,
  };

  page.drawText("Description", {
    x: colX.description,
    y,
    size: 9,
    font: fontBold,
  });
  page.drawText("Qty", { x: colX.qty, y, size: 9, font: fontBold });
  page.drawText("Unit Price", {
    x: colX.unitPrice,
    y,
    size: 9,
    font: fontBold,
  });
  page.drawText("VAT %", { x: colX.vat, y, size: 9, font: fontBold });
  page.drawText("Amount", { x: colX.amount, y, size: 9, font: fontBold });

  y -= 5;
  page.drawLine({
    start: { x: margin, y },
    end: { x: width - margin, y },
    thickness: 0.5,
    color: rgb(0.5, 0.5, 0.5),
  });
  y -= 15;

  // Line items
  for (const item of invoice.lineItems) {
    // Truncate description if too long
    const desc =
      item.description.length > 45
        ? item.description.substring(0, 42) + "..."
        : item.description;

    page.drawText(desc, {
      x: colX.description,
      y,
      size: 9,
      font: fontRegular,
    });
    page.drawText(String(item.quantity), {
      x: colX.qty,
      y,
      size: 9,
      font: fontRegular,
    });
    page.drawText(formatCurrency(item.unitPrice), {
      x: colX.unitPrice,
      y,
      size: 9,
      font: fontRegular,
    });
    page.drawText(`${item.vatRate}%`, {
      x: colX.vat,
      y,
      size: 9,
      font: fontRegular,
    });
    page.drawText(formatCurrency(item.amount), {
      x: colX.amount,
      y,
      size: 9,
      font: fontRegular,
    });
    y -= 16;
  }

  y -= 10;
  page.drawLine({
    start: { x: margin, y },
    end: { x: width - margin, y },
    thickness: 0.5,
    color: rgb(0.5, 0.5, 0.5),
  });
  y -= 20;

  // Totals
  page.drawText("Subtotal:", { x: 400, y, size: 10, font: fontRegular });
  page.drawText(formatCurrency(invoice.subtotal), {
    x: colX.amount,
    y,
    size: 10,
    font: fontRegular,
  });
  y -= 16;

  page.drawText("VAT:", { x: 400, y, size: 10, font: fontRegular });
  page.drawText(formatCurrency(invoice.vatAmount), {
    x: colX.amount,
    y,
    size: 10,
    font: fontRegular,
  });
  y -= 18;

  page.drawText("TOTAL:", { x: 400, y, size: 12, font: fontBold });
  page.drawText(formatCurrency(invoice.total), {
    x: colX.amount,
    y,
    size: 12,
    font: fontBold,
  });
  y -= 40;

  // Payment details
  page.drawText("Payment Details", { x: margin, y, size: 10, font: fontBold });
  y -= 15;
  page.drawText(
    `Please pay ${formatCurrency(invoice.total)} by ${invoice.dueDate}`,
    {
      x: margin,
      y,
      size: 9,
      font: fontRegular,
    }
  );
  y -= 13;
  page.drawText(`Sort code: 12-34-56  Account: 98765432`, {
    x: margin,
    y,
    size: 9,
    font: fontRegular,
  });
  y -= 13;
  page.drawText(`Reference: ${invoice.referenceNumber}`, {
    x: margin,
    y,
    size: 9,
    font: fontRegular,
  });

  return doc.save();
}

async function main(): Promise<void> {
  console.log("Generating PDFs from invoice JSON files...");

  await mkdir(PDFS_DIR, { recursive: true });

  const vendors = await loadVendors();
  const files = await readdir(INVOICES_DIR);
  const jsonFiles = files.filter((f) => f.endsWith(".json")).sort();

  console.log(`Found ${jsonFiles.length} invoice JSON files`);

  let count = 0;
  for (const file of jsonFiles) {
    const raw = await readFile(join(INVOICES_DIR, file), "utf-8");
    const invoice: Invoice = JSON.parse(raw);
    const vendor = vendors.get(invoice.vendorId);

    if (!vendor) {
      console.warn(
        `WARNING: No vendor found for ${invoice.vendorId} in ${file}, skipping`
      );
      continue;
    }

    const pdfBytes = await generatePdf(invoice, vendor);
    const pdfName = basename(file, ".json") + ".pdf";
    await writeFile(join(PDFS_DIR, pdfName), pdfBytes);
    count++;
  }

  console.log(`Generated ${count} PDFs in ${PDFS_DIR}`);
}

main().catch((err) => {
  console.error("Failed to generate PDFs:", err);
  process.exit(1);
});
