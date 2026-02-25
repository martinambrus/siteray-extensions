declare const __IS_DEV__: boolean;
const IS_DEV = __IS_DEV__;

export const CONFIG = {
  API_BASE_URL: IS_DEV ? 'http://localhost:3001' : 'https://api.siteray.eu',
  WEB_BASE_URL: IS_DEV ? 'http://localhost:3000' : 'https://siteray.eu',
  CACHE_TTL_MS: 5 * 60 * 1000, // 5 minutes
} as const;
