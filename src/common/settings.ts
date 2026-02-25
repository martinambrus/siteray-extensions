import browser from 'webextension-polyfill';
import type { ExtensionSettings } from './types';

const STORAGE_KEY = 'extensionSettings';

const DEFAULT_SETTINGS: ExtensionSettings = {
  iconDisplayMode: 'symbols',
  trustBarEnabled: true,
  trustBarPosition: 'top',
  trustBarSize: 2,
};

export async function getSettings(): Promise<ExtensionSettings> {
  const result = await browser.storage.local.get(STORAGE_KEY);
  const stored = result[STORAGE_KEY] as ExtensionSettings | undefined;
  return stored ? { ...DEFAULT_SETTINGS, ...stored } : DEFAULT_SETTINGS;
}

export async function saveSettings(settings: ExtensionSettings): Promise<void> {
  await browser.storage.local.set({ [STORAGE_KEY]: settings });
}
