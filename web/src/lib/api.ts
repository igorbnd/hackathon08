/**
 * Typed API client for InvoiceIQ backend.
 * Attaches Authorization Bearer token from localStorage to all requests.
 *
 * KNOWN LIMITATIONS (demo):
 * - Tokens are stored in localStorage, which is vulnerable to XSS.
 *   In production, use httpOnly cookies or a backend-for-frontend pattern.
 * - JWT is decoded but not cryptographically verified on the backend.
 *   In production, use aws-jwt-verify against Cognito JWKS.
 */

const API_BASE = '/api';

/** Flag to prevent concurrent refresh attempts */
let isRefreshing = false;
let refreshPromise: Promise<void> | null = null;

interface FetchOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  _isRetry?: boolean;
}

/**
 * Attempt to refresh the access token using the stored refresh token.
 * On success, stores new tokens. On failure, clears tokens and redirects to login.
 */
async function attemptTokenRefresh(): Promise<void> {
  const currentRefreshToken = localStorage.getItem('refreshToken');
  if (!currentRefreshToken) {
    clearTokensAndRedirect();
    throw new Error('No refresh token available');
  }

  try {
    const response = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: currentRefreshToken }),
    });

    if (!response.ok) {
      clearTokensAndRedirect();
      throw new Error('Token refresh failed');
    }

    const tokens = await response.json();
    localStorage.setItem('accessToken', tokens.accessToken);
    localStorage.setItem('idToken', tokens.idToken);
    if (tokens.refreshToken) {
      localStorage.setItem('refreshToken', tokens.refreshToken);
    }
  } catch {
    clearTokensAndRedirect();
    throw new Error('Token refresh failed');
  }
}

function clearTokensAndRedirect(): void {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('idToken');
  localStorage.removeItem('refreshToken');
  // Only redirect if not already on auth pages
  if (!window.location.pathname.startsWith('/login') && !window.location.pathname.startsWith('/signup')) {
    window.location.href = '/login';
  }
}

async function apiFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const token = localStorage.getItem('accessToken');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const { _isRetry, ...fetchOptions } = options;

  const response = await fetch(`${API_BASE}${path}`, {
    ...fetchOptions,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  // Handle 401 - attempt token refresh and retry (once)
  if (response.status === 401 && !_isRetry && !path.includes('/auth/')) {
    // Prevent concurrent refresh attempts
    if (!isRefreshing) {
      isRefreshing = true;
      refreshPromise = attemptTokenRefresh().finally(() => {
        isRefreshing = false;
        refreshPromise = null;
      });
    }

    try {
      await refreshPromise;
      // Retry the original request with the new token
      return apiFetch<T>(path, { ...options, _isRetry: true });
    } catch {
      // Refresh failed - error is already handled (redirect to login)
      throw new Error('Session expired. Please sign in again.');
    }
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message || `Request failed: ${response.status}`);
  }

  return response.json();
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export interface AuthTokens {
  accessToken: string;
  idToken: string;
  refreshToken: string;
}

export interface SignupParams {
  email: string;
  password: string;
}

export interface SigninParams {
  email: string;
  password: string;
}

export async function signup(params: SignupParams): Promise<{ message: string }> {
  return apiFetch('/auth/signup', { method: 'POST', body: params });
}

export async function signin(params: SigninParams): Promise<AuthTokens> {
  return apiFetch('/auth/signin', { method: 'POST', body: params });
}

export async function signout(): Promise<void> {
  const refreshToken = localStorage.getItem('refreshToken');
  await apiFetch('/auth/signout', { method: 'POST', body: { refreshToken } });
}

export async function refreshToken(): Promise<AuthTokens> {
  const currentRefreshToken = localStorage.getItem('refreshToken');
  return apiFetch('/auth/refresh', { method: 'POST', body: { refreshToken: currentRefreshToken } });
}

// ─── Invoices ────────────────────────────────────────────────────────────────

export interface GetInvoicesParams {
  cursor?: string;
  limit?: number;
  vendor?: string;
  status?: string;
  recommendation?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface InvoiceListResponse {
  invoices: Invoice[];
  nextCursor?: string;
  count: number;
}

export interface Invoice {
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
  metadata: Record<string, unknown>;
  recommendation?: Recommendation;
}

export interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  vatRate?: number;
  category?: string;
}

export interface Recommendation {
  type: string;
  confidence: number;
  evidence: string[];
  reasoning: string;
  suggestedActions: string[];
}

export interface InvoiceDetailResponse {
  invoice: Invoice;
  recommendation?: Recommendation;
  history: Invoice[];
  deltas: Delta[];
}

export interface Delta {
  field: string;
  previous: number | string;
  current: number | string;
  changePercent?: number;
}

export async function getInvoices(params: GetInvoicesParams = {}): Promise<InvoiceListResponse> {
  const query = new URLSearchParams();
  if (params.cursor) query.set('cursor', params.cursor);
  if (params.limit) query.set('limit', String(params.limit));
  if (params.vendor) query.set('vendor', params.vendor);
  if (params.status) query.set('status', params.status);
  if (params.recommendation) query.set('recommendation', params.recommendation);
  if (params.dateFrom) query.set('dateFrom', params.dateFrom);
  if (params.dateTo) query.set('dateTo', params.dateTo);

  const qs = query.toString();
  return apiFetch(`/invoices${qs ? `?${qs}` : ''}`);
}

export async function getInvoice(id: string): Promise<InvoiceDetailResponse> {
  return apiFetch(`/invoices/${id}`);
}

// ─── Upload ──────────────────────────────────────────────────────────────────

export interface UploadResponse {
  uploadUrl: string;
  invoiceId: string;
}

export async function uploadInvoice(file: File): Promise<UploadResponse> {
  return apiFetch('/invoices/upload', {
    method: 'POST',
    body: {
      fileName: file.name,
      contentType: file.type,
      size: file.size,
    },
  });
}

export async function uploadToPresignedUrl(url: string, file: File): Promise<void> {
  const response = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  });
  if (!response.ok) {
    throw new Error('Failed to upload file to storage');
  }
}

export async function processInvoice(id: string): Promise<{ message: string }> {
  return apiFetch(`/invoices/${id}/process`, { method: 'POST' });
}

export interface InvoiceStatusResponse {
  status: string;
  updatedAt: string;
}

export async function getInvoiceStatus(id: string): Promise<InvoiceStatusResponse> {
  return apiFetch(`/invoices/${id}/status`);
}

// ─── Search ──────────────────────────────────────────────────────────────────

export interface SearchResponse {
  results: Invoice[];
  interpretation: string;
  filters: Record<string, string>;
}

export async function search(query: string): Promise<SearchResponse> {
  return apiFetch('/query', { method: 'POST', body: { type: 'search', query } });
}

// ─── Subscriptions ───────────────────────────────────────────────────────────

export interface Subscription {
  vendorName: string;
  cadence: string;
  amount: number;
  annualisedCost: number;
  trend: 'up' | 'down' | 'stable';
  category: string;
}

export interface Overlap {
  vendors: string[];
  category: string;
  suggestion: string;
}

export interface SubscriptionsResponse {
  subscriptions: Subscription[];
  overlaps: Overlap[];
  totalAnnualised: number;
  wasteEstimate: number;
}

export async function getSubscriptions(): Promise<SubscriptionsResponse> {
  return apiFetch('/query', { method: 'POST', body: { type: 'subscriptions' } });
}
