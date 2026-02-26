import browser from 'webextension-polyfill';
import { getStoredAuth, storeAuth, clearAuth } from '../common/auth';
import { login, lookup, triggerScan, checkRescanEligibility, getStreamToken, getWebLoginUrl, getOAuthProviders, exchangeOAuthToken } from '../common/api-client';
import { setBadgeScore, setBadgeLoading, clearBadge, setBadgeFailed, clearAllAnimations } from '../common/badge';
import { getSettings, saveSettings } from '../common/settings';
import { CONFIG } from '../common/config';
import { isLocalDomain } from '../common/domain-utils';
import type { BackgroundMessage, CacheEntry, ExtensionSettings, LookupResponse, TrustBarData, OAuthProvider } from '../common/types';

// In-memory lookup cache
const lookupCache = new Map<string, CacheEntry>();

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

const MAX_CACHE_SIZE = 100;

function cacheLookup(domain: string, data: LookupResponse): void {
  if (lookupCache.size >= MAX_CACHE_SIZE && !lookupCache.has(domain)) {
    // Delete the oldest entry (first key from Map iterator)
    const firstKey = lookupCache.keys().next().value;
    if (firstKey !== undefined) lookupCache.delete(firstKey);
  }
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
    applyBadge(tabId, cached, domain);
    return cached;
  }

  // Show loading indicator
  await setBadgeLoading(tabId);

  try {
    const data = await lookup(domain);
    cacheLookup(domain, data);
    applyBadge(tabId, data, domain);
    return data;
  } catch (err) {
    console.error('Lookup failed for', domain, err);
    await clearBadge(tabId);
    return null;
  }
}

async function applyBadge(tabId: number, data: LookupResponse, domain?: string): Promise<void> {
  if (data.runningScan) {
    await setBadgeLoading(tabId);
    // Start background polling for discovered running scans
    if (domain) startBackgroundPolling(domain);
  } else if (data.scan?.trustScore != null && data.scan.riskLevel) {
    const settings = await getSettings();
    await setBadgeScore(tabId, data.scan.trustScore, data.scan.riskLevel, settings.iconDisplayMode);
  } else if (data.failedScan) {
    await setBadgeFailed(tabId);
  } else {
    await clearBadge(tabId);
  }
}

// Track tabs already being processed for OAuth to prevent double-handling
const oauthProcessingTabs = new Set<number>();

function isExtOAuthCompleteUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.pathname === '/auth/ext-oauth-complete';
  } catch {
    return false;
  }
}

// Listen for tab URL changes
browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Detect ext-oauth-complete on both full page load (status=complete) and SPA navigation (url change)
  const currentUrl = changeInfo.url || tab.url || '';
  if (
    (changeInfo.url || changeInfo.status === 'complete') &&
    isExtOAuthCompleteUrl(currentUrl)
  ) {
    console.log(`[SiteRay] Detected ext-oauth-complete URL: ${currentUrl} (tab ${tabId}, changeInfo: ${JSON.stringify(changeInfo)})`);
    if (oauthProcessingTabs.has(tabId)) return;
    oauthProcessingTabs.add(tabId);
    try {
      await handleOAuthComplete(tabId, currentUrl);
    } finally {
      oauthProcessingTabs.delete(tabId);
    }
    return;
  }

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
        if (typeof msg.email !== 'string' || typeof msg.password !== 'string') {
          return Promise.resolve({ success: false, error: 'Invalid message' });
        }
        return handleLogin(msg.email, msg.password);
      case 'LOGOUT':
        return handleLogout();
      case 'GET_AUTH':
        return getStoredAuth();
      case 'GET_LOOKUP':
        if (typeof msg.domain !== 'string') {
          return Promise.resolve({ success: false, error: 'Invalid message' });
        }
        return handleLookup(msg.domain);
      case 'TRIGGER_SCAN':
      case 'TRIGGER_RESCAN':
        if (typeof msg.domain !== 'string') {
          return Promise.resolve({ success: false, error: 'Invalid message' });
        }
        return handleTriggerScan(msg.domain);
      case 'CHECK_RESCAN':
        if (typeof msg.scanId !== 'string') {
          return Promise.resolve({ success: false, error: 'Invalid message' });
        }
        return handleCheckRescan(msg.scanId);
      case 'GET_STREAM_TOKEN':
        if (typeof msg.scanId !== 'string') {
          return Promise.resolve({ success: false, error: 'Invalid message' });
        }
        return handleGetStreamToken(msg.scanId);
      case 'INVALIDATE_CACHE':
        if (typeof msg.domain === 'string') lookupCache.delete(msg.domain);
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
      case 'GET_OAUTH_PROVIDERS':
        return handleGetOAuthProviders();
      case 'START_OAUTH':
        if (typeof (msg as { provider?: string }).provider !== 'string') {
          return Promise.resolve({ success: false, error: 'Invalid message' });
        }
        return handleStartOAuth((msg as { provider: OAuthProvider }).provider);
      default:
        return undefined;
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

      // Trigger lookup for the active tab and push trust bar
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (tab?.id && tab.url) {
        const domain = extractDomain(tab.url);
        if (domain) {
          const lookupData = await updateTabBadge(tab.id, domain);
          if (lookupData) {
            const settings = await getSettings();
            const barData = buildBarData(lookupData, settings);
            try {
              await browser.tabs.sendMessage(tab.id, { type: 'UPDATE_BAR', data: barData });
            } catch { /* content script not loaded */ }
          }
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
  clearAllAnimations();

  // Clear polling state and alarm
  await setPollingState({});
  await browser.alarms.clear(POLL_ALARM_NAME);

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
  if (isLocalDomain(domain)) return { success: false, error: 'Local domain' };
  try {
    // Check cache first
    const cached = getCachedLookup(domain);
    if (cached) return cached;

    const data = await lookup(domain);
    cacheLookup(domain, data);

    // Update badge and trust bar for active tab
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      applyBadge(tab.id, data, domain);
      const settings = await getSettings();
      const barData = buildBarData(data, settings);
      try {
        await browser.tabs.sendMessage(tab.id, { type: 'UPDATE_BAR', data: barData });
      } catch { /* content script not loaded */ }
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
    return { eligible: false, error: (err as Error).message };
  }
}

async function handleGetStreamToken(scanId: string) {
  try {
    return await getStreamToken(scanId);
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

// Alarm-based background polling for running scans (survives service worker suspension)
const POLLING_STORAGE_KEY = 'pollingDomains';
const MAX_POLL_ATTEMPTS = 10; // 10 minutes at 1-minute intervals
const POLL_ALARM_NAME = 'siteray-poll';
let pollInFlight = false;

interface PollingState {
  [domain: string]: { startTime: number; attempts: number };
}

async function getPollingState(): Promise<PollingState> {
  const result = await browser.storage.local.get(POLLING_STORAGE_KEY);
  return (result[POLLING_STORAGE_KEY] as PollingState) || {};
}

async function setPollingState(state: PollingState): Promise<void> {
  await browser.storage.local.set({ [POLLING_STORAGE_KEY]: state });
}

async function startBackgroundPolling(domain: string) {
  const state = await getPollingState();
  if (state[domain]) return; // Already polling

  console.log(`[SiteRay] Starting background poll for domain="${domain}"`);
  state[domain] = { startTime: Date.now(), attempts: 0 };
  await setPollingState(state);

  // Ensure alarm is running
  const existing = await browser.alarms.get(POLL_ALARM_NAME);
  if (!existing) {
    browser.alarms.create(POLL_ALARM_NAME, { periodInMinutes: 1 });
  }
}

async function handlePollAlarm() {
  if (pollInFlight) return;
  pollInFlight = true;

  try {
    const state = await getPollingState();
    const domains = Object.keys(state);
    if (domains.length === 0) {
      await browser.alarms.clear(POLL_ALARM_NAME);
      return;
    }

    for (const domain of domains) {
      state[domain].attempts++;

      if (state[domain].attempts > MAX_POLL_ATTEMPTS) {
        delete state[domain];
        const tabs = await browser.tabs.query({});
        for (const tab of tabs) {
          if (!tab.id || !tab.url) continue;
          if (extractDomain(tab.url) === domain) {
            await setBadgeFailed(tab.id);
          }
        }
        continue;
      }

      try {
        lookupCache.delete(domain);
        const data = await lookup(domain);
        cacheLookup(domain, data);

        if (data.scan && !data.runningScan) {
          // Scan complete
          console.log(`[SiteRay] Background poll: scan complete for "${domain}"`);
          delete state[domain];
          const settings = await getSettings();
          const tabs = await browser.tabs.query({});
          for (const tab of tabs) {
            if (!tab.id || !tab.url) continue;
            if (extractDomain(tab.url) === domain) {
              await applyBadge(tab.id, data);
              const barData = buildBarData(data, settings);
              try {
                await browser.tabs.sendMessage(tab.id, { type: 'UPDATE_BAR', data: barData });
              } catch { /* content script not loaded */ }
            }
          }
        } else if (!data.runningScan && !data.scan && data.failedScan) {
          // Scan failed
          console.log(`[SiteRay] Background poll: scan failed for "${domain}"`);
          delete state[domain];
          const tabs = await browser.tabs.query({});
          for (const tab of tabs) {
            if (!tab.id || !tab.url) continue;
            if (extractDomain(tab.url) === domain) {
              await applyBadge(tab.id, data);
            }
          }
        }
      } catch (err) {
        console.error(`[SiteRay] Background poll error for "${domain}":`, err);
      }
    }

    await setPollingState(state);

    // Clear alarm if no more domains to poll
    if (Object.keys(state).length === 0) {
      await browser.alarms.clear(POLL_ALARM_NAME);
    }
  } finally {
    pollInFlight = false;
  }
}

// Register alarm listener
browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === POLL_ALARM_NAME) {
    handlePollAlarm();
  }
});

async function handleTriggerScan(domain: string) {
  if (isLocalDomain(domain)) return { success: false, error: 'Local domain' };
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

async function handleOAuthComplete(tabId: number, url: string) {
  try {
    const parsed = new URL(url);
    const error = parsed.searchParams.get('error');

    if (error) {
      console.log(`[SiteRay] OAuth complete: error=${error}`);
      try { await browser.tabs.remove(tabId); } catch { /* tab may already be closed */ }
      return;
    }

    const token = parsed.searchParams.get('token');
    if (!token) {
      console.log('[SiteRay] OAuth complete: no token in URL');
      try { await browser.tabs.remove(tabId); } catch { /* tab may already be closed */ }
      return;
    }

    console.log(`[SiteRay] OAuth complete: exchanging handoff token (${token.slice(0, 8)}...)`);
    const response = await exchangeOAuthToken(token);
    console.log(`[SiteRay] OAuth complete: exchange response success=${response.success}, user=${response.user?.email}`);

    if (response.success) {
      await storeAuth({
        accessToken: response.tokens.accessToken,
        refreshToken: response.tokens.refreshToken,
        user: response.user,
      });
      console.log('[SiteRay] OAuth complete: auth stored, restoring badges');
      await restoreBadges();
    }

    // Close the tab after a short delay so the user sees the success page briefly
    setTimeout(async () => {
      try { await browser.tabs.remove(tabId); } catch { /* tab may already be closed */ }
    }, 1500);
  } catch (err) {
    console.error('[SiteRay] OAuth complete handler error:', err);
    try { await browser.tabs.remove(tabId); } catch { /* tab may already be closed */ }
  }
}

async function handleGetOAuthProviders() {
  try {
    const response = await getOAuthProviders();
    return { success: true, providers: response.providers || [] };
  } catch {
    return { success: true, providers: [] };
  }
}

async function handleStartOAuth(provider: OAuthProvider) {
  const url = `${CONFIG.API_BASE_URL}/api/auth/oauth/${provider}/start?source=extension`;
  await browser.tabs.create({ url, active: true });
  return { success: true };
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
  if (isLocalDomain(domain)) return null;
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

// Restore badges on background script startup (e.g., after service worker suspension)
async function restoreBadges() {
  const auth = await getStoredAuth();
  if (!auth) return;
  const tabs = await browser.tabs.query({});
  for (const tab of tabs) {
    if (!tab.id || !tab.url) continue;
    const domain = extractDomain(tab.url);
    if (domain) await updateTabBadge(tab.id, domain);
  }
}
restoreBadges();

// Resume any persisted polling alarms on startup
async function resumePolling() {
  const state = await getPollingState();
  if (Object.keys(state).length > 0) {
    const existing = await browser.alarms.get(POLL_ALARM_NAME);
    if (!existing) {
      browser.alarms.create(POLL_ALARM_NAME, { periodInMinutes: 1 });
    }
  }
}
resumePolling();
