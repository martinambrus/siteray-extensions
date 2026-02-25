import { CONFIG } from './config';
import { getStoredAuth, updateTokens, clearAuth } from './auth';
import type {
  LoginResponse,
  RefreshResponse,
  LookupResponse,
  ScanTriggerResponse,
  RescanEligibility,
  StreamTokenResponse,
} from './types';

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let refreshPromise: Promise<boolean> | null = null;

async function refreshTokens(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = doRefresh().finally(() => { refreshPromise = null; });
  return refreshPromise;
}

async function doRefresh(): Promise<boolean> {
  const auth = await getStoredAuth();
  if (!auth?.refreshToken) return false;

  try {
    const res = await fetch(`${CONFIG.API_BASE_URL}/api/ext/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: auth.refreshToken }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      await clearAuth();
      return false;
    }

    const data: RefreshResponse = await res.json();
    if (data.success) {
      await updateTokens(data.tokens.accessToken, data.tokens.refreshToken);
      return true;
    }

    await clearAuth();
    return false;
  } catch {
    await clearAuth();
    return false;
  }
}

async function authedFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const auth = await getStoredAuth();
  if (!auth?.accessToken) {
    throw new ApiError(401, 'Not authenticated');
  }

  const fullUrl = `${CONFIG.API_BASE_URL}${path}`;
  const method = options.method || 'GET';
  console.log(`[SiteRay] ${method} ${fullUrl}`, options.body ? `body: ${options.body}` : '');

  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${auth.accessToken}`);
  if (options.body) headers.set('Content-Type', 'application/json');

  let res = await fetch(fullUrl, { ...options, headers, signal: AbortSignal.timeout(15000) });
  console.log(`[SiteRay] ${method} ${fullUrl} -> ${res.status} ${res.statusText}`);

  // On 401, attempt token refresh and retry once
  if (res.status === 401) {
    console.log('[SiteRay] Got 401, attempting token refresh...');
    const refreshed = await refreshTokens();
    if (refreshed) {
      console.log('[SiteRay] Token refresh succeeded, retrying request');
      const newAuth = await getStoredAuth();
      if (newAuth) {
        headers.set('Authorization', `Bearer ${newAuth.accessToken}`);
        res = await fetch(fullUrl, { ...options, headers, signal: AbortSignal.timeout(15000) });
        console.log(`[SiteRay] Retry ${method} ${fullUrl} -> ${res.status} ${res.statusText}`);
      }
    } else {
      console.log('[SiteRay] Token refresh failed');
    }

    if (res.status === 401) {
      await clearAuth();
      throw new ApiError(401, 'Session expired');
    }
  }

  return res;
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const res = await fetch(`${CONFIG.API_BASE_URL}/api/ext/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const text = await res.text();
    let message = 'Login failed';
    try {
      const json = JSON.parse(text);
      message = json.error || json.message || message;
    } catch {
      // use default message
    }
    throw new ApiError(res.status, message);
  }

  return res.json();
}

export async function lookup(domain: string): Promise<LookupResponse> {
  console.log(`[SiteRay] lookup: domain="${domain}"`);
  const res = await authedFetch(`/api/ext/lookup?domain=${encodeURIComponent(domain)}`);
  if (!res.ok) {
    const text = await res.text();
    console.error(`[SiteRay] lookup failed: status=${res.status}, body=${text}`);
    throw new ApiError(res.status, 'Lookup failed');
  }
  const data = await res.json();
  console.log(`[SiteRay] lookup result:`, JSON.stringify(data));
  return data;
}

export async function triggerScan(domain: string): Promise<ScanTriggerResponse> {
  const url = domain.includes('://') ? domain : `https://${domain}`;
  console.log(`[SiteRay] triggerScan called with domain="${domain}", resolved url="${url}"`);
  const res = await authedFetch('/api/scans', {
    method: 'POST',
    body: JSON.stringify({ url }),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`[SiteRay] triggerScan failed: status=${res.status}, body=${text}`);
    let errorMsg = 'Scan trigger failed';
    try {
      const data = JSON.parse(text);
      errorMsg = data.error || data.message || errorMsg;
    } catch {
      // not JSON
    }
    throw new ApiError(res.status, errorMsg);
  }
  const data = await res.json();
  console.log('[SiteRay] triggerScan success:', JSON.stringify(data));
  return data;
}

export async function checkRescanEligibility(scanId: string): Promise<RescanEligibility> {
  console.log(`[SiteRay] checkRescanEligibility: scanId="${scanId}"`);
  const res = await authedFetch(`/api/scans/${encodeURIComponent(scanId)}/rescan-eligibility`);
  if (!res.ok) {
    const text = await res.text();
    console.error(`[SiteRay] checkRescanEligibility failed: status=${res.status}, body=${text}`);
    throw new ApiError(res.status, 'Rescan check failed');
  }
  const data = await res.json();
  console.log(`[SiteRay] checkRescanEligibility result:`, JSON.stringify(data));
  return data;
}

export async function getStreamToken(scanId: string): Promise<StreamTokenResponse> {
  const res = await authedFetch(`/api/scans/${encodeURIComponent(scanId)}/stream-token`);
  if (!res.ok) throw new ApiError(res.status, 'Stream token failed');
  return res.json();
}

export async function getWebLoginUrl(): Promise<{ success: boolean; url: string }> {
  const res = await authedFetch('/api/ext/web-login-token');
  if (!res.ok) throw new ApiError(res.status, 'Failed to get login token');
  return res.json();
}
