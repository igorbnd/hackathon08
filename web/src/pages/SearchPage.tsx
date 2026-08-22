import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { search, type Invoice, type SearchResponse } from '../lib/api';

export function SearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Invoice[]>([]);
  const [interpretation, setInterpretation] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasSearched, setHasSearched] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError('');
    setHasSearched(true);

    try {
      const response: SearchResponse = await search(query.trim());
      setResults(response.results);
      setInterpretation(response.interpretation);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed. Please try again.');
      setResults([]);
      setInterpretation('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Search Invoices</h1>
      <p className="text-gray-700">
        Use natural language to search your invoices. Try queries like
        &quot;invoices from AWS over 500 last month&quot; or &quot;unpaid bills due this week&quot;.
      </p>

      {/* Search Form */}
      <form onSubmit={handleSubmit} className="flex gap-3">
        <div className="flex-1">
          <label htmlFor="search-query" className="sr-only">Search query</label>
          <input
            id="search-query"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask a question about your invoices..."
            className="block w-full rounded-md border border-gray-300 px-4 py-3 text-gray-900 placeholder-gray-500 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="rounded-md bg-indigo-600 px-6 py-3 text-sm font-semibold text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Searching...' : 'Search'}
        </button>
      </form>

      {/* Error */}
      {error && (
        <div className="rounded-md bg-red-50 p-4" role="alert">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* Interpretation */}
      {interpretation && (
        <div className="rounded-md bg-blue-50 p-4">
          <p className="text-sm text-blue-800">
            <span className="font-medium">AI interpretation:</span> {interpretation}
          </p>
        </div>
      )}

      {/* Results */}
      {hasSearched && !loading && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            {results.length === 0
              ? 'No invoices matched your query.'
              : `Found ${results.length} matching invoice${results.length !== 1 ? 's' : ''}.`}
          </p>

          {results.map((invoice) => (
            <div key={invoice.invoiceId} className="rounded-lg bg-white p-4 shadow hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div>
                  <Link
                    to={`/invoices/${invoice.invoiceId}`}
                    className="text-lg font-medium text-indigo-600 hover:text-indigo-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded"
                  >
                    {invoice.vendorName}
                  </Link>
                  <p className="mt-1 text-sm text-gray-600">
                    {invoice.referenceNumber} &middot; {new Date(invoice.issueDate).toLocaleDateString()}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold text-gray-900">
                    {invoice.total.toLocaleString('en-GB', { style: 'currency', currency: invoice.currency || 'GBP' })}
                  </p>
                  <span className={`mt-1 inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                    invoice.status === 'paid' ? 'bg-green-100 text-green-800' :
                    invoice.status === 'unpaid' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {invoice.status}
                  </span>
                </div>
              </div>
              {invoice.recommendation && (
                <div className="mt-2 text-sm text-gray-700">
                  <span className="font-medium">Recommendation:</span> {invoice.recommendation.type}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
