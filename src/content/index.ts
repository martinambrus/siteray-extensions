import browser from 'webextension-polyfill';
import type { ContentMessage, TrustBarData } from '../common/types';

const BAR_ID = 'siteray-trust-bar';
const COLORS: Record<string, string> = {
  green: '#22c55e',
  yellow: '#eab308',
  red: '#ef4444',
};

let barHost: HTMLElement | null = null;
let barElement: HTMLElement | null = null;

function createBar(): { host: HTMLElement; bar: HTMLElement } {
  const host = document.createElement('div');
  host.id = BAR_ID;
  host.style.cssText = 'all: initial; position: fixed; z-index: 2147483647; pointer-events: none; left: 0; right: 0;';

  const shadow = host.attachShadow({ mode: 'closed' });

  const bar = document.createElement('div');
  bar.style.cssText = 'width: 100%; transition: background-color 0.3s ease, height 0.3s ease, top 0.2s ease, bottom 0.2s ease;';
  shadow.appendChild(bar);

  document.documentElement.appendChild(host);
  return { host, bar };
}

function updateBar(data: TrustBarData | null): void {
  if (!data || !data.enabled) {
    removeBar();
    return;
  }

  if (!barHost || !barElement || !document.documentElement.contains(barHost)) {
    const created = createBar();
    barHost = created.host;
    barElement = created.bar;
  }

  const color = COLORS[data.riskLevel] || COLORS.green;
  barElement.style.backgroundColor = color;
  barElement.style.height = `${data.size}px`;

  if (data.position === 'top') {
    barHost.style.top = '0';
    barHost.style.bottom = 'auto';
  } else {
    barHost.style.top = 'auto';
    barHost.style.bottom = '0';
  }
}

function removeBar(): void {
  if (barHost && document.documentElement.contains(barHost)) {
    barHost.remove();
  }
  barHost = null;
  barElement = null;
}

// Listen for messages from background
browser.runtime.onMessage.addListener((message: unknown) => {
  const msg = message as ContentMessage;
  if (msg.type === 'UPDATE_BAR') {
    updateBar(msg.data);
  }
});

// Request bar data on load
browser.runtime.sendMessage({ type: 'GET_BAR_DATA', domain: location.hostname }).then(
  (data) => {
    if (data) {
      updateBar(data as TrustBarData);
    }
  },
  () => {
    // Background not ready or extension context invalidated
  },
);
