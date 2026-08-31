import type { Invoice } from '../lib/api';

interface SpendChartProps {
  invoices: Invoice[];
  /** How many months to show, including the current one */
  months?: number;
}

interface MonthBucket {
  key: string;
  label: string;
  total: number;
}

/**
 * Build a contiguous run of month buckets ending with the current month, so
 * months with no invoices render as gaps rather than being silently skipped.
 */
function buildBuckets(invoices: Invoice[], monthCount: number): MonthBucket[] {
  const now = new Date();

  const buckets: MonthBucket[] = [];
  for (let i = monthCount - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    buckets.push({
      key: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }),
      total: 0,
    });
  }

  const byKey = new Map(buckets.map((b) => [b.key, b]));

  for (const invoice of invoices) {
    if (!invoice.issueDate) continue;
    // issueDate is an ISO date, so the first 7 chars are already YYYY-MM
    const bucket = byKey.get(invoice.issueDate.slice(0, 7));
    if (bucket) bucket.total += invoice.total ?? 0;
  }

  return buckets;
}

function formatGbp(value: number): string {
  return value.toLocaleString('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 0,
  });
}

/**
 * Spend-by-month bar chart.
 *
 * Deliberately hand-rolled from flex/divs rather than pulling in a charting
 * library — a dependency of that size is not justified by a handful of bars, and
 * this keeps the bundle small.
 */
export function SpendChart({ invoices, months = 6 }: SpendChartProps) {
  const buckets = buildBuckets(invoices, months);
  const peak = Math.max(...buckets.map((b) => b.total));

  // Nothing to plot — every month in range is empty
  if (peak <= 0) return null;

  const total = buckets.reduce((sum, b) => sum + b.total, 0);

  return (
    <div className="rounded-lg bg-white p-6 shadow">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-medium text-gray-900">Spend by month</h2>
        <p className="text-sm text-gray-600">
          {formatGbp(total)} over {months} months
        </p>
      </div>

      <div className="mt-6 flex h-40 items-end gap-2 sm:gap-3">
        {buckets.map((bucket) => {
          const heightPct = (bucket.total / peak) * 100;

          return (
            <div
              key={bucket.key}
              className="flex h-full flex-1 flex-col justify-end gap-1"
            >
              <div
                className="w-full rounded-t bg-indigo-500 transition-all"
                // Minimum 2% so a small non-zero month is still visible
                style={{ height: `${bucket.total > 0 ? Math.max(heightPct, 2) : 0}%` }}
                role="img"
                aria-label={`${bucket.label}: ${formatGbp(bucket.total)}`}
              />
            </div>
          );
        })}
      </div>

      {/* Axis labels kept outside the flex-grow area so bars align to a baseline */}
      <div className="mt-2 flex gap-2 sm:gap-3">
        {buckets.map((bucket) => (
          <div key={`${bucket.key}-label`} className="flex-1 text-center">
            <p className="text-xs font-medium text-gray-700">{bucket.label}</p>
            <p className="text-xs text-gray-500">
              {bucket.total > 0 ? formatGbp(bucket.total) : '—'}
            </p>
          </div>
        ))}
      </div>

      <p className="mt-4 text-xs text-gray-500">
        Based on invoice issue dates for the invoices currently loaded.
      </p>
    </div>
  );
}
