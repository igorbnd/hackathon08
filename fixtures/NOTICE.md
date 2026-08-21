# Synthetic Data Notice

All data in this `/fixtures` directory is **entirely synthetic** and was generated
specifically for the InvoiceIQ project.

- **No real companies, people, addresses, phone numbers, tax IDs, account numbers,
  or other identifiable information** is included.
- All vendor names, addresses, and contact details are fictional.
- All invoice amounts, line items, and reference numbers are fabricated.
- Any resemblance to real entities is purely coincidental.

This data exists solely to support:

1. Local development and integration testing
2. The seeded demo account (`demo@invoiceiq.example`)
3. Exercising the document extraction pipeline with realistic but fake inputs

## Generation

The fixtures were hand-authored as JSON metadata. PDF rendering and degraded-scan
generation are handled by scripts in `/fixtures/scripts/`.

## License

This synthetic data is part of the InvoiceIQ project and shares its license.
