import { useState, useEffect } from 'react';
import { getSubscriptions, type SubscriptionsResponse } from '../lib/api';

function TrendIndicator({ trend }: { trend: 'up' | 'down' | 'stable' }) {
  if (trend === 'up') {
    return <span className="text-red-600 font-medium" aria-label="Trending up">&#9650; Up</span>;
  }
  if (trend === 'down') {
    return <span className="text-green-600 font-medium" aria-label="Trending down">&#9660; Down</span>;
  }
  return <span className="text-gray-600" aria-label="Stable">&#8212; Stable</span>;
}

export function SubscriptionsPage() {
  const [data, setData] = useState<SubscriptionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getSubscriptions()
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load subscriptions'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="p-8 text-center text-gray-600">Analysing subscriptions...</div>;
  }

  if (error) {
    return (
      <div className="p-8 text-center">
        <p className="text-red-800">{error}</p>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Subscriptions &amp; Recurring Charges</h1>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-lg bg-white p-6 shadow">
          <p className="text-sm font-medium text-gray-600">Total Annualised Spend</p>
          <p className="mt-1 text-3xl font-semibold text-gray-900">
            {(data.totalAnnualised ?? 0).toLocaleString('en-GB', { style: 'currency', currency: 'GBP' })}
          </p>
        </div>
        <div className="rounded-lg bg-white p-6 shadow">
          <p className="text-sm font-medium text-gray-600">Estimated Waste</p>
          <p className="mt-1 text-3xl font-semibold text-red-600">
            {(data.wasteEstimate ?? 0).toLocaleString('en-GB', { style: 'currency', currency: 'GBP' })}
          </p>
          <p className="mt-1 text-xs text-gray-500">Potential savings from overlaps and unused services</p>
        </div>
      </div>

      {/* Subscriptions Table */}
      <div className="rounded-lg bg-white shadow">
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-medium text-gray-900">Detected Recurring Charges</h2>
        </div>
        {data.subscriptions.length === 0 ? (
          <div className="p-6 text-center text-gray-600">No recurring charges detected yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">Vendor</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">Pattern</th>
                  <th scope="col" className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-700">Amount</th>
                  <th scope="col" className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-700">Annualised</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">Trend</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {data.subscriptions.map((sub, index) => (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">{sub.vendorName}</td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700 capitalize">{sub.cadence}</td>
                    <td className="whitespace-nowrap px-6 py-4 text-right text-sm text-gray-900">
                      {(sub.amount ?? 0).toLocaleString('en-GB', { style: 'currency', currency: 'GBP' })}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium text-gray-900">
                      {(sub.annualisedCost ?? 0).toLocaleString('en-GB', { style: 'currency', currency: 'GBP' })}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm">
                      <TrendIndicator trend={sub.trend} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Overlap Warnings */}
      {data.overlaps.length > 0 && (
        <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-6 shadow">
          <h2 className="text-lg font-medium text-yellow-900">Overlap Warnings</h2>
          <p className="mt-1 text-sm text-yellow-800">
            The following services appear to have overlapping functionality:
          </p>
          <div className="mt-4 space-y-3">
            {data.overlaps.map((overlap, index) => (
              <div key={index} className="rounded-md bg-yellow-100 p-4">
                <p className="text-sm font-medium text-yellow-900">
                  {overlap.vendors.join(' + ')} ({overlap.category})
                </p>
                <p className="mt-1 text-sm text-yellow-800">{overlap.suggestion}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Waste Detection */}
      {data.wasteEstimate > 0 && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-6 shadow">
          <h2 className="text-lg font-medium text-red-900">Waste Detection</h2>
          <p className="mt-1 text-sm text-red-800">
            Based on usage patterns and service overlaps, we estimate you could save approximately{' '}
            <span className="font-bold">
              {(data.wasteEstimate ?? 0).toLocaleString('en-GB', { style: 'currency', currency: 'GBP' })}
            </span>{' '}
            per year by consolidating or cancelling redundant services.
          </p>
        </div>
      )}
    </div>
  );
}
