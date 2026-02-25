import { useState, useEffect } from 'preact/hooks';
import browser from 'webextension-polyfill';
import type { ExtensionSettings, TrustBarPosition } from '../common/types';

const BAR_COLORS = {
  green: '#22c55e',
  yellow: '#eab308',
  red: '#ef4444',
};

export function OnboardingApp() {
  const [enabled, setEnabled] = useState(true);
  const [position, setPosition] = useState<TrustBarPosition>('top');
  const [size, setSize] = useState(2);
  const [previewColor, setPreviewColor] = useState<'green' | 'yellow' | 'red'>('green');

  useEffect(() => {
    browser.runtime.sendMessage({ type: 'GET_SETTINGS' }).then((settings) => {
      const s = settings as ExtensionSettings;
      if (s) {
        setEnabled(s.trustBarEnabled);
        setPosition(s.trustBarPosition);
        setSize(s.trustBarSize);
      }
    });
  }, []);

  // Cycle preview color every 2s
  useEffect(() => {
    const colors: Array<'green' | 'yellow' | 'red'> = ['green', 'yellow', 'red'];
    let i = 0;
    const interval = setInterval(() => {
      i = (i + 1) % colors.length;
      setPreviewColor(colors[i]);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  async function saveSettings(newEnabled: boolean, newPosition: TrustBarPosition, newSize: number) {
    setEnabled(newEnabled);
    setPosition(newPosition);
    setSize(newSize);

    const current = await browser.runtime.sendMessage({ type: 'GET_SETTINGS' }) as ExtensionSettings;
    await browser.runtime.sendMessage({
      type: 'SET_SETTINGS',
      settings: { ...current, trustBarEnabled: newEnabled, trustBarPosition: newPosition, trustBarSize: newSize },
    });
  }

  function handleDone() {
    window.close();
  }

  const barStyle: Record<string, string> = {
    position: 'absolute',
    left: '0',
    right: '0',
    height: `${size}px`,
    backgroundColor: enabled ? BAR_COLORS[previewColor] : 'transparent',
    transition: 'background-color 0.3s ease, height 0.3s ease',
  };

  if (position === 'top') {
    barStyle.top = '30px'; // below address bar
  } else {
    barStyle.bottom = '0';
  }

  return (
    <div>
      <div class="onboarding-header">
        <div class="onboarding-title">Welcome to SiteRay</div>
        <div class="onboarding-subtitle">
          SiteRay shows a colored trust bar on every website you visit so you can see at a glance if a site is safe.
        </div>
      </div>

      <div class="onboarding-section">
        <div class="section-title">Live Preview</div>
        <div class="preview-frame">
          <div class="preview-address-bar">example.com</div>
          <div style={barStyle} />
          <div class="preview-content">
            Page content appears here...
          </div>
        </div>
        <div class="section-desc">
          Green = trusted, Yellow = caution, Red = risky. The bar updates automatically as you browse.
        </div>
      </div>

      <div class="onboarding-section">
        <div class="option-label">Trust Bar</div>
        <div class="options-row">
          <button
            class={`option-btn ${enabled ? 'active' : ''}`}
            onClick={() => saveSettings(true, position, size)}
          >
            On
          </button>
          <button
            class={`option-btn ${!enabled ? 'active' : ''}`}
            onClick={() => saveSettings(false, position, size)}
          >
            Off
          </button>
        </div>

        {enabled && (
          <>
            <div class="option-label">Position</div>
            <div class="options-row">
              <button
                class={`option-btn ${position === 'top' ? 'active' : ''}`}
                onClick={() => saveSettings(true, 'top', size)}
              >
                Top
              </button>
              <button
                class={`option-btn ${position === 'bottom' ? 'active' : ''}`}
                onClick={() => saveSettings(true, 'bottom', size)}
              >
                Bottom
              </button>
            </div>

            <div class="option-label">Size</div>
            <div class="options-row">
              {[1, 2, 3, 4].map((s) => (
                <button
                  key={s}
                  class={`option-btn ${size === s ? 'active' : ''}`}
                  onClick={() => saveSettings(true, position, s)}
                >
                  {s}px
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <button class="done-btn" onClick={handleDone}>Got it</button>
    </div>
  );
}
