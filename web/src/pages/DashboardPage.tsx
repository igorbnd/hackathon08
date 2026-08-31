import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  getInvoices,
  loadSampleData,
  type Invoice,
  type GetInvoicesParams,
} from '../lib/api';
import { SpendChart } from '../components/SpendChart';

// ─── Due date helpers ────────────────────────────────────────────────────────

type DueStatus =
  | { kind: 'overdue'; days: number }
  | { kind: 'due-soon'; days: number }
  | null;

/**
 * Classify an invoice by how close its due date is.
 * Only unpaid invoices are considered — a paid invoice cannot be overdue.
 */
function getDueStatus(invoice: Invoice): DueStatus {
  if (invoice.status !== 'unpaid' || !invoice.dueDate) return null;

  const due = new Date(`${invoice.dueDate}T00:00:00`);
  if (Number.isNaN(due.getTime())) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const diffDays = Math.round((due.getTime() - today.getTime()) / 86_400_000);

  if (diffDays < 0) return { kind: 'overdue', days: Math.abs(diffDays) };
  if (diffDays <= 7) return { kind: 'due-soon', days: diffDays };
  return null;
}

function DueBadge({ invoice }: { invoice: Invoice }) {
  const due = getDueStatus(invoice);
  if (!due) return null;

  if (due.kind === 'overdue') {
    return (
      <span className="mt-1 inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">
        {due.days === 0 ? 'Due today' : `Overdue by ${due.days}d`}
      </span>
    );
  }

  return (
    <span className="mt-1 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
      {due.days === 0 ? 'Due today' : `Due in ${due.days}d`}
    </span>
  );
}

// ─── Recommendation Badge Colors ─────────────────────────────────────────────

function getRecommendationBadgeClass(type: string): string {
  switch (type?.toUpperCase()) {
    case 'PAY':
      return 'bg-green-100 text-green-800';
    case 'PAY BUT VERIFY':
      return 'bg-yellow-100 text-yellow-800';
    case 'HOLD':
      return 'bg-orange-100 text-orange-800';
    case 'QUERY THE VENDOR':
      return 'bg-blue-100 text-blue-800';
    case 'DISPUTE':
      return 'bg-red-100 text-red-800';
    case 'LIKELY DUPLICATE':
      return 'bg-purple-100 text-purple-800';
    case 'CANCEL OR DOWNGRADE':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

function getStatusBadgeClass(status: string): string {
  switch (status?.toLowerCase()) {
    case 'paid':
      return 'bg-green-100 text-green-800';
    case 'unpaid':
      return 'bg-yellow-100 text-yellow-800';
    case 'disputed':
      return 'bg-red-100 text-red-800';
    case 'cancelled':
      return 'bg-gray-100 text-gray-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

export function DashboardPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [prevCursors, setPrevCursors] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filter state
  const [vendor, setVendor] = useState('');
  const [status, setStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [currentCursor, setCurrentCursor] = useState<string | undefined>();

  // Sample data state
  const [seeding, setSeeding] = useState(false);
  const [notice, setNotice] = useState('');

  const fetchInvoices = async (cursor?: string) => {
    setLoading(true);
    setError('');
    try {
      const params: GetInvoicesParams = { limit: 50, cursor };
      if (vendor) params.vendor = vendor;
      if (status) params.status = status;
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;

      const response = await getInvoices(params);
      setInvoices(response.invoices);
      setTotal(response.count);
      setNextCursor(response.nextCursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load invoices');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoices(currentCursor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentCursor, vendor, status, dateFrom, dateTo]);

  const handleNext = () => {
    if (nextCursor) {
      setPrevCursors((prev) => [...prev, currentCursor || '']);
      setCurrentCursor(nextCursor);
    }
  };

  const handlePrevious = () => {
    const prev = [...prevCursors];
    const lastCursor = prev.pop();
    setPrevCursors(prev);
    setCurrentCursor(lastCursor || undefined);
  };

  const handleFilter = () => {
    setCurrentCursor(undefined);
    setPrevCursors([]);
  };

  const handleLoadSampleData = async () => {
    setSeeding(true);
    setError('');
    setNotice('');
    try {
      const result = await loadSampleData();
      setNotice(result.message ?? 'Sample data loaded');
      setPrevCursors([]);
      setCurrentCursor(undefined);
      // Cursor is already undefined on a fresh account, so the effect will not
      // re-fire — refetch explicitly.
      await fetchInvoices(undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sample data');
    } finally {
      setSeeding(false);
    }
  };

  // Compute summary stats from available data
  const totalSpend = invoices.reduce((sum, inv) => sum + (inv.total ?? 0), 0);
  const unpaidCount = invoices.filter((inv) => inv.status === 'unpaid').length;
  const overdueCount = invoices.filter(
    (inv) => getDueStatus(inv)?.kind === 'overdue',
  ).length;
  const hasActiveFilters = Boolean(vendor || status || dateFrom || dateTo);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>

      {/* Success notice */}
      {notice && (
        <div className="rounded-md bg-green-50 p-4" role="status" aria-live="polite">
          <p className="text-sm text-green-800">{notice}</p>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg bg-white p-6 shadow">
          <p className="text-sm font-medium text-gray-600">Invoices</p>
          <p className="mt-1 text-3xl font-semibold text-gray-900">{invoices.length}</p>
        </div>
        <div className="rounded-lg bg-white p-6 shadow">
          <p className="text-sm font-medium text-gray-600">Unpaid</p>
          <p className="mt-1 text-3xl font-semibold text-orange-600">{unpaidCount}</p>
          {overdueCount > 0 && (
            <p className="mt-1 text-xs font-semibold text-red-600">
              {overdueCount} overdue
            </p>
          )}
        </div>
        <div className="rounded-lg bg-white p-6 shadow">
          <p className="text-sm font-medium text-gray-600">Total Spend</p>
          <p className="mt-1 text-3xl font-semibold text-gray-900">
            {totalSpend.toLocaleString('en-GB', { style: 'currency', currency: 'GBP' })}
          </p>
        </div>
        <div className="rounded-lg bg-white p-6 shadow">
          <p className="text-sm font-medium text-gray-600">Subscriptions</p>
          <p className="mt-1 text-3xl font-semibold text-indigo-600">
            <Link to="/subscriptions" className="hover:underline focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded">
              View
            </Link>
          </p>
        </div>
      </div>

      {/* Spend trend */}
      {!loading && invoices.length > 0 && <SpendChart invoices={invoices} />}

      {/* Filter Controls */}
      <div className="rounded-lg bg-white p-4 shadow">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label htmlFor="filter-vendor" className="block text-sm font-medium text-gray-700">
              Vendor
            </label>
            <input
              id="filter-vendor"
              type="text"
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
              placeholder="Filter by vendor"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label htmlFor="filter-status" className="block text-sm font-medium text-gray-700">
              Status
            </label>
            <select
              id="filter-status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">All</option>
              <option value="unpaid">Unpaid</option>
              <option value="paid">Paid</option>
              <option value="disputed">Disputed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div>
            <label htmlFor="filter-date-from" className="block text-sm font-medium text-gray-700">
              From
            </label>
            <input
              id="filter-date-from"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label htmlFor="filter-date-to" className="block text-sm font-medium text-gray-700">
              To
            </label>
            <input
              id="filter-date-to"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={handleFilter}
              className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
            >
              Apply Filters
            </button>
          </div>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="rounded-md bg-red-50 p-4" role="alert">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* Invoice Table */}
      <div className="overflow-hidden rounded-lg bg-white shadow">
        {loading ? (
          <div className="p-8 text-center text-gray-600">Loading invoices...</div>
        ) : invoices.length === 0 ? (
          hasActiveFilters ? (
            <div className="p-8 text-center text-gray-600">
              No invoices match these filters. Try clearing them.
            </div>
          ) : (
            <div className="p-10 text-center">
              <h3 className="text-lg font-semibold text-gray-900">
                Your account is empty
              </h3>
              <p className="mx-auto mt-2 max-w-md text-sm text-gray-600">
                Load a set of sample invoices to explore the app, or upload your own
                document. Sample data is entirely fictional and covers every detection
                the app performs — price rises, duplicates, overlapping subscriptions
                and more.
              </p>
              <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <button
                  onClick={handleLoadSampleData}
                  disabled={seeding}
                  className="w-full rounded-md bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                >
                  {seeding ? 'Loading sample data…' : 'Load sample data'}
                </button>
                <Link
                  to="/upload"
                  className="w-full rounded-md border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:w-auto"
                >
                  Upload a document
                </Link>
              </div>
              <p className="mt-4 text-xs text-gray-500">
                Please do not upload personal or commercially sensitive documents to
                this prototype.
              </p>
            </div>
          )
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">
                    Vendor
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">
                    Date
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">
                    Amount
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">
                    Status
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">
                    Recommendation
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {invoices.map((invoice) => (
                  <tr key={invoice.invoiceId} className="hover:bg-gray-50">
                    <td className="whitespace-nowrap px-6 py-4">
                      <Link
                        to={`/invoices/${invoice.invoiceId}`}
                        className="font-medium text-indigo-600 hover:text-indigo-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded"
                      >
                        {invoice.vendorName}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">
                      {new Date(invoice.issueDate).toLocaleDateString()}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                      {(invoice.total ?? 0).toLocaleString('en-GB', { style: 'currency', currency: invoice.currency || 'GBP' })}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <div className="flex flex-col items-start">
                        <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${getStatusBadgeClass(invoice.status)}`}>
                          {invoice.status}
                        </span>
                        <DueBadge invoice={invoice} />
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      {invoice.recommendation ? (
                        <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${getRecommendationBadgeClass(invoice.recommendation.type)}`}>
                          {invoice.recommendation.type}
                        </span>
                      ) : (
                        <Link to={`/invoices/${invoice.invoiceId}`} className="text-sm text-indigo-600 hover:text-indigo-800">
                          View →
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {!loading && invoices.length > 0 && (
          <div className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 sm:px-6">
            <p className="text-sm text-gray-700">
              Showing <span className="font-medium">{invoices.length}</span> invoices
              {nextCursor && <span> (more available)</span>}
            </p>
            <div className="flex space-x-2">
              <button
                onClick={handlePrevious}
                disabled={prevCursors.length === 0}
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                onClick={handleNext}
                disabled={!nextCursor}
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
