import { useState, useEffect } from 'preact/hooks';
import browser from 'webextension-polyfill';
import type { StoredAuth, LookupResponse, RunningScan, ExtensionSettings, IconDisplayMode, TrustBarPosition } from '../../common/types';
import { CONFIG } from '../../common/config';
import { LoginView } from './LoginView';
import { ScoreView } from './ScoreView';
import { NotScannedView } from './NotScannedView';
import { ProgressView } from './ProgressView';
import { SettingsView } from './SettingsView';
import { Header } from './Header';

type View = 'loading' | 'login' | 'score' | 'not-scanned' | 'progress';

export function App() {
  const [view, setView] = useState<View>('loading');
  const [auth, setAuth] = useState<StoredAuth | null>(null);
  const [lookupData, setLookupData] = useState<LookupResponse | null>(null);
  const [domain, setDomain] = useState<string>('');
  const [runningScan, setRunningScan] = useState<RunningScan | null>(null);
  const [error, setError] = useState<string>('');
  const [showSettings, setShowSettings] = useState(false);
  const [iconDisplayMode, setIconDisplayMode] = useState<IconDisplayMode>('symbols');
  const [trustBarEnabled, setTrustBarEnabled] = useState(true);
  const [trustBarPosition, setTrustBarPosition] = useState<TrustBarPosition>('top');
  const [trustBarSize, setTrustBarSize] = useState(2);

  useEffect(() => {
    init();
  }, []);

  async function init() {
    // Load settings
    const settings = await browser.runtime.sendMessage({ type: 'GET_SETTINGS' }) as ExtensionSettings;
    if (settings?.iconDisplayMode) {
      setIconDisplayMode(settings.iconDisplayMode);
    }
    if (settings?.trustBarEnabled !== undefined) {
      setTrustBarEnabled(settings.trustBarEnabled);
      setTrustBarPosition(settings.trustBarPosition);
      setTrustBarSize(settings.trustBarSize);
    }

    // Get auth state
    const storedAuth = await browser.runtime.sendMessage({ type: 'GET_AUTH' }) as StoredAuth | null;
    if (!storedAuth) {
      setView('login');
      return;
    }
    setAuth(storedAuth);

    // Get active tab domain
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url) {
      setView('not-scanned');
      return;
    }

    try {
      const url = new URL(tab.url);
      if (!url.protocol.startsWith('http')) {
        setDomain(url.hostname || 'N/A');
        setView('not-scanned');
        return;
      }
      setDomain(url.hostname);
      await fetchLookup(url.hostname);
    } catch {
      setView('not-scanned');
    }
  }

  async function fetchLookup(domainToLookup: string) {
    const data = await browser.runtime.sendMessage({
      type: 'GET_LOOKUP',
      domain: domainToLookup,
    }) as LookupResponse & { error?: string };

    if (!data.success) {
      if ((data as { error?: string }).error === 'Session expired') {
        setAuth(null);
        setView('login');
      } else {
        setError((data as { error?: string }).error || 'Lookup failed');
        setView('not-scanned');
      }
      return;
    }

    setLookupData(data);

    if (data.runningScan) {
      setRunningScan(data.runningScan);
      setView('progress');
      startPolling(domainToLookup, data.runningScan.scanId);
    } else if (data.scan) {
      setView('score');
    } else {
      setView('not-scanned');
    }
  }

  function startPolling(pollingDomain: string, scanId: string) {
    const interval = setInterval(async () => {
      // Invalidate cache so we get fresh data
      await browser.runtime.sendMessage({
        type: 'INVALIDATE_CACHE',
        domain: pollingDomain,
      });

      const data = await browser.runtime.sendMessage({
        type: 'GET_LOOKUP',
        domain: pollingDomain,
      }) as LookupResponse;

      if (data.success) {
        setLookupData(data);
        if (data.scan && !data.runningScan) {
          // Scan complete
          clearInterval(interval);
          setRunningScan(null);
          setView('score');
        } else if (data.runningScan) {
          setRunningScan(data.runningScan);
        }
      }
    }, 3000);

    // Clean up on unmount (popup close)
    return () => clearInterval(interval);
  }

  async function handleLogin(email: string, password: string) {
    setError('');
    const response = await browser.runtime.sendMessage({
      type: 'LOGIN',
      email,
      password,
    }) as { success: boolean; error?: string; user?: StoredAuth['user']; tokens?: { accessToken: string; refreshToken: string } };

    if (response.success) {
      setAuth({
        accessToken: response.tokens!.accessToken,
        refreshToken: response.tokens!.refreshToken,
        user: response.user!,
      });

      // Fetch lookup for current domain
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (tab?.url) {
        try {
          const url = new URL(tab.url);
          if (url.protocol.startsWith('http')) {
            setDomain(url.hostname);
            await fetchLookup(url.hostname);
            return;
          }
        } catch {
          // ignore
        }
      }
      setView('not-scanned');
    } else {
      setError(response.error || 'Login failed');
    }
  }

  async function handleLogout() {
    await browser.runtime.sendMessage({ type: 'LOGOUT' });
    setAuth(null);
    setLookupData(null);
    setView('login');
  }

  async function handleScan() {
    setError('');
    const result = await browser.runtime.sendMessage({
      type: 'TRIGGER_SCAN',
      domain,
    }) as { success: boolean; scan?: { id: string }; scanId?: string; error?: string };

    const scanId = result.scan?.id || result.scanId;
    if (result.success && scanId) {
      setRunningScan({ scanId, status: 'queued', createdAt: new Date().toISOString() });
      setView('progress');
      startPolling(domain, scanId);
    } else {
      setError(result.error || 'Failed to start scan');
    }
  }

  async function handleRescan() {
    setError('');
    const result = await browser.runtime.sendMessage({
      type: 'TRIGGER_RESCAN',
      domain,
    }) as { success: boolean; scan?: { id: string }; scanId?: string; error?: string };

    const scanId = result.scan?.id || result.scanId;
    if (result.success && scanId) {
      setRunningScan({ scanId, status: 'queued', createdAt: new Date().toISOString() });
      setView('progress');
      startPolling(domain, scanId);
    } else {
      setError(result.error || 'Failed to start rescan');
    }
  }

  async function handleOpenAccount() {
    await openWebPage('/profile');
  }

  async function handleViewScan() {
    const scanId = runningScan?.scanId;
    if (!scanId) return;
    await openWebPage(`/scan/${scanId}`);
  }

  async function openWebPage(path: string) {
    const result = await browser.runtime.sendMessage({
      type: 'GET_WEB_LOGIN_URL',
      redirect: path,
    }) as { success: boolean; url?: string };

    if (result.success && result.url) {
      console.log(`[SiteRay] openWebPage: redirect="${path}", url="${result.url}"`);
      browser.tabs.create({ url: result.url });
    } else {
      const fallback = `${CONFIG.WEB_BASE_URL}${path}`;
      console.log(`[SiteRay] openWebPage fallback: "${fallback}"`);
      browser.tabs.create({ url: fallback });
    }
  }

  async function handleChangeIconMode(mode: IconDisplayMode) {
    setIconDisplayMode(mode);
    await browser.runtime.sendMessage({
      type: 'SET_SETTINGS',
      settings: { iconDisplayMode: mode, trustBarEnabled, trustBarPosition, trustBarSize },
    });
  }

  async function handleChangeTrustBar(enabled: boolean, position: TrustBarPosition, size: number) {
    setTrustBarEnabled(enabled);
    setTrustBarPosition(position);
    setTrustBarSize(size);
    await browser.runtime.sendMessage({
      type: 'SET_SETTINGS',
      settings: { iconDisplayMode, trustBarEnabled: enabled, trustBarPosition: position, trustBarSize: size },
    });
    await browser.runtime.sendMessage({ type: 'BAR_SETTINGS_CHANGED' });
  }

  if (view === 'loading') {
    return (
      <div>
        <Header />
        <div class="content" style={{ alignItems: 'center', padding: '32px 16px' }}>
          <div class="spinner" />
        </div>
      </div>
    );
  }

  if (view === 'login') {
    return (
      <div>
        <Header />
        <LoginView onLogin={handleLogin} error={error} />
      </div>
    );
  }

  return (
    <div>
      <Header />
      {error && <div class="content"><div class="error">{error}</div></div>}
      {view === 'score' && lookupData?.scan && (
        <ScoreView
          scan={lookupData.scan}
          domain={domain}
          onRescan={handleRescan}
          onViewReport={() => openWebPage(`/scan/${lookupData.scan!.id}`)}
        />
      )}
      {view === 'not-scanned' && (
        <NotScannedView domain={domain} onScan={handleScan} />
      )}
      {view === 'progress' && (
        <ProgressView domain={domain} runningScan={runningScan} onViewScan={handleViewScan} />
      )}
      {showSettings && (
        <SettingsView
          iconDisplayMode={iconDisplayMode}
          onChangeMode={handleChangeIconMode}
          trustBarEnabled={trustBarEnabled}
          trustBarPosition={trustBarPosition}
          trustBarSize={trustBarSize}
          onChangeTrustBar={handleChangeTrustBar}
          onClose={() => setShowSettings(false)}
        />
      )}
      <div class="footer">
        <span class="footer-user">{auth?.user.email}</span>
        <div class="header-actions">
          <button
            class="btn btn-ghost btn-sm"
            onClick={() => setShowSettings(!showSettings)}
            title="Icon display settings"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
            </svg>
          </button>
          <button class="btn btn-ghost btn-sm" onClick={handleOpenAccount}>Account</button>
          <button class="btn btn-ghost btn-sm" onClick={handleLogout}>Logout</button>
        </div>
      </div>
    </div>
  );
}
