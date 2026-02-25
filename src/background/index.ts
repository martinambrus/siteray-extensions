import browser from 'webextension-polyfill';
import { getStoredAuth, storeAuth, clearAuth } from '../common/auth';
import { login, lookup, triggerScan, checkRescanEligibility, getStreamToken, getWebLoginUrl } from '../common/api-client';
import { setBadgeScore, setBadgeLoading, clearBadge } from '../common/badge';
import { getSettings, saveSettings } from '../common/settings';
import { CONFIG } from '../common/config';
import type { BackgroundMessage, CacheEntry, ExtensionSettings, LookupResponse, TrustBarData } from '../common/types';

// In-memory lookup cache
const lookupCache = new Map<string, CacheEntry>();

const SKIP_DOMAINS = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '10.0.2.2',
  '[::1]',
]);

function isLocalDomain(hostname: string): boolean {
  if (SKIP_DOMAINS.has(hostname)) return true;
  // 192.168.x.x, 10.x.x.x, 172.16-31.x.x
  if (/^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(hostname)) return true;
  return false;
}

function extractDomain(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!parsed.protocol.startsWith('http')) return null;
    if (isLocalDomain(parsed.hostname)) return null;
    return parsed.hostname;
  } catch {
    return null;
  }
}

function getCachedLookup(domain: string): LookupResponse | null {
  const entry = lookupCache.get(domain);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CONFIG.CACHE_TTL_MS) {
    lookupCache.delete(domain);
    return null;
  }
  return entry.data;
}

function cacheLookup(domain: string, data: LookupResponse): void {
  lookupCache.set(domain, { data, timestamp: Date.now() });
}

async function updateTabBadge(tabId: number, domain: string): Promise<LookupResponse | null> {
  const auth = await getStoredAuth();
  if (!auth) {
    await clearBadge(tabId);
    return null;
  }

  // Check cache first
  const cached = getCachedLookup(domain);
  if (cached) {
    applyBadge(tabId, cached);
    return cached;
  }

  // Show loading indicator
  await setBadgeLoading(tabId);

  try {
    const data = await lookup(domain);
    cacheLookup(domain, data);
    applyBadge(tabId, data);
    return data;
  } catch (err) {
    console.error('Lookup failed for', domain, err);
    await clearBadge(tabId);
    return null;
  }
}

async function applyBadge(tabId: number, data: LookupResponse): Promise<void> {
  if (data.runningScan) {
    await setBadgeLoading(tabId);
  } else if (data.scan?.trustScore != null && data.scan.riskLevel) {
    const settings = await getSettings();
    await setBadgeScore(tabId, data.scan.trustScore, data.scan.riskLevel, settings.iconDisplayMode);
  } else {
    await clearBadge(tabId);
  }
}

// Listen for tab URL changes
browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete' || !tab.url) return;

  const domain = extractDomain(tab.url);
  if (!domain) {
    await clearBadge(tabId);
    return;
  }

  await updateTabBadge(tabId, domain);
});

// Listen for active tab changes
browser.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await browser.tabs.get(activeInfo.tabId);
    if (!tab.url) return;

    const domain = extractDomain(tab.url);
    if (!domain) {
      await clearBadge(activeInfo.tabId);
      return;
    }

    await updateTabBadge(activeInfo.tabId, domain);
  } catch {
    // Tab might have been closed
  }
});

// Handle messages from popup
browser.runtime.onMessage.addListener(
  (message: unknown, _sender: browser.Runtime.MessageSender): Promise<unknown> | undefined => {
    const msg = message as BackgroundMessage;
    switch (msg.type) {
      case 'LOGIN':
        return handleLogin(msg.email, msg.password);
      case 'LOGOUT':
        return handleLogout();
      case 'GET_AUTH':
        return getStoredAuth();
      case 'GET_LOOKUP':
        return handleLookup(msg.domain);
      case 'TRIGGER_SCAN':
        return handleTriggerScan(msg.domain);
      case 'TRIGGER_RESCAN':
        return handleTriggerScan(msg.domain);
      case 'CHECK_RESCAN':
        return handleCheckRescan(msg.scanId);
      case 'GET_STREAM_TOKEN':
        return getStreamToken(msg.scanId);
      case 'INVALIDATE_CACHE':
        lookupCache.delete(msg.domain);
        return Promise.resolve({ success: true });
      case 'GET_WEB_LOGIN_URL':
        return handleGetWebLoginUrl(msg.redirect);
      case 'GET_SETTINGS':
        return getSettings();
      case 'SET_SETTINGS':
        return handleSetSettings(msg.settings);
      case 'GET_BAR_DATA':
        return handleGetBarData(msg.domain);
      case 'BAR_SETTINGS_CHANGED':
        return handleBarSettingsChanged();
    }
  },
);

async function handleLogin(email: string, password: string) {
  try {
    const response = await login(email, password);
    if (response.success) {
      await storeAuth({
        accessToken: response.tokens.accessToken,
        refreshToken: response.tokens.refreshToken,
        user: response.user,
      });

      // Trigger lookup for the active tab
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (tab?.id && tab.url) {
        const domain = extractDomain(tab.url);
        if (domain) {
          await updateTabBadge(tab.id, domain);
        }
      }
    }
    return response;
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

async function handleLogout() {
  await clearAuth();
  lookupCache.clear();

  // Clear badge and bar on all tabs
  const tabs = await browser.tabs.query({});
  for (const tab of tabs) {
    if (tab.id) {
      await clearBadge(tab.id);
      try {
        await browser.tabs.sendMessage(tab.id, { type: 'UPDATE_BAR', data: null });
      } catch {
        // Content script not loaded in this tab
      }
    }
  }

  return { success: true };
}

async function handleLookup(domain: string) {
  try {
    // Check cache first
    const cached = getCachedLookup(domain);
    if (cached) return cached;

    const data = await lookup(domain);
    cacheLookup(domain, data);

    // Update badge for active tab
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      applyBadge(tab.id, data);
    }

    return data;
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

async function handleCheckRescan(scanId: string) {
  console.log(`[SiteRay] handleCheckRescan: scanId="${scanId}"`);
  try {
    const result = await checkRescanEligibility(scanId);
    console.log('[SiteRay] handleCheckRescan result:', JSON.stringify(result));
    return result;
  } catch (err) {
    console.error('[SiteRay] handleCheckRescan error:', err);
    return { eligible: true, nextAvailableAt: null };
  }
}

// Background polling for running scans so the icon updates even if the popup is closed
const scanPollers = new Map<string, ReturnType<typeof setInterval>>();

function startBackgroundPolling(domain: string) {
  // Don't start a second poller for the same domain
  if (scanPollers.has(domain)) return;

  console.log(`[SiteRay] Starting background poll for domain="${domain}"`);
  const interval = setInterval(async () => {
    try {
      lookupCache.delete(domain);
      const data = await lookup(domain);
      cacheLookup(domain, data);

      if (data.scan && !data.runningScan) {
        // Scan complete - update badge and bar on all matching tabs and stop polling
        console.log(`[SiteRay] Background poll: scan complete for "${domain}"`);
        clearInterval(interval);
        scanPollers.delete(domain);

        const settings = await getSettings();
        const tabs = await browser.tabs.query({});
        for (const tab of tabs) {
          if (!tab.id || !tab.url) continue;
          if (extractDomain(tab.url) === domain) {
            await applyBadge(tab.id, data);
            const barData = buildBarData(data, settings);
            try {
              await browser.tabs.sendMessage(tab.id, { type: 'UPDATE_BAR', data: barData });
            } catch {
              // Content script not loaded
            }
          }
        }
      }
    } catch (err) {
      console.error(`[SiteRay] Background poll error for "${domain}":`, err);
    }
  }, 5000);

  scanPollers.set(domain, interval);
}

async function handleTriggerScan(domain: string) {
  console.log(`[SiteRay] handleTriggerScan: domain="${domain}"`);
  try {
    const result = await triggerScan(domain);
    console.log('[SiteRay] handleTriggerScan result:', JSON.stringify(result));
    // Invalidate cache for this domain so next lookup fetches fresh data
    lookupCache.delete(domain);
    // Start background polling so the icon updates even if popup is closed
    startBackgroundPolling(domain);
    return result;
  } catch (err) {
    console.error('[SiteRay] handleTriggerScan error:', err);
    return { success: false, error: (err as Error).message };
  }
}

async function handleGetWebLoginUrl(redirect: string) {
  console.log(`[SiteRay] handleGetWebLoginUrl: redirect="${redirect}"`);
  try {
    const result = await getWebLoginUrl();
    if (result.success && result.url) {
      // Append redirect path to the token login URL
      const url = new URL(result.url);
      url.searchParams.set('redirect', redirect);
      const finalUrl = url.toString();
      console.log(`[SiteRay] handleGetWebLoginUrl: finalUrl="${finalUrl}"`);
      return { success: true, url: finalUrl };
    }
    console.log('[SiteRay] handleGetWebLoginUrl: no url in result', JSON.stringify(result));
    return result;
  } catch (err) {
    console.error('[SiteRay] handleGetWebLoginUrl error:', err);
    return { success: false, error: (err as Error).message };
  }
}

function buildBarData(data: LookupResponse, settings: ExtensionSettings): TrustBarData | null {
  if (!settings.trustBarEnabled) return null;
  if (!data.scan?.riskLevel) return null;
  return {
    enabled: true,
    riskLevel: data.scan.riskLevel,
    position: settings.trustBarPosition,
    size: settings.trustBarSize,
  };
}

async function handleGetBarData(domain: string): Promise<TrustBarData | null> {
  const auth = await getStoredAuth();
  if (!auth) return null;

  const settings = await getSettings();
  if (!settings.trustBarEnabled) return null;

  // Check cache first, otherwise fetch
  let data = getCachedLookup(domain);
  if (!data) {
    try {
      data = await lookup(domain);
      cacheLookup(domain, data);
    } catch {
      return null;
    }
  }

  return buildBarData(data, settings);
}

async function pushBarToAllTabs(): Promise<void> {
  const auth = await getStoredAuth();
  const settings = await getSettings();
  const tabs = await browser.tabs.query({});

  for (const tab of tabs) {
    if (!tab.id || !tab.url) continue;
    const domain = extractDomain(tab.url);
    if (!domain) continue;

    let barData: TrustBarData | null = null;
    if (auth && settings.trustBarEnabled) {
      const cached = getCachedLookup(domain);
      if (cached) {
        barData = buildBarData(cached, settings);
      }
    }

    try {
      await browser.tabs.sendMessage(tab.id, { type: 'UPDATE_BAR', data: barData });
    } catch {
      // Content script not loaded in this tab
    }
  }
}

async function handleBarSettingsChanged(): Promise<{ success: boolean }> {
  await pushBarToAllTabs();
  return { success: true };
}

async function handleSetSettings(settings: ExtensionSettings) {
  await saveSettings(settings);

  // Refresh badge on all tabs so the change takes effect immediately
  const auth = await getStoredAuth();
  if (!auth) return { success: true };

  const tabs = await browser.tabs.query({});
  for (const tab of tabs) {
    if (!tab.id || !tab.url) continue;
    const domain = extractDomain(tab.url);
    if (!domain) continue;
    const cached = getCachedLookup(domain);
    if (cached) {
      await applyBadge(tab.id, cached);
    }
  }

  // Also push bar updates to content scripts
  await pushBarToAllTabs();

  return { success: true };
}

// Open onboarding page on first install
browser.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    browser.tabs.create({ url: browser.runtime.getURL('onboarding.html') });
  }
});
