# InvoiceIQ Demo Script

**Total runtime:** 2 minutes 55 seconds  
**Format:** Screen recording with voiceover  
**Rule:** Front-load the working product. Judges may stop watching at 3:00.

---

## Segment 1: The Problem (0:00 - 0:15)

**On screen:** Title card with InvoiceIQ logo, then cut to a messy pile of PDF invoices in a file explorer.

**Say:**

> "Every month, businesses receive dozens of invoices from different vendors in different formats. Hidden inside are price rises without notice, duplicate charges, overlapping subscriptions, and anomalous readings. Most go unnoticed. InvoiceIQ catches them automatically."

---

## Segment 2: Upload (0:15 - 0:40)

**On screen:** Log in with `demo@invoiceiq.example` / `Demo1234!Secure`. Navigate to the Upload page. Drag and drop a batch of PDF invoices.

**Say:**

> "I log in with our demo account. Here is the upload screen. I will drag in six invoices from different vendors - a telecom bill, office supplies, a SaaS subscription, an energy bill, a consulting invoice, and stationery. The system uploads each PDF to S3 and kicks off the extraction pipeline."

**Action:** Drop the files and show the upload progress indicators completing.

---

## Segment 3: Extraction into Canonical JSON (0:40 - 1:10)

**On screen:** Click into the first processed invoice (Nexwave Fibre). Show the canonical JSON panel expanding with structured fields.

**Say:**

> "Within seconds, Textract extracts every field from the PDF - vendor name, invoice number, dates, line items, totals. Then Bedrock Claude normalises this into our canonical JSON schema: consistent field names, ISO dates, amounts in pence. Every invoice, regardless of format, becomes machine-comparable."

**Action:** Scroll through the JSON showing `vendor_id`, `invoice_date`, `line_items[]`, `total_amount`, `currency`. Highlight how messy PDF data became clean structured output.

---

## Segment 4: Historical Comparison (1:10 - 1:35)

**On screen:** Navigate to the Nexwave Fibre vendor history view. Show a timeline chart of monthly charges.

**Say:**

> "InvoiceIQ compares each new invoice against the full history for that vendor. Here is Nexwave Fibre - twelve months of broadband at 45 pounds, then suddenly 53 pounds this month. That is an 18% jump. The system spots this instantly by comparing against the historical baseline."

**Action:** Point to the chart spike. Show the delta calculation in the comparison panel.

---

## Segment 5: Recommendation with Evidence (1:35 - 2:05)

**On screen:** Show the AI recommendation card for Nexwave Fibre with the QUERY verdict and evidence bullets.

**Say:**

> "Bedrock generates a recommendation grounded in evidence. For Nexwave, it says QUERY - the price rose 18% after the minimum contract ended. It cites the exact invoices, the percentage change, and suggests checking whether a new contract was agreed. Now look at this duplicate detection - Pinnacle Office Supplies billed us twice for identical items. The system flags it as DISPUTE with line-by-line proof."

**Action:** Click to the Pinnacle duplicate. Show side-by-side comparison with matching line items highlighted.

---

## Segment 6: Subscription Waste Panel (2:05 - 2:25)

**On screen:** Navigate to the Subscriptions dashboard. Show CloudDeck Pro with two overlapping active licences.

**Say:**

> "The subscription waste panel aggregates recurring charges across all vendors. Here it caught CloudDeck Pro - we are paying for two licences covering the same months. That is 79 pounds per month wasted. One click and I can see exactly which invoices prove the overlap."

**Action:** Expand the overlap detail showing both invoice references and date ranges.

---

## Segment 7: How Kiro Was Used (2:25 - 2:45)

**On screen:** Show the `.kiro/` directory in the repo. Open `steering/product.md`, then `specs/foundation-and-infra/tasks.md`.

**Say:**

> "This project was built entirely with Kiro. Steering files locked our architectural decisions upfront - product scope, tech stack, and hackathon constraints. Specs followed the requirements, design, tasks cycle. Kiro generated the CDK infrastructure, Lambda handlers, fixture data, and this demo script. The .kiro directory in our repo shows the full audit trail."

**Action:** Briefly scroll the steering files, then show the tasks checklist.

---

## Segment 8: Close (2:45 - 2:55)

**On screen:** Return to the dashboard showing all six invoices with their verdicts (QUERY, DISPUTE, QUERY, QUERY, REVIEW, PAY). Show the architecture diagram from the README.

**Say:**

> "InvoiceIQ: upload any invoice, get structured data, historical context, and an actionable recommendation with evidence. Built serverless on AWS with Kiro. Thank you."

---

## Timing Summary

| Segment | Start | End | Duration |
|---------|-------|-----|----------|
| Problem | 0:00 | 0:15 | 15s |
| Upload | 0:15 | 0:40 | 25s |
| Extraction | 0:40 | 1:10 | 30s |
| Historical comparison | 1:10 | 1:35 | 25s |
| Recommendation | 1:35 | 2:05 | 30s |
| Subscription waste | 2:05 | 2:25 | 20s |
| Kiro usage | 2:25 | 2:45 | 20s |
| Close | 2:45 | 2:55 | 10s |
| **Total** | | | **2:55** |

---

## Production Notes

- Record at 1080p, 30fps minimum
- Use browser zoom at 125% for readability on small screens
- Keep mouse movements deliberate and slow
- Pause briefly (0.5s) on each key screen before speaking
- Use a quiet room with no echo for voiceover
- If a segment runs long, trim the Kiro segment first (judges care most about the working product)
