import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { getInvoice, deleteInvoice, updateInvoiceStatus, type InvoiceDetailResponse, type Delta } from '../lib/api';

function getRecommendationColor(type: string): { bg: string; text: string; border: string } {
  switch (type?.toUpperCase()) {
    case 'PAY':
      return { bg: 'bg-green-50', text: 'text-green-800', border: 'border-green-200' };
    case 'PAY BUT VERIFY':
      return { bg: 'bg-yellow-50', text: 'text-yellow-800', border: 'border-yellow-200' };
    case 'HOLD':
      return { bg: 'bg-orange-50', text: 'text-orange-800', border: 'border-orange-200' };
    case 'QUERY THE VENDOR':
      return { bg: 'bg-blue-50', text: 'text-blue-800', border: 'border-blue-200' };
    case 'DISPUTE':
      return { bg: 'bg-red-50', text: 'text-red-800', border: 'border-red-200' };
    case 'LIKELY DUPLICATE':
      return { bg: 'bg-purple-50', text: 'text-purple-800', border: 'border-purple-200' };
    case 'CANCEL OR DOWNGRADE':
      return { bg: 'bg-red-50', text: 'text-red-800', border: 'border-red-200' };
    default:
      return { bg: 'bg-gray-50', text: 'text-gray-800', border: 'border-gray-200' };
  }
}

function DeltaValue({ delta }: { delta: Delta }) {
  const isIncrease = typeof delta.changePercent === 'number' && delta.changePercent > 0;
  const isDecrease = typeof delta.changePercent === 'number' && delta.changePercent < 0;

  return (
    <span className={`font-medium ${isIncrease ? 'text-red-600' : isDecrease ? 'text-green-600' : 'text-gray-700'}`}>
      {typeof delta.current === 'number'
        ? delta.current.toLocaleString('en-GB', { style: 'currency', currency: 'GBP' })
        : delta.current}
      {delta.changePercent !== undefined && (
        <span className="ml-1 text-xs">
          ({isIncrease ? '+' : ''}{delta.changePercent.toFixed(1)}%)
        </span>
      )}
    </span>
  );
}

export function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<InvoiceDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getInvoice(id)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load invoice'))
      .finally(() => setLoading(false));
  }, [id]);

  const handleDelete = async () => {
    if (!id || !confirm('Are you sure you want to delete this invoice?')) return;
    try {
      await deleteInvoice(id);
      navigate('/dashboard');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete invoice');
    }
  };

  const handleMarkAsPaid = async () => {
    if (!id) return;
    try {
      await updateInvoiceStatus(id, 'paid');
      // Refresh the invoice data
      const updated = await getInvoice(id);
      setData(updated);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update status');
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-gray-600">Loading invoice...</div>;
  }

  if (error || !data) {
    return (
      <div className="p-8 text-center">
        <p className="text-red-800">{error || 'Invoice not found'}</p>
        <Link to="/dashboard" className="mt-4 inline-block text-indigo-600 hover:underline focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded">
          Back to Dashboard
        </Link>
      </div>
    );
  }

  const { invoice, recommendation, history, deltas } = data;
  const recColor = recommendation ? getRecommendationColor(recommendation.type) : null;

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        to="/dashboard"
        className="inline-flex items-center text-sm text-indigo-600 hover:text-indigo-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded"
      >
        &larr; Back to Dashboard
      </Link>

      {/* Invoice Header */}
      <div className="rounded-lg bg-white p-6 shadow">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{invoice.vendorName}</h1>
            <p className="mt-1 text-sm text-gray-600">Reference: {invoice.referenceNumber}</p>
          </div>
          <div className="mt-4 sm:mt-0 sm:text-right">
            <p className="text-3xl font-bold text-gray-900">
              {invoice.total.toLocaleString('en-GB', { style: 'currency', currency: invoice.currency || 'GBP' })}
            </p>
            <span className={`mt-1 inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
              invoice.status === 'paid' ? 'bg-green-100 text-green-800' :
              invoice.status === 'unpaid' ? 'bg-yellow-100 text-yellow-800' :
              invoice.status === 'disputed' ? 'bg-red-100 text-red-800' :
              'bg-gray-100 text-gray-800'
            }`}>
              {invoice.status}
            </span>
            <div className="mt-3 flex gap-2">
              {invoice.status !== 'paid' && (
                <button
                  onClick={handleMarkAsPaid}
                  className="rounded bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700"
                >
                  Mark as Paid
                </button>
              )}
              <button
                onClick={handleDelete}
                className="rounded bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs font-medium uppercase text-gray-500">Issue Date</p>
            <p className="text-sm text-gray-900">{new Date(invoice.issueDate).toLocaleDateString()}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase text-gray-500">Due Date</p>
            <p className="text-sm text-gray-900">{new Date(invoice.dueDate).toLocaleDateString()}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase text-gray-500">Category</p>
            <p className="text-sm text-gray-900">{invoice.category}</p>
          </div>
        </div>
      </div>

      {/* Line Items Table */}
      <div className="rounded-lg bg-white shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-medium text-gray-900">Line Items</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">Description</th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-700">Qty</th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-700">Unit Price</th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-700">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {invoice.lineItems.map((item, index) => (
                <tr key={index}>
                  <td className="px-6 py-4 text-sm text-gray-900">{item.description}</td>
                  <td className="px-6 py-4 text-right text-sm text-gray-700">{item.quantity}</td>
                  <td className="px-6 py-4 text-right text-sm text-gray-700">
                    {item.unitPrice.toLocaleString('en-GB', { style: 'currency', currency: invoice.currency || 'GBP' })}
                  </td>
                  <td className="px-6 py-4 text-right text-sm font-medium text-gray-900">
                    {item.amount.toLocaleString('en-GB', { style: 'currency', currency: invoice.currency || 'GBP' })}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50">
              <tr>
                <td colSpan={3} className="px-6 py-3 text-right text-sm font-medium text-gray-700">Subtotal</td>
                <td className="px-6 py-3 text-right text-sm font-medium text-gray-900">
                  {invoice.subtotal.toLocaleString('en-GB', { style: 'currency', currency: invoice.currency || 'GBP' })}
                </td>
              </tr>
              <tr>
                <td colSpan={3} className="px-6 py-3 text-right text-sm font-medium text-gray-700">VAT</td>
                <td className="px-6 py-3 text-right text-sm font-medium text-gray-900">
                  {invoice.vatAmount.toLocaleString('en-GB', { style: 'currency', currency: invoice.currency || 'GBP' })}
                </td>
              </tr>
              <tr>
                <td colSpan={3} className="px-6 py-3 text-right text-sm font-bold text-gray-900">Total</td>
                <td className="px-6 py-3 text-right text-sm font-bold text-gray-900">
                  {invoice.total.toLocaleString('en-GB', { style: 'currency', currency: invoice.currency || 'GBP' })}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* AI Recommendation Card */}
      {recommendation && recColor && (
        <div className={`rounded-lg border ${recColor.border} ${recColor.bg} p-6 shadow`}>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium text-gray-900">AI Recommendation</h2>
            <span className={`inline-flex rounded-full px-3 py-1 text-sm font-bold ${recColor.text} ${recColor.bg} border ${recColor.border}`}>
              {recommendation.type}
            </span>
          </div>

          {/* Confidence Bar */}
          <div className="mt-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-700">Confidence</span>
              <span className="font-medium text-gray-900">{Math.round(recommendation.confidence * 100)}%</span>
            </div>
            <div className="mt-1 h-2 w-full rounded-full bg-gray-200" role="progressbar" aria-valuenow={Math.round(recommendation.confidence * 100)} aria-valuemin={0} aria-valuemax={100}>
              <div
                className="h-2 rounded-full bg-indigo-600"
                style={{ width: `${recommendation.confidence * 100}%` }}
              />
            </div>
          </div>

          {/* Reasoning */}
          <div className="mt-4">
            <h3 className="text-sm font-medium text-gray-900">Reasoning</h3>
            <p className="mt-1 text-sm text-gray-700">{recommendation.reasoning}</p>
          </div>

          {/* Evidence */}
          {recommendation.evidence.length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-medium text-gray-900">Evidence</h3>
              <ul className="mt-1 list-disc pl-5 space-y-1">
                {recommendation.evidence.map((item, index) => (
                  <li key={index} className="text-sm text-gray-700">{item}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Suggested Actions */}
          {recommendation.suggestedActions.length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-medium text-gray-900">Suggested Actions</h3>
              <ul className="mt-1 space-y-1">
                {recommendation.suggestedActions.map((action, index) => (
                  <li key={index} className="flex items-center text-sm text-gray-700">
                    <span className="mr-2 text-indigo-600" aria-hidden="true">&#10148;</span>
                    {action}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Historical Comparison */}
      {history.length > 0 && (
        <div className="rounded-lg bg-white p-6 shadow">
          <h2 className="text-lg font-medium text-gray-900">Historical Comparison</h2>
          <p className="mt-1 text-sm text-gray-600">Previous invoices from {invoice.vendorName}</p>

          {/* Deltas */}
          {deltas.length > 0 && (
            <div className="mt-4 space-y-2">
              <h3 className="text-sm font-medium text-gray-900">Changes from Previous Invoice</h3>
              {deltas.map((delta, index) => (
                <div key={index} className="flex items-center justify-between rounded-md bg-gray-50 px-4 py-2">
                  <span className="text-sm text-gray-700 capitalize">{delta.field}</span>
                  <DeltaValue delta={delta} />
                </div>
              ))}
            </div>
          )}

          {/* Historical Invoices */}
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-700">Date</th>
                  <th scope="col" className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-700">Reference</th>
                  <th scope="col" className="px-4 py-2 text-right text-xs font-medium uppercase text-gray-700">Total</th>
                  <th scope="col" className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-700">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {history.map((hist) => (
                  <tr key={hist.invoiceId}>
                    <td className="px-4 py-2 text-sm text-gray-700">{new Date(hist.issueDate).toLocaleDateString()}</td>
                    <td className="px-4 py-2 text-sm">
                      <Link
                        to={`/invoices/${hist.invoiceId}`}
                        className="text-indigo-600 hover:underline focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded"
                      >
                        {hist.referenceNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-right text-sm font-medium text-gray-900">
                      {hist.total.toLocaleString('en-GB', { style: 'currency', currency: hist.currency || 'GBP' })}
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-700">{hist.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
