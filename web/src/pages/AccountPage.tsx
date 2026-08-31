import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { exportMyData, deleteAccount } from '../lib/api';

export function AccountPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const email = user?.email ?? '';
  const confirmMatches = confirmText.trim().toLowerCase() === email.toLowerCase();

  const handleExport = async () => {
    setExporting(true);
    setError('');
    setNotice('');
    try {
      const data = await exportMyData();
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `invoiceiq-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setNotice('Export downloaded.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export data');
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!confirmMatches) return;

    setDeleting(true);
    setError('');
    try {
      await deleteAccount();
      // Cognito user is gone, so sign-out is best-effort — logout() swallows it.
      await logout();
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete account');
      setDeleting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Account</h1>

      {error && (
        <div className="rounded-md bg-red-50 p-4" role="alert" aria-live="polite">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}
      {notice && (
        <div className="rounded-md bg-green-50 p-4" role="status" aria-live="polite">
          <p className="text-sm text-green-800">{notice}</p>
        </div>
      )}

      {/* Signed in as */}
      <section className="rounded-lg bg-white p-6 shadow">
        <h2 className="text-base font-semibold text-gray-900">Signed in as</h2>
        <p className="mt-1 text-sm text-gray-700">{email || 'Unknown'}</p>
      </section>

      {/* Export */}
      <section className="rounded-lg bg-white p-6 shadow">
        <h2 className="text-base font-semibold text-gray-900">Export your data</h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">
          Download every invoice record on your account as a JSON file. This prototype
          makes no backup guarantees, so keep your own copy of anything that matters.
        </p>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="mt-4 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {exporting ? 'Exporting…' : 'Download my data (JSON)'}
        </button>
      </section>

      {/* Danger zone */}
      <section className="rounded-lg border-2 border-red-200 bg-red-50 p-6">
        <h2 className="text-base font-semibold text-red-900">Delete your account</h2>
        <p className="mt-2 text-sm leading-relaxed text-red-900">
          This permanently removes:
        </p>
        <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-red-900">
          <li>Every invoice record on your account</li>
          <li>Every document you have uploaded</li>
          <li>Your sign-in credentials</li>
        </ul>
        <p className="mt-3 text-sm font-semibold text-red-900">
          This cannot be undone. Export your data first if you want to keep it.
        </p>

        <div className="mt-5">
          <label
            htmlFor="confirm-delete"
            className="block text-sm font-medium text-red-900"
          >
            Type <span className="font-mono font-semibold">{email}</span> to confirm
          </label>
          <input
            id="confirm-delete"
            type="text"
            autoComplete="off"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            className="mt-1 block w-full max-w-md rounded-md border border-red-300 px-3 py-2 text-gray-900 placeholder-gray-400 shadow-sm focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500 sm:text-sm"
            placeholder={email}
          />
        </div>

        <button
          onClick={handleDeleteAccount}
          disabled={!confirmMatches || deleting}
          className="mt-4 rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {deleting ? 'Deleting account…' : 'Permanently delete my account'}
        </button>
      </section>
    </div>
  );
}
