import { useState, useRef, type DragEvent } from 'react';
import { Link } from 'react-router-dom';
import { uploadInvoice, uploadToPresignedUrl, processInvoice, getInvoiceStatus } from '../lib/api';

type PipelineStatus = 'idle' | 'uploading' | 'queued' | 'extracting' | 'normalising' | 'analysing' | 'ready' | 'failed';

const ACCEPTED_TYPES = ['application/pdf', 'image/png', 'image/jpeg'];
const ACCEPTED_EXTENSIONS = '.pdf,.png,.jpg,.jpeg';

const statusSteps: PipelineStatus[] = ['queued', 'extracting', 'normalising', 'analysing', 'ready'];

function getStepIndex(status: PipelineStatus): number {
  return statusSteps.indexOf(status);
}

export function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [status, setStatus] = useState<PipelineStatus>('idle');
  const [error, setError] = useState('');
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && ACCEPTED_TYPES.includes(droppedFile.type)) {
      setFile(droppedFile);
      setError('');
      setStatus('idle');
    } else {
      setError('Please drop a PDF, PNG, or JPG file.');
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      setError('');
      setStatus('idle');
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const pollStatus = async (id: string) => {
    const maxAttempts = 60;
    let attempts = 0;
    while (attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      try {
        const statusResponse = await getInvoiceStatus(id);
        const pipelineStatus = statusResponse.status as PipelineStatus;
        setStatus(pipelineStatus);
        if (pipelineStatus === 'ready' || pipelineStatus === 'failed') {
          return;
        }
      } catch {
        // Continue polling on transient errors
      }
      attempts++;
    }
    setError('Processing is taking longer than expected. Check back later.');
  };

  const handleUpload = async () => {
    if (!file) return;
    setError('');
    setStatus('uploading');

    try {
      // Step 1: Get presigned URL
      const { uploadUrl, invoiceId: id } = await uploadInvoice(file);
      setInvoiceId(id);

      // Step 2: Upload file to S3
      await uploadToPresignedUrl(uploadUrl, file);
      setStatus('queued');

      // Step 3: Trigger processing
      await processInvoice(id);

      // Step 4: Poll for status
      await pollStatus(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed. Please try again.');
      setStatus('failed');
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Upload Invoice</h1>
      <p className="text-gray-700">
        Upload a PDF, PNG, or JPG invoice to have it automatically processed and analysed by AI.
      </p>

      {/* Drag and Drop Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
        aria-label="Drop zone for invoice files. Click or press Enter to select a file."
        className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
          dragOver
            ? 'border-indigo-500 bg-indigo-50'
            : 'border-gray-300 bg-white hover:border-indigo-400 hover:bg-gray-50'
        }`}
      >
        <svg className="mb-4 h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.338-2.32 3 3 0 013.813 3.81A3.75 3.75 0 0118 19.5H6.75z" />
        </svg>
        <p className="text-sm font-medium text-gray-700">
          Drag and drop your invoice here, or click to browse
        </p>
        <p className="mt-1 text-xs text-gray-500">PDF, PNG, or JPG up to 10MB</p>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_EXTENSIONS}
          onChange={handleFileSelect}
          className="hidden"
          aria-hidden="true"
        />
      </div>

      {/* File Preview */}
      {file && status === 'idle' && (
        <div className="rounded-lg bg-white p-4 shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900">{file.name}</p>
              <p className="text-sm text-gray-600">
                {formatFileSize(file.size)} &middot; {file.type}
              </p>
            </div>
            <button
              onClick={() => setFile(null)}
              className="text-sm text-red-600 hover:text-red-800 focus:outline-none focus:ring-2 focus:ring-red-500 rounded px-2 py-1"
              aria-label="Remove selected file"
            >
              Remove
            </button>
          </div>
        </div>
      )}

      {/* Upload Button */}
      {file && status === 'idle' && (
        <button
          onClick={handleUpload}
          className="w-full rounded-md bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
        >
          Upload and Process
        </button>
      )}

      {/* Status Indicator */}
      {status !== 'idle' && status !== 'failed' && (
        <div className="rounded-lg bg-white p-6 shadow">
          <h2 className="mb-4 text-lg font-medium text-gray-900">Processing Pipeline</h2>
          <div className="space-y-3">
            {statusSteps.map((step, index) => {
              const currentIndex = getStepIndex(status as PipelineStatus);
              const isComplete = index < currentIndex || status === 'ready';
              const isCurrent = index === currentIndex && status !== 'ready';

              return (
                <div key={step} className="flex items-center space-x-3">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
                      isComplete
                        ? 'bg-green-100 text-green-800'
                        : isCurrent
                        ? 'bg-indigo-100 text-indigo-800 animate-pulse'
                        : 'bg-gray-100 text-gray-500'
                    }`}
                    aria-hidden="true"
                  >
                    {isComplete ? '✓' : index + 1}
                  </div>
                  <span
                    className={`text-sm capitalize ${
                      isComplete
                        ? 'font-medium text-green-800'
                        : isCurrent
                        ? 'font-medium text-indigo-800'
                        : 'text-gray-500'
                    }`}
                  >
                    {step}
                  </span>
                  {isCurrent && (
                    <span className="text-xs text-gray-500">(in progress)</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Completion Link */}
      {status === 'ready' && invoiceId && (
        <div className="rounded-lg bg-green-50 p-4">
          <p className="font-medium text-green-800">Invoice processed successfully!</p>
          <Link
            to={`/invoices/${invoiceId}`}
            className="mt-2 inline-block rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
          >
            View Processed Invoice
          </Link>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="rounded-md bg-red-50 p-4" role="alert">
          <p className="text-sm text-red-800">{error}</p>
          {status === 'failed' && (
            <button
              onClick={() => { setStatus('idle'); setError(''); }}
              className="mt-2 text-sm font-medium text-red-600 hover:text-red-800 focus:outline-none focus:ring-2 focus:ring-red-500 rounded"
            >
              Try again
            </button>
          )}
        </div>
      )}
    </div>
  );
}
