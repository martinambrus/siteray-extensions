import browser from 'webextension-polyfill';
import type { StoredAuth, User } from './types';

const STORAGE_KEYS = {
  ACCESS_TOKEN: 'accessToken',
  REFRESH_TOKEN: 'refreshToken',
  USER: 'user',
} as const;

export async function getStoredAuth(): Promise<StoredAuth | null> {
  const result = await browser.storage.local.get([
    STORAGE_KEYS.ACCESS_TOKEN,
    STORAGE_KEYS.REFRESH_TOKEN,
    STORAGE_KEYS.USER,
  ]);

  if (!result[STORAGE_KEYS.ACCESS_TOKEN] || !result[STORAGE_KEYS.REFRESH_TOKEN] || !result[STORAGE_KEYS.USER]) {
    return null;
  }

  return {
    accessToken: result[STORAGE_KEYS.ACCESS_TOKEN] as string,
    refreshToken: result[STORAGE_KEYS.REFRESH_TOKEN] as string,
    user: result[STORAGE_KEYS.USER] as User,
  };
}

export async function storeAuth(auth: StoredAuth): Promise<void> {
  await browser.storage.local.set({
    [STORAGE_KEYS.ACCESS_TOKEN]: auth.accessToken,
    [STORAGE_KEYS.REFRESH_TOKEN]: auth.refreshToken,
    [STORAGE_KEYS.USER]: auth.user,
  });
}

export async function updateTokens(accessToken: string, refreshToken: string): Promise<void> {
  await browser.storage.local.set({
    [STORAGE_KEYS.ACCESS_TOKEN]: accessToken,
    [STORAGE_KEYS.REFRESH_TOKEN]: refreshToken,
  });
}

export async function clearAuth(): Promise<void> {
  await browser.storage.local.remove([
    STORAGE_KEYS.ACCESS_TOKEN,
    STORAGE_KEYS.REFRESH_TOKEN,
    STORAGE_KEYS.USER,
  ]);
}
